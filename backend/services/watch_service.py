"""
Watch query execution service for ScholarGraph3D.

Checks watch queries against OpenAlex for new papers, compares via cosine
similarity against existing graph papers, and triggers email notifications.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import numpy as np

from config import settings
from database import Database
from integrations.openalex import OpenAlexClient
from services.email_service import EmailService

logger = logging.getLogger(__name__)


class WatchService:
    """
    Watch query execution and management service.

    Searches OpenAlex for new papers matching saved queries,
    filters by cosine similarity against existing graph papers,
    and sends email notifications via Resend.
    """

    def __init__(self, db: Database):
        self.db = db

    # ==================== CRUD ====================

    async def create_watch_query(
        self,
        user_id: str,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
        notify_email: bool = True,
    ) -> Dict[str, Any]:
        """
        Create a new watch query for a user.

        Args:
            user_id: Supabase user ID.
            query: Search query text.
            filters: Optional OA filters (year, field, venue).
            notify_email: Whether to send email notifications.

        Returns:
            Created watch query record.
        """
        row = await self.db.fetchrow(
            """
            INSERT INTO watch_queries (user_id, query, filters, notify_email, last_checked)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, user_id, query, filters, notify_email, last_checked, created_at
            """,
            UUID(user_id),
            query,
            filters or {},
            notify_email,
        )
        return _row_to_dict(row)

    async def list_watch_queries(self, user_id: str) -> List[Dict[str, Any]]:
        """List all watch queries for a user, ordered by creation date."""
        rows = await self.db.fetch(
            """
            SELECT id, user_id, query, filters, notify_email, last_checked, created_at
            FROM watch_queries
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            UUID(user_id),
        )
        return [_row_to_dict(row) for row in rows]

    async def delete_watch_query(self, user_id: str, watch_id: str) -> bool:
        """
        Delete a watch query. Returns True if deleted, False if not found.
        Only the owning user can delete.
        """
        result = await self.db.execute(
            "DELETE FROM watch_queries WHERE id = $1 AND user_id = $2",
            UUID(watch_id),
            UUID(user_id),
        )
        return result != "DELETE 0"

    async def update_watch_query(
        self,
        user_id: str,
        watch_id: str,
        updates: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Update a watch query's filters or notification settings.

        Args:
            user_id: Owner user ID.
            watch_id: Watch query ID.
            updates: Dict with optional keys: query, filters, notify_email.

        Returns:
            Updated watch query dict, or None if not found.
        """
        # Verify ownership
        existing = await self.db.fetchrow(
            "SELECT id FROM watch_queries WHERE id = $1 AND user_id = $2",
            UUID(watch_id),
            UUID(user_id),
        )
        if not existing:
            return None

        # Build dynamic update
        set_clauses = []
        params: list = []
        idx = 1

        if "query" in updates:
            set_clauses.append(f"query = ${idx}")
            params.append(updates["query"])
            idx += 1

        if "filters" in updates:
            set_clauses.append(f"filters = ${idx}")
            params.append(updates["filters"])
            idx += 1

        if "notify_email" in updates:
            set_clauses.append(f"notify_email = ${idx}")
            params.append(updates["notify_email"])
            idx += 1

        if not set_clauses:
            # Nothing to update, return current
            row = await self.db.fetchrow(
                """
                SELECT id, user_id, query, filters, notify_email, last_checked, created_at
                FROM watch_queries WHERE id = $1
                """,
                UUID(watch_id),
            )
            return _row_to_dict(row) if row else None

        params.extend([UUID(watch_id), UUID(user_id)])
        query = f"""
            UPDATE watch_queries
            SET {', '.join(set_clauses)}
            WHERE id = ${idx} AND user_id = ${idx + 1}
            RETURNING id, user_id, query, filters, notify_email, last_checked, created_at
        """

        row = await self.db.fetchrow(query, *params)
        return _row_to_dict(row) if row else None

    # ==================== Query Execution ====================

    async def check_watch_query(self, watch_query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Check a single watch query for new papers.

        Pipeline:
        1. Search OpenAlex for papers published after last_checked.
        2. For each new paper, check cosine similarity against existing graph papers.
        3. Include papers with similarity > 0.7 to any existing graph paper.
        4. Update last_checked timestamp.
        5. Return list of new matching papers.

        Args:
            watch_query: Watch query dict with id, user_id, query, filters, last_checked.

        Returns:
            List of new matching paper dicts.
        """
        query_text = watch_query["query"]
        filters = watch_query.get("filters") or {}
        last_checked = watch_query.get("last_checked")
        watch_id = watch_query["id"]
        user_id = watch_query["user_id"]

        # Determine date cutoff
        if last_checked:
            if isinstance(last_checked, str):
                from_date = last_checked[:10]  # YYYY-MM-DD
            else:
                from_date = last_checked.strftime("%Y-%m-%d")
        else:
            from_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

        # Build OpenAlex filter params
        oa_filters: Dict[str, str] = {
            "from_publication_date": from_date,
        }

        if filters.get("year"):
            oa_filters["publication_year"] = str(filters["year"])
        if filters.get("field"):
            oa_filters["concepts.display_name"] = filters["field"]

        # Search OpenAlex
        oa_client = OpenAlexClient(
            email=settings.oa_email or None,
            api_key=settings.oa_api_key or None,
        )
        try:
            oa_works = await oa_client.search_works(
                query=query_text,
                filter_params=oa_filters,
                per_page=50,
            )
        except Exception as e:
            logger.error(f"OA search failed for watch query {watch_id}: {e}")
            return []
        finally:
            await oa_client.close()

        if not oa_works:
            await self._update_last_checked(watch_id)
            return []

        # Get existing graph papers with embeddings for this user
        graph_embeddings = await self._get_user_graph_embeddings(str(user_id))

        # Filter by cosine similarity if we have existing embeddings
        new_papers = []
        for work in oa_works:
            paper_dict = _oa_work_to_paper_dict(work)

            if graph_embeddings:
                # Check if new paper has an embedding in DB (by DOI match)
                new_embedding = await self._get_paper_embedding_by_doi(work.doi)
                if new_embedding is not None:
                    max_sim = _max_cosine_similarity(new_embedding, graph_embeddings)
                    if max_sim < 0.7:
                        continue  # Not similar enough to existing graph
                # If no embedding available, include the paper anyway (relevance by query match)

            new_papers.append(paper_dict)

        # Update last_checked
        await self._update_last_checked(watch_id)

        logger.info(
            f"Watch query {watch_id} ('{query_text}'): "
            f"found {len(oa_works)} OA results, {len(new_papers)} passed similarity filter"
        )

        return new_papers

    async def execute_all_pending(self) -> Dict[str, Any]:
        """
        Execute all watch queries that haven't been checked in N+ days.

        Reads the interval from settings.watch_check_interval_days (default 7).

        Returns:
            Summary dict: {total_queries, new_papers_found, emails_sent}
        """
        interval_days = getattr(settings, "watch_check_interval_days", 7)
        cutoff = datetime.now(timezone.utc) - timedelta(days=interval_days)

        rows = await self.db.fetch(
            """
            SELECT wq.id, wq.user_id, wq.query, wq.filters, wq.notify_email, wq.last_checked
            FROM watch_queries wq
            WHERE wq.last_checked IS NULL OR wq.last_checked < $1
            ORDER BY wq.last_checked ASC NULLS FIRST
            """,
            cutoff,
        )

        total_queries = len(rows)
        total_new_papers = 0
        emails_sent = 0

        # Initialize email service if configured
        email_svc: Optional[EmailService] = None
        resend_key = getattr(settings, "resend_api_key", "")
        from_email = getattr(settings, "notification_from_email", "notifications@scholargraph3d.com")
        if resend_key:
            email_svc = EmailService(api_key=resend_key, from_email=from_email)

        try:
            for row in rows:
                watch_query = _row_to_dict(row)
                try:
                    new_papers = await self.check_watch_query(watch_query)
                    total_new_papers += len(new_papers)

                    # Send email notification if enabled and papers found
                    if new_papers and watch_query.get("notify_email") and email_svc:
                        user_email = await self._get_user_email(str(watch_query["user_id"]))
                        if user_email:
                            sent = await email_svc.send_watch_digest(
                                to_email=user_email,
                                query=watch_query["query"],
                                new_papers=new_papers,
                            )
                            if sent:
                                emails_sent += 1

                except Exception as e:
                    logger.error(f"Failed to check watch query {watch_query.get('id')}: {e}")
                    continue
        finally:
            if email_svc:
                await email_svc.close()

        logger.info(
            f"Watch cron complete: {total_queries} queries checked, "
            f"{total_new_papers} new papers, {emails_sent} emails sent"
        )

        return {
            "total_queries": total_queries,
            "new_papers_found": total_new_papers,
            "emails_sent": emails_sent,
        }

    # ==================== Internal Helpers ====================

    async def _update_last_checked(self, watch_id: str) -> None:
        """Update the last_checked timestamp for a watch query."""
        await self.db.execute(
            "UPDATE watch_queries SET last_checked = NOW() WHERE id = $1",
            UUID(watch_id) if isinstance(watch_id, str) else watch_id,
        )

    async def _get_user_graph_embeddings(self, user_id: str) -> List[np.ndarray]:
        """
        Get SPECTER2 embeddings for all papers in a user's saved graphs.

        Returns list of numpy arrays (768-dim each).
        """
        try:
            rows = await self.db.fetch(
                """
                SELECT DISTINCT p.embedding
                FROM papers p
                JOIN user_graphs ug ON p.id = ANY(ug.paper_ids::uuid[])
                WHERE ug.user_id = $1
                  AND p.embedding IS NOT NULL
                LIMIT 500
                """,
                UUID(user_id),
            )
            return [np.array(row["embedding"]) for row in rows if row["embedding"]]
        except Exception as e:
            logger.debug(f"Could not fetch user graph embeddings: {e}")
            return []

    async def _get_paper_embedding_by_doi(self, doi: Optional[str]) -> Optional[np.ndarray]:
        """Look up a paper's embedding by DOI."""
        if not doi:
            return None
        try:
            row = await self.db.fetchrow(
                "SELECT embedding FROM papers WHERE doi = $1 AND embedding IS NOT NULL",
                doi,
            )
            if row and row["embedding"]:
                return np.array(row["embedding"])
        except Exception as e:
            logger.debug(f"Could not fetch embedding for DOI {doi}: {e}")
        return None

    async def _get_user_email(self, user_id: str) -> Optional[str]:
        """
        Get user email from Supabase auth.users (via auth schema).

        Falls back to None if unavailable (e.g., auth not configured).
        """
        try:
            row = await self.db.fetchrow(
                "SELECT email FROM auth.users WHERE id = $1",
                UUID(user_id),
            )
            return row["email"] if row else None
        except Exception as e:
            logger.debug(f"Could not fetch user email for {user_id}: {e}")
            return None


# ==================== Utility Functions ====================


def _row_to_dict(row) -> Dict[str, Any]:
    """Convert an asyncpg Record to a dict with string UUIDs and ISO timestamps."""
    if row is None:
        return {}
    d = dict(row)
    for key, val in d.items():
        if isinstance(val, UUID):
            d[key] = str(val)
        elif hasattr(val, "isoformat"):
            d[key] = val.isoformat()
    return d


def _oa_work_to_paper_dict(work) -> Dict[str, Any]:
    """Convert an OpenAlexWork to a paper dict for email and API responses."""
    authors = []
    for a in work.authors[:5]:
        if isinstance(a, dict):
            authors.append({
                "name": a.get("display_name", a.get("name", "")),
            })

    return {
        "oa_work_id": work.id,
        "title": work.title,
        "abstract": work.abstract,
        "year": work.publication_year,
        "venue": (
            work.primary_location.get("source", {}).get("display_name", "")
            if work.primary_location and isinstance(work.primary_location, dict)
            else ""
        ),
        "doi": work.doi,
        "oa_url": work.open_access_url,
        "citation_count": work.citation_count,
        "is_open_access": work.is_open_access,
        "authors": authors,
    }


def _max_cosine_similarity(
    embedding: np.ndarray,
    reference_embeddings: List[np.ndarray],
) -> float:
    """
    Compute the maximum cosine similarity between an embedding
    and a list of reference embeddings.
    """
    if not reference_embeddings:
        return 0.0

    emb_norm = np.linalg.norm(embedding)
    if emb_norm == 0:
        return 0.0

    embedding_normalized = embedding / emb_norm

    max_sim = 0.0
    for ref in reference_embeddings:
        ref_norm = np.linalg.norm(ref)
        if ref_norm == 0:
            continue
        sim = float(np.dot(embedding_normalized, ref / ref_norm))
        if sim > max_sim:
            max_sim = sim

    return max_sim
