"""
Watch query router for ScholarGraph3D.

CRUD for watch queries (saved search alerts with email notifications)
and cron trigger endpoint for weekly digest execution.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from auth.dependencies import get_current_user
from auth.models import User
from config import settings
from database import Database, get_db
from services.watch_service import WatchService

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================


class WatchQueryCreate(BaseModel):
    """Request body for creating a watch query."""

    query: str = Field(..., min_length=1, max_length=500, description="Search query text")
    filters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional filters: {year, field, venue}",
    )
    notify_email: bool = Field(
        default=True,
        description="Whether to send email notifications for new papers",
    )


class WatchQueryUpdate(BaseModel):
    """Request body for updating a watch query."""

    query: Optional[str] = Field(default=None, min_length=1, max_length=500)
    filters: Optional[Dict[str, Any]] = None
    notify_email: Optional[bool] = None


class WatchQueryResponse(BaseModel):
    """Response model for a watch query."""

    id: str
    user_id: str
    query: str
    filters: Optional[Dict[str, Any]] = None
    notify_email: bool = True
    last_checked: Optional[str] = None
    created_at: str
    new_paper_count: int = 0


class WatchCheckResult(BaseModel):
    """Response model for a watch check trigger."""

    total_queries: int
    new_papers_found: int
    new_papers: int = 0  # alias for new_papers_found for frontend compatibility
    emails_sent: int


class CronResult(BaseModel):
    """Response model for the cron trigger endpoint."""

    total_queries: int
    new_papers_found: int
    emails_sent: int


# ==================== Endpoints ====================


@router.get("/api/watch", response_model=List[WatchQueryResponse])
async def list_watch_queries(
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List all watch queries for the current user."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    svc = WatchService(db)
    queries = await svc.list_watch_queries(user.id)

    return [
        WatchQueryResponse(
            id=q["id"],
            user_id=q["user_id"],
            query=q["query"],
            filters=q.get("filters"),
            notify_email=q.get("notify_email", True),
            last_checked=q.get("last_checked"),
            created_at=q["created_at"],
        )
        for q in queries
    ]


@router.post("/api/watch", response_model=WatchQueryResponse, status_code=201)
async def create_watch_query(
    request: WatchQueryCreate,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """
    Create a new watch query.

    The query will be periodically checked against OpenAlex for new papers.
    If notify_email is True, a digest email will be sent when new papers are found.
    """
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    svc = WatchService(db)
    q = await svc.create_watch_query(
        user_id=user.id,
        query=request.query,
        filters=request.filters,
        notify_email=request.notify_email,
    )

    return WatchQueryResponse(
        id=q["id"],
        user_id=q["user_id"],
        query=q["query"],
        filters=q.get("filters"),
        notify_email=q.get("notify_email", True),
        last_checked=q.get("last_checked"),
        created_at=q["created_at"],
    )


@router.put("/api/watch/{watch_id}", response_model=WatchQueryResponse)
async def update_watch_query(
    watch_id: str,
    request: WatchQueryUpdate,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Update a watch query's filters or notification settings."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    updates = {}
    if request.query is not None:
        updates["query"] = request.query
    if request.filters is not None:
        updates["filters"] = request.filters
    if request.notify_email is not None:
        updates["notify_email"] = request.notify_email

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    svc = WatchService(db)
    q = await svc.update_watch_query(user.id, watch_id, updates)

    if not q:
        raise HTTPException(status_code=404, detail="Watch query not found")

    return WatchQueryResponse(
        id=q["id"],
        user_id=q["user_id"],
        query=q["query"],
        filters=q.get("filters"),
        notify_email=q.get("notify_email", True),
        last_checked=q.get("last_checked"),
        created_at=q["created_at"],
    )


@router.delete("/api/watch/{watch_id}", status_code=204)
async def delete_watch_query(
    watch_id: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Delete a watch query."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    svc = WatchService(db)
    deleted = await svc.delete_watch_query(user.id, watch_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Watch query not found")


@router.post("/api/watch/check", response_model=WatchCheckResult)
async def trigger_watch_check(
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """
    Manually trigger a watch query check for the current user.

    Useful for testing. Checks all of the user's watch queries
    regardless of last_checked timestamp.
    """
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    svc = WatchService(db)
    queries = await svc.list_watch_queries(user.id)

    total_new = 0
    for q in queries:
        try:
            new_papers = await svc.check_watch_query(q)
            total_new += len(new_papers)
        except Exception as e:
            logger.error(f"Watch check failed for query {q.get('id')}: {e}")

    return WatchCheckResult(
        total_queries=len(queries),
        new_papers_found=total_new,
        new_papers=total_new,
        emails_sent=0,  # Manual check does not send emails
    )


@router.post("/api/watch/cron", response_model=CronResult)
async def cron_trigger(
    db: Database = Depends(get_db),
    x_cron_secret: Optional[str] = Header(default=None),
):
    """
    Cron endpoint for weekly watch query execution.

    Called by Supabase pg_cron or an external scheduler.
    Protected by X-Cron-Secret header.

    Executes all pending watch queries (not checked in 7+ days)
    and sends email digest notifications via Resend.
    """
    # Authenticate cron request
    expected_secret = getattr(settings, "watch_cron_secret", "")
    if not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cron endpoint not configured (WATCH_CRON_SECRET not set)",
        )

    if x_cron_secret != expected_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid cron secret",
        )

    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    svc = WatchService(db)
    result = await svc.execute_all_pending()

    return CronResult(
        total_queries=result["total_queries"],
        new_papers_found=result["new_papers_found"],
        emails_sent=result["emails_sent"],
    )
