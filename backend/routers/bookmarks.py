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
from integrations.semantic_scholar import SemanticScholarRateLimitError, get_s2_client

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================

class BookmarkCreate(BaseModel):
    paper_id: str
    tags: List[str] = []
    memo: str = ""
    paper_title: Optional[str] = None
    paper_authors: List[str] = []
    paper_year: Optional[int] = None
    paper_venue: Optional[str] = None
    paper_citation_count: int = 0


class BookmarkUpdate(BaseModel):
    tags: Optional[List[str]] = None
    memo: Optional[str] = None
    paper_title: Optional[str] = None
    paper_authors: Optional[List[str]] = None
    paper_year: Optional[int] = None
    paper_venue: Optional[str] = None
    paper_citation_count: Optional[int] = None


class BookmarkResponse(BaseModel):
    id: str
    paper_id: str
    tags: List[str]
    memo: str
    paper_title: Optional[str] = None
    paper_authors: List[str]
    paper_year: Optional[int] = None
    paper_venue: Optional[str] = None
    paper_citation_count: int = 0
    created_at: str
    updated_at: str


def _bookmark_response_from_row(row) -> BookmarkResponse:
    return BookmarkResponse(
        id=str(row["id"]),
        paper_id=row["paper_id"],
        tags=row["tags"] or [],
        memo=row["memo"] or "",
        paper_title=row["paper_title"],
        paper_authors=row["paper_authors"] or [],
        paper_year=row["paper_year"],
        paper_venue=row["paper_venue"],
        paper_citation_count=row["paper_citation_count"] or 0,
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


def _strip_doi_prefix(paper_id: str) -> Optional[str]:
    if paper_id.upper().startswith("DOI:"):
        return paper_id[4:]
    return None


async def _enrich_bookmark_metadata(row, user: User, db: Database) -> BookmarkResponse:
    if row["paper_title"]:
        return _bookmark_response_from_row(row)

    paper_id = row["paper_id"]
    metadata = None

    try:
        metadata_row = await db.fetchrow(
            """
            SELECT title, authors, year, venue, citation_count
            FROM papers
            WHERE id::text = $1
               OR s2_paper_id = $1
               OR doi = $1
               OR doi = $2
            LIMIT 1
            """,
            paper_id,
            _strip_doi_prefix(paper_id),
        )
        if metadata_row:
            metadata = {
                "paper_title": metadata_row["title"],
                "paper_authors": [
                    author.get("name")
                    for author in (metadata_row["authors"] or [])
                    if isinstance(author, dict) and author.get("name")
                ],
                "paper_year": metadata_row["year"],
                "paper_venue": metadata_row["venue"],
                "paper_citation_count": metadata_row["citation_count"] or 0,
            }
    except Exception as exc:
        logger.warning(f"Bookmark DB metadata lookup failed for {paper_id}: {exc}")

    if metadata is None:
        try:
            paper = await get_s2_client().get_paper(paper_id)
            if paper:
                metadata = {
                    "paper_title": paper.title,
                    "paper_authors": [
                        author.get("name")
                        for author in (paper.authors or [])
                        if isinstance(author, dict) and author.get("name")
                    ],
                    "paper_year": paper.year,
                    "paper_venue": paper.venue,
                    "paper_citation_count": paper.citation_count or 0,
                }
        except SemanticScholarRateLimitError:
            logger.info(f"Bookmark metadata backfill rate limited for {paper_id}")
        except Exception as exc:
            logger.warning(f"Bookmark provider metadata lookup failed for {paper_id}: {exc}")

    if metadata is None:
        return _bookmark_response_from_row(row)

    await db.execute(
        """
        UPDATE paper_bookmarks
        SET paper_title = $1,
            paper_authors = $2,
            paper_year = $3,
            paper_venue = $4,
            paper_citation_count = $5,
            updated_at = NOW()
        WHERE id = $6 AND user_id = $7
        """,
        metadata["paper_title"],
        metadata["paper_authors"],
        metadata["paper_year"],
        metadata["paper_venue"],
        metadata["paper_citation_count"],
        UUID(str(row["id"])),
        UUID(user.id),
    )

    merged = {
        "id": row["id"],
        "paper_id": row["paper_id"],
        "tags": row["tags"],
        "memo": row["memo"],
        "paper_title": metadata["paper_title"],
        "paper_authors": metadata["paper_authors"],
        "paper_year": metadata["paper_year"],
        "paper_venue": metadata["paper_venue"],
        "paper_citation_count": metadata["paper_citation_count"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    return _bookmark_response_from_row(merged)


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
        INSERT INTO paper_bookmarks (
            user_id, paper_id, tags, memo,
            paper_title, paper_authors, paper_year, paper_venue, paper_citation_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, paper_id) DO UPDATE SET
            tags = $3,
            memo = $4,
            paper_title = COALESCE($5, paper_bookmarks.paper_title),
            paper_authors = CASE
                WHEN array_length($6::text[], 1) IS NOT NULL THEN $6
                ELSE paper_bookmarks.paper_authors
            END,
            paper_year = COALESCE($7, paper_bookmarks.paper_year),
            paper_venue = COALESCE($8, paper_bookmarks.paper_venue),
            paper_citation_count = COALESCE($9, paper_bookmarks.paper_citation_count),
            updated_at = NOW()
        RETURNING
            id, paper_id, tags, memo,
            paper_title, paper_authors, paper_year, paper_venue, paper_citation_count,
            created_at, updated_at
        """,
        UUID(user.id),
        request.paper_id,
        request.tags,
        request.memo,
        request.paper_title,
        request.paper_authors,
        request.paper_year,
        request.paper_venue,
        request.paper_citation_count,
    )

    return _bookmark_response_from_row(row)


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
            SELECT
                id, paper_id, tags, memo,
                paper_title, paper_authors, paper_year, paper_venue, paper_citation_count,
                created_at, updated_at
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
            SELECT
                id, paper_id, tags, memo,
                paper_title, paper_authors, paper_year, paper_venue, paper_citation_count,
                created_at, updated_at
            FROM paper_bookmarks
            WHERE user_id = $1
            ORDER BY updated_at DESC
            """,
            UUID(user.id),
        )

    return [await _enrich_bookmark_metadata(row, user, db) for row in rows]


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
        SELECT
            id, paper_id, tags, memo,
            paper_title, paper_authors, paper_year, paper_venue, paper_citation_count,
            created_at, updated_at
        FROM paper_bookmarks
        WHERE user_id = $1 AND paper_id = $2
        """,
        UUID(user.id),
        paper_id,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    return await _enrich_bookmark_metadata(row, user, db)


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

    if request.paper_title is not None:
        updates.append(f"paper_title = ${param_idx}")
        params.append(request.paper_title)
        param_idx += 1

    if request.paper_authors is not None:
        updates.append(f"paper_authors = ${param_idx}")
        params.append(request.paper_authors)
        param_idx += 1

    if request.paper_year is not None:
        updates.append(f"paper_year = ${param_idx}")
        params.append(request.paper_year)
        param_idx += 1

    if request.paper_venue is not None:
        updates.append(f"paper_venue = ${param_idx}")
        params.append(request.paper_venue)
        param_idx += 1

    if request.paper_citation_count is not None:
        updates.append(f"paper_citation_count = ${param_idx}")
        params.append(request.paper_citation_count)
        param_idx += 1

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = NOW()")

    query = f"""
        UPDATE paper_bookmarks
        SET {', '.join(updates)}
        WHERE id = ${param_idx} AND user_id = ${param_idx + 1}
        RETURNING
            id, paper_id, tags, memo,
            paper_title, paper_authors, paper_year, paper_venue, paper_citation_count,
            created_at, updated_at
    """
    params.extend([UUID(bookmark_id), UUID(user.id)])

    row = await db.fetchrow(query, *params)

    return _bookmark_response_from_row(row)


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
