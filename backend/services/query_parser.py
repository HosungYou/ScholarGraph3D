"""
Natural language query parser for ScholarGraph3D.

Converts natural language queries into structured search parameters
using Groq llama-3.3-70b-versatile (free tier, 30 RPM).
"""

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PARSE_PROMPT = """Extract structured search parameters from this academic research query. Return ONLY valid JSON with these fields:
{{
  "keywords": "2-5 key search terms",
  "year_min": null or integer year,
  "year_max": null or integer year,
  "fields": [],
  "expanded_queries": ["alternative query 1", "alternative query 2"]
}}

Valid fields: "Physical Sciences", "Life Sciences", "Social Sciences", "Health Sciences", "Engineering", "Arts & Humanities"

Query: {query}

JSON:"""


async def parse_natural_query(
    query: str,
    groq_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Parse a natural language query into structured search params.

    Args:
        query: Natural language query like "How is AI adopted in healthcare since 2020?"
        groq_api_key: Optional Groq API key

    Returns:
        Dict with keys: keywords, year_min, year_max, fields, expanded_queries
    """
    default = {
        "keywords": query,
        "year_min": None,
        "year_max": None,
        "fields": [],
        "expanded_queries": [],
    }

    if not groq_api_key:
        return default

    try:
        result = await _parse_with_groq(query, groq_api_key)
        if result:
            return result
    except Exception as e:
        logger.warning(f"Query parsing failed, using raw query: {e}")

    return default


async def _parse_with_groq(query: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Use Groq to parse the query into structured params."""
    import httpx

    prompt = PARSE_PROMPT.format(query=query)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 200,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()

        parsed = json.loads(content)

        # Validate and clean
        result = {
            "keywords": str(parsed.get("keywords", query)),
            "year_min": int(parsed["year_min"]) if parsed.get("year_min") else None,
            "year_max": int(parsed["year_max"]) if parsed.get("year_max") else None,
            "fields": [f for f in (parsed.get("fields") or []) if isinstance(f, str)],
            "expanded_queries": [
                str(q) for q in (parsed.get("expanded_queries") or [])[:3]
            ],
        }
        return result
