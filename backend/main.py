"""
ScholarGraph3D FastAPI Backend

3D academic paper graph visualization powered by SPECTER2 embeddings,
UMAP dimensionality reduction, and HDBSCAN clustering.
"""

import asyncio
import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import db, init_db, close_db
from integrations.semantic_scholar import init_s2_client, close_s2_client
from auth.supabase_client import supabase_client
from auth.middleware import AuthMiddleware
from routers import papers, graphs, bookmarks
from routers.seed_explore import router as seed_explore_router
from routers.paper_search import router as paper_search_router
from routers.seed_chat import router as seed_chat_router
from routers.gap_report import router as gap_report_router
from routers.academic_report import router as academic_report_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _sanitize_database_url(url: str) -> str:
    """Sanitize database URL for logging by removing credentials."""
    if not url:
        return "<not configured>"
    pattern = r"(://)[^:@]+(?::[^@]+)?(@)"
    return re.sub(pattern, r"\1***:***\2", url)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("ScholarGraph3D Backend starting...")
    logger.info(f"  Environment: {settings.environment}")
    logger.info(f"  Database: {_sanitize_database_url(settings.database_url)}")

    # Initialize Supabase Auth
    supabase_configured = bool(settings.supabase_url and settings.supabase_key)
    if supabase_configured:
        supabase_client.initialize(settings.supabase_url, settings.supabase_key)
        logger.info("  Supabase Auth: configured")
    else:
        logger.warning("  Supabase Auth: NOT configured (running without auth)")

    # Initialize database connection
    try:
        await init_db()
        logger.info("  Database connected successfully")

        if await db.check_pgvector():
            logger.info("  pgvector extension: available")
        else:
            logger.warning("  pgvector extension: NOT available")
    except Exception as e:
        logger.error(f"  Database connection failed: {e}")
        if settings.environment in ("production", "staging"):
            raise RuntimeError(
                f"Database connection failed in {settings.environment} environment"
            ) from e
        logger.warning("  Running in memory-only mode (development only)")

    # Initialize shared S2 client (global rate limiter)
    await init_s2_client(
        api_key=settings.s2_api_key or None,
        requests_per_second=settings.s2_rate_limit,
    )

    # Log API configuration
    logger.info(f"  S2 API Key: {'configured' if settings.s2_api_key else 'not set (unauthenticated)'}")
    logger.info(f"  CORS origins: {_cors_origins}")
    logger.info(f"  CORS regex: {_cors_origin_regex}")

    # Warm up UMAP/Numba JIT kernels before first request.
    # UMAP uses Numba which JIT-compiles on first call (~30s on 0.5 vCPU).
    # Pre-compiling at startup prevents the first seed-explore from timing out.
    async def _warm_up_umap():
        try:
            import numpy as np
            from graph.embedding_reducer import EmbeddingReducer
            dummy = np.random.rand(12, 768).astype(np.float32)
            reducer = EmbeddingReducer()
            await asyncio.to_thread(reducer.reduce_to_3d, dummy)
            logger.info("  UMAP warm-up: complete (Numba JIT kernels compiled)")
        except Exception as e:
            logger.warning(f"  UMAP warm-up failed (non-fatal): {e}")

    asyncio.create_task(_warm_up_umap())

    yield

    # Shutdown
    logger.info("ScholarGraph3D Backend shutting down...")
    await close_s2_client()
    await close_db()


app = FastAPI(
    title="ScholarGraph3D API",
    description="3D academic paper graph visualization with SPECTER2 embeddings",
    version="3.5.1",
    lifespan=lifespan,
)

# ==================== Middleware Stack ====================

# Auth middleware (innermost — added first)
app.add_middleware(AuthMiddleware)

# CORS middleware (outermost — added last, runs first on request)
_cors_origins = settings.cors_origins_list or []
if settings.environment == "development":
    _cors_origins = list(set(_cors_origins + [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]))

# Allow all Vercel preview/production URLs via regex
_cors_origin_regex = r"https://(.*\.vercel\.app|.*\.onrender\.com)"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# ==================== Routers ====================

app.include_router(papers.router, tags=["Papers"])
app.include_router(graphs.router, tags=["Graphs"])
app.include_router(seed_explore_router, tags=["Seed Explore"])
app.include_router(paper_search_router, tags=["Paper Search"])
app.include_router(seed_chat_router, tags=["Seed Chat"])
app.include_router(bookmarks.router, tags=["Bookmarks"])
app.include_router(gap_report_router, tags=["Gap Report"])
app.include_router(academic_report_router, tags=["Academic Report"])


# ==================== Global Exception Handler ====================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Ensure CORS headers are present even on unhandled errors."""
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ==================== Health Endpoints ====================

@app.get("/")
async def root():
    """Root endpoint — health check."""
    return {
        "status": "healthy",
        "service": "ScholarGraph3D",
        "version": "3.5.1",
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    db_status = "disconnected"
    pgvector_status = "unavailable"

    try:
        health = await db.get_health_snapshot()
        if health["db_ok"]:
            db_status = "connected"
        if health["pgvector_ok"]:
            pgvector_status = "available"
    except Exception as e:
        logger.error(f"Health check failed: {e}")

    is_healthy = db_status == "connected"

    response_data = {
        "status": "healthy" if is_healthy else "unhealthy",
        "database": db_status,
        "pgvector": pgvector_status,
        "auth": "configured" if supabase_client.is_configured() else "not configured",
        "environment": settings.environment,
        "s2_api": "authenticated" if settings.s2_api_key else "unauthenticated",
    }

    if not is_healthy:
        raise HTTPException(status_code=503, detail=response_data)

    return response_data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
