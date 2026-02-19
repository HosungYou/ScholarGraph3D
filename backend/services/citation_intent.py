"""
Citation intent extraction service for ScholarGraph3D.

Two tiers:
- Basic (free): S2 API citation intents (methodology, background, result_comparison)
- Enhanced (premium): LLM-classified intents (supports, contradicts, extends, applies, compares)
"""

import json
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

from llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)

# S2 citation intent fields
S2_CITATION_FIELDS = [
    "citingPaper.paperId",
    "citingPaper.title",
    "intents",
    "isInfluential",
    "contexts",
]

# LLM system prompt for enhanced citation intent classification
INTENT_SYSTEM_PROMPT = """You are a citation analyst specializing in academic literature.
Given the citation context (the sentence surrounding a citation), classify the citation intent.

Possible intents:
- supports: The citing paper uses the cited work as evidence or validation
- contradicts: The citing paper disagrees with or challenges the cited work
- extends: The citing paper builds upon or extends the cited work's methods/ideas
- applies: The citing paper applies the cited work's methods to a new domain/problem
- compares: The citing paper compares approaches, including the cited work

Respond with ONLY valid JSON:
{"intent": "supports|contradicts|extends|applies|compares", "confidence": 0.0-1.0, "reasoning": "brief explanation"}"""


class CitationIntentService:
    """
    Citation intent extraction with S2 basic + optional LLM enhancement.

    Usage:
        svc = CitationIntentService()
        # Basic (free)
        intents = await svc.get_basic_intents("paper123", s2_client)
        # Enhanced (premium, requires LLM key)
        enhanced = await svc.enhance_intents_with_llm(intents, provider, api_key)
        # Full graph pipeline
        graph_intents = await svc.get_intents_for_graph(paper_ids, s2_client, provider, api_key)
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
                    "limit": 500,
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

    async def enhance_intents_with_llm(
        self,
        citations: List[Dict[str, Any]],
        provider: BaseLLMProvider,
        api_key: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Use an LLM to classify citation intents more granularly.

        Takes S2 basic intents with context sentences, asks the LLM
        to classify into: supports, contradicts, extends, applies, compares.

        Args:
            citations: List of basic citation intent dicts (from get_basic_intents).
            provider: BaseLLMProvider instance.
            api_key: Not used directly (provider already initialized), kept for API compat.

        Returns:
            Enhanced citation list with LLM-classified intents added.
        """
        if not citations:
            return citations

        enhanced = []
        # Process in batches to reduce LLM calls
        batch_size = 10

        for i in range(0, len(citations), batch_size):
            batch = citations[i:i + batch_size]

            # Build batch prompt
            citation_texts = []
            for idx, cit in enumerate(batch):
                context = cit.get("context", "").strip()
                if not context:
                    # No context sentence -- skip LLM enhancement, keep S2 intent
                    enhanced.append(cit)
                    continue
                citing_title = cit.get("citing_title", "Unknown")
                citation_texts.append(
                    f"Citation {idx + 1}:\n"
                    f"Citing paper: {citing_title}\n"
                    f"Context: {context}"
                )

            if not citation_texts:
                continue

            prompt = (
                "Classify the intent of each citation below. "
                "Return a JSON array with one object per citation.\n\n"
                + "\n\n".join(citation_texts)
                + "\n\nReturn JSON array: [{\"citation_index\": 1, \"intent\": \"...\", "
                "\"confidence\": 0.0, \"reasoning\": \"...\"}]"
            )

            try:
                response = await provider.generate_json(
                    prompt=prompt,
                    system_prompt=INTENT_SYSTEM_PROMPT,
                )

                # Parse LLM response
                llm_intents = _parse_llm_intent_response(response)

                # Merge LLM intents back into citations
                context_idx = 0
                for cit in batch:
                    if not cit.get("context", "").strip():
                        continue
                    if context_idx < len(llm_intents):
                        llm_intent = llm_intents[context_idx]
                        cit["enhanced_intent"] = llm_intent.get("intent", cit["intent"])
                        cit["confidence"] = llm_intent.get("confidence", 0.0)
                        cit["reasoning"] = llm_intent.get("reasoning", "")
                        cit["source"] = "llm"
                    enhanced.append(cit)
                    context_idx += 1

            except Exception as e:
                logger.warning(f"LLM intent enhancement failed for batch: {e}")
                # Fall back to S2 intents
                for cit in batch:
                    if cit not in enhanced:
                        enhanced.append(cit)

        return enhanced

    async def get_intents_for_graph(
        self,
        paper_ids: List[str],
        s2_client,
        llm_provider: Optional[BaseLLMProvider] = None,
        api_key: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get citation intents for all edges in a paper graph.

        - Always fetches S2 basic intents (free).
        - If llm_provider is provided, enhances with LLM classification (premium).

        Args:
            paper_ids: List of S2 paper IDs in the graph.
            s2_client: SemanticScholarClient instance.
            llm_provider: Optional LLM provider for enhanced intents.
            api_key: Optional API key (unused if provider already initialized).

        Returns:
            List of edge-level intent dicts for frontend visualization:
            [{citing_id, cited_id, intent, enhanced_intent?, is_influential, context, ...}]
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

        # Enhance with LLM if provider available
        if llm_provider and unique_intents:
            try:
                unique_intents = await self.enhance_intents_with_llm(
                    unique_intents,
                    llm_provider,
                )
            except Exception as e:
                logger.warning(f"LLM enhancement failed, using S2 intents: {e}")

        return unique_intents


def _parse_llm_intent_response(response: Any) -> List[Dict[str, Any]]:
    """
    Parse the LLM's JSON response for citation intents.

    Handles both dict (single) and list (batch) responses.
    Falls back gracefully on parse errors.
    """
    valid_intents = {"supports", "contradicts", "extends", "applies", "compares"}

    if isinstance(response, list):
        results = response
    elif isinstance(response, dict):
        # Could be a single intent or wrapped in a key
        if "intent" in response:
            results = [response]
        else:
            # Try common wrapper keys
            for key in ("results", "citations", "intents", "data"):
                if key in response and isinstance(response[key], list):
                    results = response[key]
                    break
            else:
                results = [response]
    else:
        return []

    parsed = []
    for item in results:
        if not isinstance(item, dict):
            continue
        intent = item.get("intent", "").lower().strip()
        if intent not in valid_intents:
            intent = "supports"  # Default fallback

        parsed.append({
            "intent": intent,
            "confidence": min(1.0, max(0.0, float(item.get("confidence", 0.5)))),
            "reasoning": str(item.get("reasoning", ""))[:200],
        })

    return parsed
