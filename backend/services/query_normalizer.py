"""
Query normalizer for ScholarGraph3D.

Normalizes user queries to improve cache hit rates.
Uses Groq llama-3.1-8b-instant for semantic normalization when available.
Falls back to simple lowercase + stopword removal.
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "what", "how",
    "when", "where", "who", "which", "that", "this", "these", "those",
    "about", "into", "through", "during", "before", "after", "above",
    "below", "between", "each", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "recent", "new", "latest", "current",
}


def normalize_simple(query: str) -> str:
    """Simple normalization: lowercase, remove stopwords, normalize whitespace."""
    query = query.lower().strip()
    # Remove special characters except hyphens and alphanumeric
    query = re.sub(r"[^\w\s\-]", " ", query)
    # Remove stopwords
    words = query.split()
    filtered = [w for w in words if w not in STOPWORDS and len(w) > 1]
    return " ".join(filtered) if filtered else query.lower().strip()


async def normalize_query(
    query: str,
    groq_api_key: Optional[str] = None,
) -> str:
    """
    Normalize a search query for better cache hit rates.

    If groq_api_key is provided, uses LLM for semantic normalization.
    Otherwise falls back to simple stopword removal.

    Args:
        query: Raw user query
        groq_api_key: Optional Groq API key for LLM normalization

    Returns:
        Normalized query string
    """
    if not query.strip():
        return query

    if groq_api_key:
        try:
            normalized = await _normalize_with_groq(query, groq_api_key)
            if normalized and len(normalized) > 2:
                logger.debug(f"Query normalized via Groq: '{query}' -> '{normalized}'")
                return normalized
        except Exception as e:
            logger.warning(f"Groq normalization failed, using simple: {e}")

    return normalize_simple(query)


async def _normalize_with_groq(query: str, api_key: str) -> str:
    """Use Groq llama-3.1-8b-instant to semantically normalize the query."""
    import httpx

    prompt = (
        f"Normalize this academic search query to 2-5 key terms for database search. "
        f"Remove filler words. Return ONLY the normalized terms, nothing else.\n"
        f"Query: {query}\n"
        f"Normalized:"
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 50,
                "temperature": 0.1,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip().lower()
