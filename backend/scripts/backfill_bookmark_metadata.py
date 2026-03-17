"""
Backfill bookmark display metadata for older saved papers.

Usage:
  ./venv/bin/python scripts/backfill_bookmark_metadata.py
"""

import asyncio
import logging

import asyncpg

from config import settings
from integrations.semantic_scholar import SemanticScholarRateLimitError, get_s2_client, init_s2_client, close_s2_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _strip_doi_prefix(paper_id: str) -> str | None:
    if paper_id.upper().startswith("DOI:"):
        return paper_id[4:]
    return None


async def _lookup_metadata(conn: asyncpg.Connection, paper_id: str) -> dict | None:
    row = await conn.fetchrow(
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
    if row:
        return {
            "paper_title": row["title"],
            "paper_authors": [
                author.get("name")
                for author in (row["authors"] or [])
                if isinstance(author, dict) and author.get("name")
            ],
            "paper_year": row["year"],
            "paper_venue": row["venue"],
            "paper_citation_count": row["citation_count"] or 0,
        }

    try:
        paper = await get_s2_client().get_paper(paper_id)
    except SemanticScholarRateLimitError as exc:
        logger.warning("Rate limited while backfilling %s, retry_after=%ss", paper_id, exc.retry_after)
        return None
    except Exception as exc:
        logger.warning("Provider lookup failed for %s: %s", paper_id, exc)
        return None

    if not paper:
        return None

    return {
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


async def main():
    await init_s2_client(api_key=settings.s2_api_key or None, requests_per_second=settings.s2_rate_limit)
    conn = await asyncpg.connect(settings.database_url)

    try:
        rows = await conn.fetch(
            """
            SELECT id, paper_id
            FROM paper_bookmarks
            WHERE paper_title IS NULL
               OR paper_title = ''
            ORDER BY updated_at DESC
            """
        )
        logger.info("Found %s sparse bookmarks", len(rows))

        updated = 0
        for row in rows:
            metadata = await _lookup_metadata(conn, row["paper_id"])
            if not metadata:
                continue

            await conn.execute(
                """
                UPDATE paper_bookmarks
                SET paper_title = $1,
                    paper_authors = $2,
                    paper_year = $3,
                    paper_venue = $4,
                    paper_citation_count = $5,
                    updated_at = NOW()
                WHERE id = $6
                """,
                metadata["paper_title"],
                metadata["paper_authors"],
                metadata["paper_year"],
                metadata["paper_venue"],
                metadata["paper_citation_count"],
                row["id"],
            )
            updated += 1

        logger.info("Backfilled %s bookmarks", updated)
    finally:
        await conn.close()
        await close_s2_client()


if __name__ == "__main__":
    asyncio.run(main())
