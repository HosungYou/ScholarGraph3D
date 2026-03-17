"""
Recommendation feedback router for ScholarGraph3D.

Stores per-user relevance feedback for suggested next papers so recommendations
can persist across sessions and influence ranking.
"""

from typing import List, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth.dependencies import get_current_user
from auth.models import User
from database import Database, get_db

router = APIRouter()

FeedbackValue = Literal["relevant", "not_now"]


class RecommendationFeedbackUpsert(BaseModel):
    source_paper_id: str = Field(..., min_length=1, max_length=512)
    candidate_paper_id: str = Field(..., min_length=1, max_length=512)
    feedback: FeedbackValue


class RecommendationFeedbackResponse(BaseModel):
    id: str
    source_paper_id: str
    candidate_paper_id: str
    feedback: FeedbackValue
    created_at: str
    updated_at: str


def _response_from_row(row) -> RecommendationFeedbackResponse:
    return RecommendationFeedbackResponse(
        id=str(row["id"]),
        source_paper_id=row["source_paper_id"],
        candidate_paper_id=row["candidate_paper_id"],
        feedback=row["feedback"],
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.get("/api/recommendation-feedback", response_model=List[RecommendationFeedbackResponse])
async def list_recommendation_feedback(
    source_paper_id: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    rows = await db.fetch(
        """
        SELECT id, source_paper_id, candidate_paper_id, feedback, created_at, updated_at
        FROM recommendation_feedback
        WHERE user_id = $1 AND source_paper_id = $2
        ORDER BY updated_at DESC
        """,
        UUID(user.id),
        source_paper_id,
    )
    return [_response_from_row(row) for row in rows]


@router.post("/api/recommendation-feedback", response_model=RecommendationFeedbackResponse, status_code=201)
async def upsert_recommendation_feedback(
    request: RecommendationFeedbackUpsert,
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    row = await db.fetchrow(
        """
        INSERT INTO recommendation_feedback (user_id, source_paper_id, candidate_paper_id, feedback)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, source_paper_id, candidate_paper_id) DO UPDATE SET
            feedback = $4,
            updated_at = NOW()
        RETURNING id, source_paper_id, candidate_paper_id, feedback, created_at, updated_at
        """,
        UUID(user.id),
        request.source_paper_id,
        request.candidate_paper_id,
        request.feedback,
    )
    return _response_from_row(row)


@router.delete("/api/recommendation-feedback", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recommendation_feedback(
    source_paper_id: str = Query(..., min_length=1),
    candidate_paper_id: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    if not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not available")

    result = await db.execute(
        """
        DELETE FROM recommendation_feedback
        WHERE user_id = $1 AND source_paper_id = $2 AND candidate_paper_id = $3
        """,
        UUID(user.id),
        source_paper_id,
        candidate_paper_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Recommendation feedback not found")
