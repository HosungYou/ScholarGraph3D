"""
Personalization API router for ScholarGraph3D.

Endpoints:
  GET  /api/user/profile                         — Get user profile + preferences
  PUT  /api/user/profile                         — Update preferences
  POST /api/user/events                          — Log paper interaction
  POST /api/user/search-history                  — Log search
  GET  /api/user/recommendations                 — Get personalized recommendations
  DELETE /api/user/recommendations/{id}/dismiss  — Dismiss a recommendation
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import get_current_user
from auth.models import User
from database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["Personalization"])


# ─── Pydantic Models ────────────────────────────────────────────────────────

class UserProfileResponse(BaseModel):
    user_id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    research_interests: list[str] = []
    preferred_fields: list[str] = []
    default_year_min: Optional[int] = None
    default_year_max: Optional[int] = None
    default_min_citations: int = 0
    preferred_result_count: int = 50
    total_searches: int = 0
    total_papers_viewed: int = 0
    last_active_at: Optional[str] = None
    created_at: str
    updated_at: str


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    research_interests: Optional[list[str]] = None
    preferred_fields: Optional[list[str]] = None
    default_year_min: Optional[int] = None
    default_year_max: Optional[int] = None
    default_min_citations: Optional[int] = None
    preferred_result_count: Optional[int] = None


class InteractionEventRequest(BaseModel):
    paper_id: str
    action: str
    session_id: Optional[str] = None


class SearchHistoryRequest(BaseModel):
    query: str
    mode: str = "keyword"
    result_count: Optional[int] = None
    filters_used: Optional[dict] = None


class RecommendationResponse(BaseModel):
    id: str
    paper_id: str
    score: float
    explanation: Optional[str] = None
    reason_tags: list[str] = []
    is_dismissed: bool = False
    generated_at: str
    expires_at: str
    # Joined paper fields
    title: Optional[str] = None
    authors: Optional[list] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: Optional[int] = None
    abstract: Optional[str] = None
    tldr: Optional[str] = None
    fields: Optional[list[str]] = None


# ─── Helpers ────────────────────────────────────────────────────────────────

async def _get_or_create_profile(user_id: str) -> dict:
    """Get or create user profile, returning row as dict."""
    conn = db.pool
    if conn is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with conn.acquire() as c:
        row = await c.fetchrow(
            "SELECT * FROM user_profiles WHERE user_id = $1",
            uuid.UUID(user_id),
        )
        if row is None:
            row = await c.fetchrow(
                """
                INSERT INTO user_profiles (user_id)
                VALUES ($1)
                RETURNING *
                """,
                uuid.UUID(user_id),
            )
        return dict(row)


# ─── Routes ─────────────────────────────────────────────────────────────────

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(user: User = Depends(get_current_user)):
    """Get user profile and preferences."""
    profile = await _get_or_create_profile(user.id)
    return UserProfileResponse(
        user_id=str(profile["user_id"]),
        display_name=profile.get("display_name"),
        avatar_url=profile.get("avatar_url"),
        research_interests=profile.get("research_interests") or [],
        preferred_fields=profile.get("preferred_fields") or [],
        default_year_min=profile.get("default_year_min"),
        default_year_max=profile.get("default_year_max"),
        default_min_citations=profile.get("default_min_citations") or 0,
        preferred_result_count=profile.get("preferred_result_count") or 50,
        total_searches=profile.get("total_searches") or 0,
        total_papers_viewed=profile.get("total_papers_viewed") or 0,
        last_active_at=str(profile["last_active_at"]) if profile.get("last_active_at") else None,
        created_at=str(profile["created_at"]),
        updated_at=str(profile["updated_at"]),
    )


@router.put("/profile", response_model=UserProfileResponse)
async def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
):
    """Update user preferences."""
    await _get_or_create_profile(user.id)

    conn = db.pool
    async with conn.acquire() as c:
        fields_to_update = []
        values = []
        idx = 1

        if body.display_name is not None:
            fields_to_update.append(f"display_name = ${idx}")
            values.append(body.display_name)
            idx += 1
        if body.research_interests is not None:
            fields_to_update.append(f"research_interests = ${idx}")
            values.append(body.research_interests)
            idx += 1
        if body.preferred_fields is not None:
            fields_to_update.append(f"preferred_fields = ${idx}")
            values.append(body.preferred_fields)
            idx += 1
        if body.default_year_min is not None:
            fields_to_update.append(f"default_year_min = ${idx}")
            values.append(body.default_year_min)
            idx += 1
        if body.default_year_max is not None:
            fields_to_update.append(f"default_year_max = ${idx}")
            values.append(body.default_year_max)
            idx += 1
        if body.default_min_citations is not None:
            fields_to_update.append(f"default_min_citations = ${idx}")
            values.append(body.default_min_citations)
            idx += 1
        if body.preferred_result_count is not None:
            fields_to_update.append(f"preferred_result_count = ${idx}")
            values.append(body.preferred_result_count)
            idx += 1

        if not fields_to_update:
            profile = await _get_or_create_profile(user.id)
        else:
            values.append(uuid.UUID(user.id))
            row = await c.fetchrow(
                f"""
                UPDATE user_profiles
                SET {', '.join(fields_to_update)}
                WHERE user_id = ${idx}
                RETURNING *
                """,
                *values,
            )
            profile = dict(row)

    return UserProfileResponse(
        user_id=str(profile["user_id"]),
        display_name=profile.get("display_name"),
        avatar_url=profile.get("avatar_url"),
        research_interests=profile.get("research_interests") or [],
        preferred_fields=profile.get("preferred_fields") or [],
        default_year_min=profile.get("default_year_min"),
        default_year_max=profile.get("default_year_max"),
        default_min_citations=profile.get("default_min_citations") or 0,
        preferred_result_count=profile.get("preferred_result_count") or 50,
        total_searches=profile.get("total_searches") or 0,
        total_papers_viewed=profile.get("total_papers_viewed") or 0,
        last_active_at=str(profile["last_active_at"]) if profile.get("last_active_at") else None,
        created_at=str(profile["created_at"]),
        updated_at=str(profile["updated_at"]),
    )


@router.post("/events", status_code=204)
async def log_interaction(
    body: InteractionEventRequest,
    user: User = Depends(get_current_user),
):
    """Log a paper interaction event."""
    valid_actions = {"view", "save_graph", "expand_citations", "chat_mention", "lit_review"}
    if body.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action: {body.action}")

    conn = db.pool
    if conn is None:
        return  # Silently ignore if DB unavailable

    try:
        async with conn.acquire() as c:
            # Resolve paper UUID from string ID
            paper_row = await c.fetchrow(
                "SELECT id FROM papers WHERE s2_paper_id = $1 OR id::text = $1",
                body.paper_id,
            )
            if paper_row is None:
                return  # Paper not in DB yet, skip silently

            await c.execute(
                """
                INSERT INTO user_paper_interactions (user_id, paper_id, action, session_id)
                VALUES ($1, $2, $3, $4)
                """,
                uuid.UUID(user.id),
                paper_row["id"],
                body.action,
                body.session_id,
            )

            # Update profile counters
            if body.action == "view":
                await c.execute(
                    """
                    UPDATE user_profiles
                    SET total_papers_viewed = total_papers_viewed + 1,
                        last_active_at = NOW()
                    WHERE user_id = $1
                    """,
                    uuid.UUID(user.id),
                )
    except Exception as e:
        logger.warning(f"Failed to log interaction: {e}")


@router.post("/search-history", status_code=204)
async def log_search(
    body: SearchHistoryRequest,
    user: User = Depends(get_current_user),
):
    """Log a search query for personalization."""
    conn = db.pool
    if conn is None:
        return

    try:
        import json
        async with conn.acquire() as c:
            await c.execute(
                """
                INSERT INTO user_search_history (user_id, query, mode, result_count, filters_used)
                VALUES ($1, $2, $3, $4, $5)
                """,
                uuid.UUID(user.id),
                body.query,
                body.mode,
                body.result_count,
                json.dumps(body.filters_used) if body.filters_used else None,
            )

            # Increment search counter
            await c.execute(
                """
                INSERT INTO user_profiles (user_id, total_searches, last_active_at)
                VALUES ($1, 1, NOW())
                ON CONFLICT (user_id) DO UPDATE
                SET total_searches = user_profiles.total_searches + 1,
                    last_active_at = NOW()
                """,
                uuid.UUID(user.id),
            )
    except Exception as e:
        logger.warning(f"Failed to log search: {e}")


@router.get("/recommendations", response_model=list[RecommendationResponse])
async def get_recommendations(user: User = Depends(get_current_user)):
    """
    Get personalized paper recommendations.

    Algorithm:
    1. Check for valid cached recommendations (not expired, not dismissed)
    2. If cache miss: compute interest vector from user's saved graphs + views
    3. pgvector ANN search for similar papers
    4. Generate Groq explanations for top 10
    5. Cache results for 24h
    """
    conn = db.pool
    if conn is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with conn.acquire() as c:
        # Check cache first
        cached = await c.fetch(
            """
            SELECT r.*, p.title, p.authors, p.year, p.venue,
                   p.citation_count, p.abstract, p.tldr, p.fields_of_study
            FROM user_recommendations r
            JOIN papers p ON p.id = r.paper_id
            WHERE r.user_id = $1
              AND r.is_dismissed = FALSE
              AND r.expires_at > NOW()
            ORDER BY r.score DESC
            LIMIT 20
            """,
            uuid.UUID(user.id),
        )

        if cached:
            return [
                RecommendationResponse(
                    id=str(row["id"]),
                    paper_id=str(row["paper_id"]),
                    score=row["score"],
                    explanation=row.get("explanation"),
                    reason_tags=row.get("reason_tags") or [],
                    is_dismissed=row["is_dismissed"],
                    generated_at=str(row["generated_at"]),
                    expires_at=str(row["expires_at"]),
                    title=row.get("title"),
                    authors=row.get("authors"),
                    year=row.get("year"),
                    venue=row.get("venue"),
                    citation_count=row.get("citation_count"),
                    abstract=row.get("abstract"),
                    tldr=row.get("tldr"),
                    fields=row.get("fields_of_study"),
                )
                for row in cached
            ]

        # Build interest vector from user's viewed papers + saved graphs
        interest_rows = await c.fetch(
            """
            SELECT DISTINCT p.embedding
            FROM user_paper_interactions upi
            JOIN papers p ON p.id = upi.paper_id
            WHERE upi.user_id = $1
              AND p.embedding IS NOT NULL
            ORDER BY p.embedding
            LIMIT 50
            """,
            uuid.UUID(user.id),
        )

        if not interest_rows:
            return []

        # Compute mean embedding in Python
        import numpy as np
        embeddings = []
        for row in interest_rows:
            emb = row["embedding"]
            if emb is not None:
                # asyncpg returns pgvector as string or list depending on codec
                if isinstance(emb, str):
                    vec = np.array([float(x) for x in emb.strip("[]").split(",")])
                else:
                    vec = np.array(list(emb))
                embeddings.append(vec)

        if not embeddings:
            return []

        interest_vector = np.mean(embeddings, axis=0)
        interest_list = interest_vector.tolist()

        # Get paper IDs already seen by user (to exclude)
        seen_ids = await c.fetch(
            """
            SELECT DISTINCT paper_id FROM user_paper_interactions WHERE user_id = $1
            """,
            uuid.UUID(user.id),
        )
        seen_set = {str(row["paper_id"]) for row in seen_ids}

        # Also get paper IDs from saved graphs
        saved_graph_paper_ids = await c.fetch(
            """
            SELECT DISTINCT unnest(paper_ids) AS paper_id
            FROM user_graphs
            WHERE user_id = $1
            """,
            uuid.UUID(user.id),
        )
        for row in saved_graph_paper_ids:
            seen_set.add(str(row["paper_id"]))

        # pgvector ANN search
        vec_str = "[" + ",".join(str(x) for x in interest_list) + "]"
        candidates = await c.fetch(
            f"""
            SELECT id, title, authors, year, venue, citation_count,
                   abstract, tldr, fields_of_study,
                   1 - (embedding <=> '{vec_str}'::vector) AS score
            FROM papers
            WHERE embedding IS NOT NULL
              AND id != ALL($1::uuid[])
            ORDER BY embedding <=> '{vec_str}'::vector
            LIMIT 100
            """,
            [uuid.UUID(sid) for sid in seen_set if _is_valid_uuid(sid)],
        )

        if not candidates:
            return []

        # Take top 20 by score
        top_candidates = [dict(row) for row in candidates[:20]]

        # Generate Groq explanations for top 10
        explanations = {}
        try:
            from config import settings
            if settings.groq_api_key:
                from llm.groq_provider import GroqProvider
                groq = GroqProvider(api_key=settings.groq_api_key)
                import asyncio

                async def explain_paper(paper: dict) -> tuple[str, str]:
                    title = paper.get("title", "Unknown")
                    tldr = paper.get("tldr") or paper.get("abstract", "")[:200]
                    prompt = (
                        f"In one sentence (max 20 words), explain why a researcher interested "
                        f"in this topic would find this paper valuable: '{title}'. "
                        f"Context: {tldr}"
                    )
                    try:
                        resp = await groq.generate(prompt, max_tokens=60, temperature=0.3)
                        return str(paper["id"]), resp.content.strip()
                    except Exception:
                        return str(paper["id"]), ""

                tasks = [explain_paper(p) for p in top_candidates[:10]]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for result in results:
                    if isinstance(result, tuple):
                        pid, explanation = result
                        explanations[pid] = explanation
        except Exception as e:
            logger.warning(f"Groq explanation generation failed: {e}")

        # Cache and return
        import json
        recs = []
        for paper in top_candidates:
            paper_id = str(paper["id"])
            score = float(paper.get("score", 0))
            explanation = explanations.get(paper_id)
            reason_tags = ["semantic_similarity"]
            if paper.get("citation_count", 0) > 100:
                reason_tags.append("highly_cited")

            rec_row = await c.fetchrow(
                """
                INSERT INTO user_recommendations
                    (user_id, paper_id, score, explanation, reason_tags)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, generated_at, expires_at
                """,
                uuid.UUID(user.id),
                paper["id"],
                score,
                explanation,
                reason_tags,
            )

            recs.append(RecommendationResponse(
                id=str(rec_row["id"]),
                paper_id=paper_id,
                score=score,
                explanation=explanation,
                reason_tags=reason_tags,
                is_dismissed=False,
                generated_at=str(rec_row["generated_at"]),
                expires_at=str(rec_row["expires_at"]),
                title=paper.get("title"),
                authors=paper.get("authors"),
                year=paper.get("year"),
                venue=paper.get("venue"),
                citation_count=paper.get("citation_count"),
                abstract=paper.get("abstract"),
                tldr=paper.get("tldr"),
                fields=paper.get("fields_of_study"),
            ))

        return recs


@router.delete("/recommendations/{rec_id}/dismiss", status_code=204)
async def dismiss_recommendation(
    rec_id: str,
    user: User = Depends(get_current_user),
):
    """Mark a recommendation as dismissed."""
    conn = db.pool
    if conn is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with conn.acquire() as c:
        result = await c.execute(
            """
            UPDATE user_recommendations
            SET is_dismissed = TRUE
            WHERE id = $1 AND user_id = $2
            """,
            uuid.UUID(rec_id),
            uuid.UUID(user.id),
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Recommendation not found")


def _is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False
