"""
Graphs router for ScholarGraph3D.

CRUD for user-saved graph states. All endpoints require authentication.
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth.dependencies import get_current_user
from auth.models import User
from database import Database, get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================

class GraphCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    seed_query: Optional[str] = None
    paper_ids: List[str] = []
    layout_state: Optional[Dict[str, Any]] = None


class GraphUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    paper_ids: Optional[List[str]] = None
    layout_state: Optional[Dict[str, Any]] = None


class GraphSummary(BaseModel):
    id: str
    name: str
    seed_query: Optional[str] = None
    paper_count: int = 0
    created_at: str
    updated_at: str


class GraphDetail(GraphSummary):
    paper_ids: List[str] = []
    layout_state: Optional[Dict[str, Any]] = None


# ==================== Endpoints ====================

@router.get("/api/graphs", response_model=List[GraphSummary])
async def list_graphs(
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List all saved graphs for the current user."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    rows = await db.fetch(
        """
        SELECT id, name, seed_query, paper_ids, created_at, updated_at
        FROM user_graphs
        WHERE user_id = $1
        ORDER BY updated_at DESC
        """,
        UUID(user.id),
    )

    return [
        GraphSummary(
            id=str(row["id"]),
            name=row["name"],
            seed_query=row["seed_query"],
            paper_count=len(row["paper_ids"]) if row["paper_ids"] else 0,
            created_at=row["created_at"].isoformat(),
            updated_at=row["updated_at"].isoformat(),
        )
        for row in rows
    ]


@router.post("/api/graphs", response_model=GraphDetail, status_code=201)
async def create_graph(
    request: GraphCreate,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Save a new graph."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    row = await db.fetchrow(
        """
        INSERT INTO user_graphs (user_id, name, seed_query, paper_ids, layout_state)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, seed_query, paper_ids, layout_state, created_at, updated_at
        """,
        UUID(user.id),
        request.name,
        request.seed_query,
        request.paper_ids,
        request.layout_state,
    )

    return GraphDetail(
        id=str(row["id"]),
        name=row["name"],
        seed_query=row["seed_query"],
        paper_ids=row["paper_ids"] or [],
        paper_count=len(row["paper_ids"]) if row["paper_ids"] else 0,
        layout_state=row["layout_state"],
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.get("/api/graphs/{graph_id}", response_model=GraphDetail)
async def get_graph(
    graph_id: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Load a saved graph."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    row = await db.fetchrow(
        """
        SELECT id, name, seed_query, paper_ids, layout_state, created_at, updated_at
        FROM user_graphs
        WHERE id = $1 AND user_id = $2
        """,
        UUID(graph_id),
        UUID(user.id),
    )

    if not row:
        raise HTTPException(status_code=404, detail="Graph not found")

    return GraphDetail(
        id=str(row["id"]),
        name=row["name"],
        seed_query=row["seed_query"],
        paper_ids=row["paper_ids"] or [],
        paper_count=len(row["paper_ids"]) if row["paper_ids"] else 0,
        layout_state=row["layout_state"],
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.put("/api/graphs/{graph_id}", response_model=GraphDetail)
async def update_graph(
    graph_id: str,
    request: GraphUpdate,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Update a saved graph."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify ownership
    existing = await db.fetchrow(
        "SELECT id FROM user_graphs WHERE id = $1 AND user_id = $2",
        UUID(graph_id),
        UUID(user.id),
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Graph not found")

    # Build dynamic update
    updates = []
    params = []
    param_idx = 1

    if request.name is not None:
        updates.append(f"name = ${param_idx}")
        params.append(request.name)
        param_idx += 1

    if request.paper_ids is not None:
        updates.append(f"paper_ids = ${param_idx}")
        params.append(request.paper_ids)
        param_idx += 1

    if request.layout_state is not None:
        updates.append(f"layout_state = ${param_idx}")
        params.append(request.layout_state)
        param_idx += 1

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = NOW()")

    query = f"""
        UPDATE user_graphs
        SET {', '.join(updates)}
        WHERE id = ${param_idx} AND user_id = ${param_idx + 1}
        RETURNING id, name, seed_query, paper_ids, layout_state, created_at, updated_at
    """
    params.extend([UUID(graph_id), UUID(user.id)])

    row = await db.fetchrow(query, *params)

    return GraphDetail(
        id=str(row["id"]),
        name=row["name"],
        seed_query=row["seed_query"],
        paper_ids=row["paper_ids"] or [],
        paper_count=len(row["paper_ids"]) if row["paper_ids"] else 0,
        layout_state=row["layout_state"],
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.delete("/api/graphs/{graph_id}", status_code=204)
async def delete_graph(
    graph_id: str,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Delete a saved graph."""
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    result = await db.execute(
        "DELETE FROM user_graphs WHERE id = $1 AND user_id = $2",
        UUID(graph_id),
        UUID(user.id),
    )

    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Graph not found")
