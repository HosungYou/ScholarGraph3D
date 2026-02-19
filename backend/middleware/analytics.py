"""
Analytics middleware for ScholarGraph3D.

Logs search events to Supabase search_logs table for monitoring.
Falls back silently if database is unavailable.
"""

import asyncio
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class SearchAnalytics:
    """Records search events to the database."""

    def __init__(self):
        self._buffer: list = []
        self._flush_task: Optional[asyncio.Task] = None

    async def log_search(
        self,
        query: str,
        duration_ms: int,
        paper_count: int,
        cache_hit: bool,
        search_type: str = "keyword",
        ip: Optional[str] = None,
        db=None,
    ) -> None:
        """
        Log a search event asynchronously.

        Args:
            query: Search query string
            duration_ms: Search duration in milliseconds
            paper_count: Number of papers returned
            cache_hit: Whether result was served from cache
            search_type: "keyword" or "natural"
            ip: Client IP (hashed for privacy)
            db: Database connection
        """
        if db is None or not db.is_connected:
            return

        # Hash IP for privacy
        import hashlib
        ip_hash = hashlib.sha256((ip or "unknown").encode()).hexdigest()[:16] if ip else None

        try:
            await db.execute(
                """
                INSERT INTO search_logs (query, duration_ms, paper_count, cache_hit, search_type, ip_hash)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
                """,
                query[:500],  # truncate long queries
                duration_ms,
                paper_count,
                cache_hit,
                search_type,
                ip_hash,
            )
        except Exception as e:
            # Don't fail the request due to analytics errors
            logger.debug(f"Analytics log skipped: {e}")

    async def get_stats(self, db=None) -> Dict[str, Any]:
        """Get basic search statistics."""
        if db is None or not db.is_connected:
            return {}

        try:
            row = await db.fetchrow(
                """
                SELECT
                    COUNT(*) as total_searches,
                    AVG(duration_ms) as avg_duration_ms,
                    SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as cache_hit_rate,
                    AVG(paper_count) as avg_paper_count
                FROM search_logs
                WHERE created_at > NOW() - INTERVAL '24 hours'
                """
            )
            if row:
                return dict(row)
        except Exception as e:
            logger.debug(f"Analytics stats skipped: {e}")

        return {}


# Global instance
analytics = SearchAnalytics()
