"""
Redis cache helpers for ScholarGraph3D.

Provides async Redis operations with graceful degradation — if Redis is
unavailable (e.g. REDIS_URL not set), all operations silently no-op.

Cache key strategy:
    emb:{s2_paper_id}          TTL 30 days — SPECTER2 embeddings
    refs:{s2_paper_id}:{limit} TTL 7 days  — get_references() results
    cites:{s2_paper_id}:{limit} TTL 7 days — get_citations() results
    search:{sha256_key}        TTL 24h     — full search results (parallel to PG cache)

Usage:
    from cache import get_cached_embedding, cache_embedding

    emb = await get_cached_embedding("abc123")
    if emb is None:
        emb = compute_embedding(...)
        await cache_embedding("abc123", emb)
"""

import json
import logging
from typing import Any, Dict, List, Optional

from config import settings

logger = logging.getLogger(__name__)

# Module-level Redis client (lazy init)
_redis_client = None
_redis_available: Optional[bool] = None  # None = not checked yet


async def _get_redis():
    """
    Return a connected Redis client or None if unavailable.

    Lazy-initializes on first call. Caches availability status to avoid
    repeated connection attempts when Redis is not configured.
    """
    global _redis_client, _redis_available

    # Already confirmed unavailable
    if _redis_available is False:
        return None

    # Already initialized and connected
    if _redis_client is not None:
        return _redis_client

    if not settings.redis_url:
        logger.debug("Redis URL not configured — cache disabled")
        _redis_available = False
        return None

    try:
        import redis.asyncio as redis

        client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        # Verify connection
        await client.ping()
        _redis_client = client
        _redis_available = True
        logger.info("Redis cache connected")
        return _redis_client
    except ImportError:
        logger.warning("redis package not installed — cache disabled")
        _redis_available = False
        return None
    except Exception as e:
        logger.warning(f"Redis connection failed: {e} — cache disabled")
        _redis_available = False
        return None


# ==================== Embedding Cache ====================

_TTL_EMBEDDING = 60 * 60 * 24 * 30  # 30 days


async def get_cached_embedding(s2_paper_id: str) -> Optional[List[float]]:
    """Return cached SPECTER2 embedding or None."""
    r = await _get_redis()
    if not r:
        return None
    try:
        data = await r.get(f"emb:{s2_paper_id}")
        if data:
            logger.debug(f"Cache HIT for emb:{s2_paper_id}")
            return json.loads(data)
    except Exception as e:
        logger.debug(f"Embedding cache get failed: {e}")
    return None


async def cache_embedding(s2_paper_id: str, embedding: List[float]) -> None:
    """Cache SPECTER2 embedding for 30 days."""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.setex(f"emb:{s2_paper_id}", _TTL_EMBEDDING, json.dumps(embedding))
    except Exception as e:
        logger.debug(f"Embedding cache set failed: {e}")


# ==================== References/Citations Cache ====================

_TTL_REFS = 60 * 60 * 24 * 7  # 7 days


async def get_cached_refs(cache_key: str) -> Optional[List[Dict[str, Any]]]:
    """Return cached get_references() result list or None."""
    r = await _get_redis()
    if not r:
        return None
    try:
        data = await r.get(cache_key)
        if data:
            logger.debug(f"Cache HIT for {cache_key}")
            return json.loads(data)
    except Exception as e:
        logger.debug(f"Refs cache get failed: {e}")
    return None


async def cache_refs(cache_key: str, papers_data: List[Dict[str, Any]]) -> None:
    """Cache get_references() result for 7 days."""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.setex(cache_key, _TTL_REFS, json.dumps(papers_data))
    except Exception as e:
        logger.debug(f"Refs cache set failed: {e}")


# ==================== Search Results Cache ====================

_TTL_SEARCH = 60 * 60 * 24  # 24 hours


async def get_cached_search(cache_hash: str) -> Optional[Dict[str, Any]]:
    """Return cached full search result or None."""
    r = await _get_redis()
    if not r:
        return None
    try:
        data = await r.get(f"search:{cache_hash}")
        if data:
            logger.debug(f"Redis cache HIT for search:{cache_hash}")
            return json.loads(data)
    except Exception as e:
        logger.debug(f"Search cache get failed: {e}")
    return None


async def cache_search(cache_hash: str, result: Dict[str, Any]) -> None:
    """Cache full search result for 24 hours."""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.setex(f"search:{cache_hash}", _TTL_SEARCH, json.dumps(result))
    except Exception as e:
        logger.debug(f"Search cache set failed: {e}")
