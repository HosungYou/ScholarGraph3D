"""
Tests for POST /api/seed-chat in routers/seed_chat.py.

Covers:
- test_seed_chat_success: mock GroqProvider returns reply, response has reply + suggested_followups
- test_seed_chat_no_api_key: GROQ_API_KEY not set → 400 Bad Request
- test_seed_chat_with_history: conversation history is accepted and processed
- test_seed_chat_llm_error: GroqProvider.generate raises → 502
- test_seed_chat_followups_shape: suggested_followups is a list of 3 strings
- test_seed_chat_missing_message: missing required field → 422
- test_seed_chat_minimal_graph_context: single paper, no clusters

Run: pytest tests/test_routers/test_seed_chat.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from llm.base import LLMResponse


# ==================== Helpers ====================

def _make_graph_context(
    papers: list = None,
    clusters: list = None,
    total_papers: int = None,
) -> dict:
    """Build a minimal GraphContext dict for request payloads."""
    if papers is None:
        papers = [
            {
                "paper_id": "p1",
                "title": "Attention Is All You Need",
                "authors": ["Ashish Vaswani", "Noam Shazeer"],
                "year": 2017,
                "abstract_snippet": "We propose the Transformer architecture.",
                "fields": ["Computer Science"],
                "citation_count": 50000,
            },
            {
                "paper_id": "p2",
                "title": "BERT: Pre-training of Deep Bidirectional Transformers",
                "authors": ["Jacob Devlin", "Ming-Wei Chang"],
                "year": 2019,
                "abstract_snippet": "A new language representation model.",
                "fields": ["Computer Science"],
                "citation_count": 30000,
            },
        ]
    if clusters is None:
        clusters = [
            {"id": 0, "label": "Transformer Models", "paper_count": 5},
            {"id": 1, "label": "Pre-training Methods", "paper_count": 3},
        ]
    if total_papers is None:
        total_papers = len(papers)

    return {
        "papers": papers,
        "clusters": clusters,
        "total_papers": total_papers,
    }


def _make_llm_response(content: str = "Here is my analysis of the graph.") -> LLMResponse:
    """Build a minimal LLMResponse for mocking GroqProvider.generate."""
    return LLMResponse(
        content=content,
        model="llama-3.3-70b-versatile",
        tokens_used=128,
        provider_name="groq",
    )


# ==================== Tests ====================

@pytest.mark.asyncio
async def test_seed_chat_success(test_client):
    """Happy path: Groq returns a reply → response has reply and suggested_followups."""
    mock_provider = AsyncMock()
    mock_provider.generate = AsyncMock(
        return_value=_make_llm_response("The graph shows strong connections between transformer papers.")
    )
    mock_provider.close = AsyncMock()

    with (
        patch("routers.seed_chat.settings") as mock_settings,
        patch("routers.seed_chat.GroqProvider", return_value=mock_provider),
    ):
        mock_settings.groq_api_key = "test-groq-key-12345"

        response = await test_client.post(
            "/api/seed-chat",
            json={
                "message": "What are the main themes in this graph?",
                "graph_context": _make_graph_context(),
                "history": [],
            },
        )

    assert response.status_code == 200
    data = response.json()

    assert "reply" in data
    assert data["reply"] == "The graph shows strong connections between transformer papers."
    assert "suggested_followups" in data
    assert isinstance(data["suggested_followups"], list)


@pytest.mark.asyncio
async def test_seed_chat_no_api_key(test_client):
    """Missing GROQ_API_KEY → 400 Bad Request with informative detail."""
    with patch("routers.seed_chat.settings") as mock_settings:
        mock_settings.groq_api_key = ""  # falsy — no key configured

        response = await test_client.post(
            "/api/seed-chat",
            json={
                "message": "Summarize the research landscape.",
                "graph_context": _make_graph_context(),
                "history": [],
            },
        )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "groq" in detail.lower() or "api key" in detail.lower()


@pytest.mark.asyncio
async def test_seed_chat_with_history(test_client):
    """Conversation history is passed and endpoint still returns 200."""
    history = [
        {"role": "user", "content": "What is BERT?"},
        {"role": "assistant", "content": "BERT is a pre-trained language model."},
        {"role": "user", "content": "How does it relate to Transformers?"},
        {"role": "assistant", "content": "BERT is built on the Transformer architecture."},
    ]

    mock_provider = AsyncMock()
    mock_provider.generate = AsyncMock(
        return_value=_make_llm_response("Building on the previous discussion about BERT...")
    )
    mock_provider.close = AsyncMock()

    with (
        patch("routers.seed_chat.settings") as mock_settings,
        patch("routers.seed_chat.GroqProvider", return_value=mock_provider),
    ):
        mock_settings.groq_api_key = "test-groq-key-12345"

        response = await test_client.post(
            "/api/seed-chat",
            json={
                "message": "What are the research gaps?",
                "graph_context": _make_graph_context(),
                "history": history,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert data["reply"] == "Building on the previous discussion about BERT..."

    # Verify generate was called (history embedded in prompt)
    mock_provider.generate.assert_called_once()
    call_kwargs = mock_provider.generate.call_args
    # The prompt should contain history content
    prompt_arg = call_kwargs.kwargs.get("prompt") or call_kwargs.args[0]
    assert "BERT" in prompt_arg
    assert "Transformer" in prompt_arg


@pytest.mark.asyncio
async def test_seed_chat_llm_error(test_client):
    """GroqProvider.generate raises an exception → 502 Bad Gateway."""
    mock_provider = AsyncMock()
    mock_provider.generate = AsyncMock(side_effect=RuntimeError("Groq API timeout"))
    mock_provider.close = AsyncMock()

    with (
        patch("routers.seed_chat.settings") as mock_settings,
        patch("routers.seed_chat.GroqProvider", return_value=mock_provider),
    ):
        mock_settings.groq_api_key = "test-groq-key-12345"

        response = await test_client.post(
            "/api/seed-chat",
            json={
                "message": "Tell me about the clusters.",
                "graph_context": _make_graph_context(),
                "history": [],
            },
        )

    assert response.status_code == 502
    # Provider.close() must be called even on error (finally block)
    mock_provider.close.assert_called_once()


@pytest.mark.asyncio
async def test_seed_chat_followups_shape(test_client):
    """suggested_followups is always a list of exactly 3 strings."""
    mock_provider = AsyncMock()
    mock_provider.generate = AsyncMock(return_value=_make_llm_response("Some analysis."))
    mock_provider.close = AsyncMock()

    with (
        patch("routers.seed_chat.settings") as mock_settings,
        patch("routers.seed_chat.GroqProvider", return_value=mock_provider),
    ):
        mock_settings.groq_api_key = "test-groq-key-12345"

        response = await test_client.post(
            "/api/seed-chat",
            json={
                "message": "What are the key findings?",
                "graph_context": _make_graph_context(),
                "history": [],
            },
        )

    assert response.status_code == 200
    followups = response.json()["suggested_followups"]
    assert len(followups) == 3
    for item in followups:
        assert isinstance(item, str)
        assert len(item) > 0


@pytest.mark.asyncio
async def test_seed_chat_missing_message(test_client):
    """Missing required 'message' field → 422 Unprocessable Entity."""
    response = await test_client.post(
        "/api/seed-chat",
        json={
            "graph_context": _make_graph_context(),
            "history": [],
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_seed_chat_missing_graph_context(test_client):
    """Missing required 'graph_context' field → 422 Unprocessable Entity."""
    response = await test_client.post(
        "/api/seed-chat",
        json={
            "message": "What are the themes?",
            "history": [],
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_seed_chat_minimal_graph_context(test_client):
    """Single paper, no clusters — endpoint still returns 200 and 3 followups."""
    single_paper_context = _make_graph_context(
        papers=[
            {
                "paper_id": "p1",
                "title": "Attention Is All You Need",
                "authors": ["Vaswani"],
                "year": 2017,
                "abstract_snippet": None,
                "fields": [],
                "citation_count": 0,
            }
        ],
        clusters=[],
        total_papers=1,
    )

    mock_provider = AsyncMock()
    mock_provider.generate = AsyncMock(return_value=_make_llm_response("Only one paper in the graph."))
    mock_provider.close = AsyncMock()

    with (
        patch("routers.seed_chat.settings") as mock_settings,
        patch("routers.seed_chat.GroqProvider", return_value=mock_provider),
    ):
        mock_settings.groq_api_key = "test-groq-key-12345"

        response = await test_client.post(
            "/api/seed-chat",
            json={
                "message": "Tell me about this paper.",
                "graph_context": single_paper_context,
                "history": [],
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Only one paper in the graph."
    assert len(data["suggested_followups"]) == 3


@pytest.mark.asyncio
async def test_seed_chat_provider_close_called_on_success(test_client):
    """GroqProvider.close() is always called after a successful request."""
    mock_provider = AsyncMock()
    mock_provider.generate = AsyncMock(return_value=_make_llm_response("Analysis complete."))
    mock_provider.close = AsyncMock()

    with (
        patch("routers.seed_chat.settings") as mock_settings,
        patch("routers.seed_chat.GroqProvider", return_value=mock_provider),
    ):
        mock_settings.groq_api_key = "test-groq-key-12345"

        response = await test_client.post(
            "/api/seed-chat",
            json={
                "message": "Describe the graph.",
                "graph_context": _make_graph_context(),
                "history": [],
            },
        )

    assert response.status_code == 200
    mock_provider.close.assert_called_once()
