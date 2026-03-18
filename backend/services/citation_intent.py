"""
Citation intent extraction service for ScholarGraph3D.

Fetches S2 API citation intents (methodology, background, result_comparison).
"""

import logging
from typing import Any, Dict, List
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

# S2 citation intent fields
S2_CITATION_FIELDS = [
    "citingPaper.paperId",
    "citingPaper.title",
    "intents",
    "isInfluential",
    "contexts",
]


class CitationIntentService:
    """
    Citation intent extraction from Semantic Scholar API.

    Usage:
        svc = CitationIntentService()
        intents = await svc.get_basic_intents("paper123", s2_client)
        graph_intents = await svc.get_intents_for_graph(paper_ids, s2_client)
    """

    async def get_basic_intents(
        self,
        paper_id: str,
        s2_client,
    ) -> List[Dict[str, Any]]:
        """
        Fetch citation intents from the Semantic Scholar API (free tier).

        S2 provides intents: methodology, background, result_comparison.

        Args:
            paper_id: S2 paper ID.
            s2_client: SemanticScholarClient instance.

        Returns:
            List of citation intent dicts:
            [{citing_id, cited_id, intent, is_influential, context}]
        """
        encoded_id = quote_plus(paper_id)
        url = f"{s2_client.BASE_URL}/paper/{encoded_id}/citations"

        try:
            data = await s2_client._request(
                "GET",
                url,
                params={
                    "fields": ",".join(S2_CITATION_FIELDS),
                    "limit": 100,
                },
            )
        except Exception as e:
            logger.error(f"S2 citation intents failed for {paper_id}: {e}")
            return []

        results = []
        for item in data.get("data", []):
            citing_paper = item.get("citingPaper", {})
            citing_id = citing_paper.get("paperId")
            if not citing_id:
                continue

            intents = item.get("intents") or []
            is_influential = item.get("isInfluential", False)
            contexts = item.get("contexts") or []

            # S2 can return multiple intents per citation
            intent_str = intents[0] if intents else "background"
            context_str = contexts[0] if contexts else ""

            results.append({
                "citing_id": citing_id,
                "citing_title": citing_paper.get("title", ""),
                "cited_id": paper_id,
                "intent": intent_str,
                "intents_all": intents,
                "is_influential": is_influential,
                "context": context_str,
                "source": "s2",
            })

        logger.info(f"S2 intents for {paper_id}: {len(results)} citations")
        return results

    async def get_intents_for_graph(
        self,
        paper_ids: List[str],
        s2_client,
    ) -> List[Dict[str, Any]]:
        """
        Get citation intents for all edges in a paper graph.

        Args:
            paper_ids: List of S2 paper IDs in the graph.
            s2_client: SemanticScholarClient instance.

        Returns:
            List of edge-level intent dicts for frontend visualization:
            [{citing_id, cited_id, intent, is_influential, context, ...}]
        """
        if not paper_ids:
            return []

        paper_id_set = set(paper_ids)
        all_intents: List[Dict[str, Any]] = []

        # Fetch S2 intents for each paper (citations received)
        for paper_id in paper_ids:
            try:
                citations = await self.get_basic_intents(paper_id, s2_client)

                # Filter to only edges within the graph
                graph_citations = [
                    c for c in citations
                    if c["citing_id"] in paper_id_set
                ]

                all_intents.extend(graph_citations)

            except Exception as e:
                logger.warning(f"Failed to get intents for {paper_id}: {e}")
                continue

        # Deduplicate by (citing_id, cited_id) pair
        seen = set()
        unique_intents = []
        for intent in all_intents:
            key = (intent["citing_id"], intent["cited_id"])
            if key not in seen:
                seen.add(key)
                unique_intents.append(intent)

        logger.info(
            f"Graph intents: {len(unique_intents)} unique edges "
            f"from {len(paper_ids)} papers"
        )

        return unique_intents
