"""
ScholarGraph3D FastAPI Backend

3D academic paper graph visualization powered by SPECTER2 embeddings,
UMAP dimensionality reduction, and HDBSCAN clustering.
"""

import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import db, init_db, close_db
from auth.supabase_client import supabase_client
from auth.middleware import AuthMiddleware
from routers import search, papers, graphs, analysis, chat

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

    # Log API configuration
    logger.info(f"  S2 API Key: {'configured' if settings.s2_api_key else 'not set (unauthenticated)'}")
    logger.info(f"  OA Email: {settings.oa_email or 'not set (no polite pool)'}")
    logger.info(f"  OA API Key: {'configured' if settings.oa_api_key else 'not set (free tier)'}")

    yield

    # Shutdown
    logger.info("ScholarGraph3D Backend shutting down...")
    await close_db()


app = FastAPI(
    title="ScholarGraph3D API",
    description="3D academic paper graph visualization with SPECTER2 embeddings",
    version="0.1.0",
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# ==================== Routers ====================

app.include_router(search.router, tags=["Search"])
app.include_router(papers.router, tags=["Papers"])
app.include_router(graphs.router, tags=["Graphs"])
app.include_router(analysis.router, tags=["Analysis"])
app.include_router(chat.router, tags=["Chat"])


# ==================== Health Endpoints ====================

@app.get("/")
async def root():
    """Root endpoint — health check."""
    return {
        "status": "healthy",
        "service": "ScholarGraph3D",
        "version": "0.1.0",
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
        "oa_api": "premium" if settings.oa_api_key else "free",
    }

    if not is_healthy:
        raise HTTPException(status_code=503, detail=response_data)

    return response_data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
