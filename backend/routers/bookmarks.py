"""
Bookmarks router for ScholarGraph3D.

CRUD for user paper bookmarks with tags and memos. All endpoints require authentication.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.dependencies import get_current_user
from auth.models import User
from database import Database, get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================

class BookmarkCreate(BaseModel):
    paper_id: str
    tags: List[str] = []
    memo: str = ""


class BookmarkUpdate(BaseModel):
    tags: Optional[List[str]] = None
    memo: Optional[str] = None


class BookmarkResponse(BaseModel):
    id: str
    paper_id: str
    tags: List[str]
    memo: str
    created_at: str
    updated_at: str


# ==================== Endpoints ====================

@router.post("/api/bookmarks", response_model=BookmarkResponse, status_code=201)
async def upsert_bookmark(
    request: BookmarkCreate,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Create or update a bookmark for a paper."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    row = await db.fetchrow(
        """
        INSERT INTO paper_bookmarks (user_id, paper_id, tags, memo)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, paper_id) DO UPDATE SET tags = $3, memo = $4, updated_at = NOW()
        RETURNING id, paper_id, tags, memo, created_at, updated_at
        """,
        UUID(user.id),
        request.paper_id,
        request.tags,
        request.memo,
    )

    return BookmarkResponse(
        id=str(row["id"]),
        paper_id=row["paper_id"],
        tags=row["tags"] or [],
        memo=row["memo"] or "",
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.get("/api/bookmarks", response_model=List[BookmarkResponse])
async def list_bookmarks(
    tag: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List all bookmarks for the current user, optionally filtered by tag."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    if tag is not None:
        rows = await db.fetch(
            """
            SELECT id, paper_id, tags, memo, created_at, updated_at
            FROM paper_bookmarks
            WHERE user_id = $1 AND $2 = ANY(tags)
            ORDER BY updated_at DESC
            """,
            UUID(user.id),
            tag,
        )
    else:
        rows = await db.fetch(
            """
            SELECT id, paper_id, tags, memo, created_at, updated_at
            FROM paper_bookmarks
            WHERE user_id = $1
            ORDER BY updated_at DESC
            """,
            UUID(user.id),
        )

    return [
        BookmarkResponse(
            id=str(row["id"]),
            paper_id=row["paper_id"],
            tags=row["tags"] or [],
            memo=row["memo"] or "",
            created_at=row["created_at"].isoformat(),
            updated_at=row["updated_at"].isoformat(),
        )
        for row in rows
    ]


@router.get("/api/bookmarks/paper/{paper_id}", response_model=BookmarkResponse)
async def get_bookmark_by_paper(
    paper_id: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Get the bookmark for a specific paper."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    row = await db.fetchrow(
        """
        SELECT id, paper_id, tags, memo, created_at, updated_at
        FROM paper_bookmarks
        WHERE user_id = $1 AND paper_id = $2
        """,
        UUID(user.id),
        paper_id,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    return BookmarkResponse(
        id=str(row["id"]),
        paper_id=row["paper_id"],
        tags=row["tags"] or [],
        memo=row["memo"] or "",
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.put("/api/bookmarks/{bookmark_id}", response_model=BookmarkResponse)
async def update_bookmark(
    bookmark_id: str,
    request: BookmarkUpdate,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Update tags and/or memo for a bookmark."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify ownership
    existing = await db.fetchrow(
        "SELECT id FROM paper_bookmarks WHERE id = $1 AND user_id = $2",
        UUID(bookmark_id),
        UUID(user.id),
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    # Build dynamic update
    updates = []
    params = []
    param_idx = 1

    if request.tags is not None:
        updates.append(f"tags = ${param_idx}")
        params.append(request.tags)
        param_idx += 1

    if request.memo is not None:
        updates.append(f"memo = ${param_idx}")
        params.append(request.memo)
        param_idx += 1

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = NOW()")

    query = f"""
        UPDATE paper_bookmarks
        SET {', '.join(updates)}
        WHERE id = ${param_idx} AND user_id = ${param_idx + 1}
        RETURNING id, paper_id, tags, memo, created_at, updated_at
    """
    params.extend([UUID(bookmark_id), UUID(user.id)])

    row = await db.fetchrow(query, *params)

    return BookmarkResponse(
        id=str(row["id"]),
        paper_id=row["paper_id"],
        tags=row["tags"] or [],
        memo=row["memo"] or "",
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.delete("/api/bookmarks/{bookmark_id}", status_code=204)
async def delete_bookmark(
    bookmark_id: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Delete a bookmark."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    result = await db.execute(
        "DELETE FROM paper_bookmarks WHERE id = $1 AND user_id = $2",
        UUID(bookmark_id),
        UUID(user.id),
    )

    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Bookmark not found")
