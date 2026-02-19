"""
Chat router for ScholarGraph3D.

Provides GraphRAG-powered chat endpoints that use the current graph state
as context for LLM conversations. Users must provide their own API key.
"""

import json
import logging
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from database import Database, get_db
from graph.graph_rag import GraphRAGContextBuilder

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class GraphDataInput(BaseModel):
    papers: List[Dict[str, Any]] = []
    clusters: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    gaps: List[Dict[str, Any]] = []


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    graph_data: GraphDataInput
    provider: str = Field(..., description="LLM provider: openai|anthropic|google|groq")
    api_key: str = Field(..., min_length=1, description="User's LLM API key")
    model: Optional[str] = None
    conversation_history: List[ChatMessage] = []


class CitationRef(BaseModel):
    paper_id: str
    title: str
    index: int


class ChatResponse(BaseModel):
    answer: str
    citations: List[CitationRef]
    highlighted_papers: List[str]
    suggested_followups: List[str]


# ==================== Constants ====================

_DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-20250514",
    "google": "gemini-2.0-flash",
    "groq": "llama-3.1-70b-versatile",
}

_FOLLOWUP_SUFFIX = (
    "\n\nBased on the graph data, suggest 3 concise follow-up questions "
    "the user might ask next. Format them as a JSON array of strings at "
    "the very end of your response, on its own line, prefixed with "
    "FOLLOWUPS: "
)


# ==================== Endpoints ====================

@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Database = Depends(get_db)):
    """
    GraphRAG chat endpoint.

    Pipeline:
    1. Build RAG context from graph_data
    2. Create LLM messages with system prompt + conversation history
    3. Generate response with user's API key
    4. Extract citation references and highlighted paper IDs
    5. Parse suggested follow-up questions
    """
    # 1. Build RAG context
    context_builder = GraphRAGContextBuilder(db)
    rag_context = await context_builder.build_context(
        query=request.query,
        graph_data=request.graph_data.model_dump(),
    )

    # 2. Build messages
    system_prompt = rag_context.context_string + _FOLLOWUP_SUFFIX
    messages = _build_messages(system_prompt, request.conversation_history, request.query)

    # 3. Call LLM
    provider = request.provider.lower()
    model = request.model or _DEFAULT_MODELS.get(provider, "unknown")

    try:
        raw_answer = await _call_llm_chat(
            provider=provider,
            api_key=request.api_key,
            model=model,
            messages=messages,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Chat LLM call failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"LLM provider error: {type(e).__name__}: {str(e)}"
        )

    # 4. Parse response
    answer, followups = _extract_followups(raw_answer)
    citations = _extract_citations(answer, rag_context.papers)
    highlighted = _extract_highlighted_papers(answer, rag_context.papers)

    return ChatResponse(
        answer=answer,
        citations=citations,
        highlighted_papers=highlighted,
        suggested_followups=followups,
    )


@router.post("/api/chat/stream")
async def chat_stream(request: ChatRequest, db: Database = Depends(get_db)):
    """
    Streaming GraphRAG chat endpoint.

    Same pipeline as /api/chat but returns a StreamingResponse
    with Server-Sent Events for real-time output.
    """
    # Build RAG context
    context_builder = GraphRAGContextBuilder(db)
    rag_context = await context_builder.build_context(
        query=request.query,
        graph_data=request.graph_data.model_dump(),
    )

    system_prompt = rag_context.context_string
    messages = _build_messages(system_prompt, request.conversation_history, request.query)

    provider = request.provider.lower()
    model = request.model or _DEFAULT_MODELS.get(provider, "unknown")

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            full_text = ""
            async for chunk in _stream_llm_chat(
                provider=provider,
                api_key=request.api_key,
                model=model,
                messages=messages,
            ):
                full_text += chunk
                # SSE format
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

            # Send final metadata
            citations = _extract_citations(full_text, rag_context.papers)
            highlighted = _extract_highlighted_papers(full_text, rag_context.papers)

            yield f"data: {json.dumps({'type': 'done', 'citations': [c.model_dump() for c in citations], 'highlighted_papers': highlighted})}\n\n"

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ==================== Helpers ====================

def _build_messages(
    system_prompt: str,
    history: List[ChatMessage],
    query: str,
) -> List[Dict[str, str]]:
    """Build the message list for LLM API calls."""
    messages = [{"role": "system", "content": system_prompt}]

    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": query})
    return messages


def _extract_citations(
    answer: str,
    papers: List[Dict[str, Any]],
) -> List[CitationRef]:
    """Extract [1], [2], etc. citation markers and map to papers."""
    pattern = r"\[(\d+)\]"
    indices = set(int(m) for m in re.findall(pattern, answer))

    citations = []
    for idx in sorted(indices):
        # Citation indices are 1-based, paper list is 0-based
        paper_idx = idx - 1
        if 0 <= paper_idx < len(papers):
            paper = papers[paper_idx]
            citations.append(CitationRef(
                paper_id=str(paper.get("id", "")),
                title=paper.get("title", ""),
                index=idx,
            ))

    return citations


def _extract_highlighted_papers(
    answer: str,
    papers: List[Dict[str, Any]],
) -> List[str]:
    """
    Extract paper IDs that should be highlighted in the 3D graph.

    Papers referenced via citation markers get highlighted.
    """
    pattern = r"\[(\d+)\]"
    indices = set(int(m) for m in re.findall(pattern, answer))

    highlighted = []
    for idx in sorted(indices):
        paper_idx = idx - 1
        if 0 <= paper_idx < len(papers):
            pid = str(papers[paper_idx].get("id", ""))
            if pid:
                highlighted.append(pid)

    return highlighted


def _extract_followups(text: str) -> tuple:
    """
    Extract follow-up questions from the LLM response.

    Looks for a line starting with FOLLOWUPS: followed by a JSON array.
    Returns (clean_answer, followups_list).
    """
    followups = []
    answer = text

    # Look for FOLLOWUPS: line
    match = re.search(r"FOLLOWUPS:\s*(\[.*?\])", text, re.DOTALL)
    if match:
        try:
            followups = json.loads(match.group(1))
            # Remove the FOLLOWUPS line from the answer
            answer = text[:match.start()].rstrip()
        except (json.JSONDecodeError, IndexError):
            pass

    return answer, followups


# ==================== LLM Provider Calls ====================

async def _call_llm_chat(
    provider: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
) -> str:
    """Call LLM provider for chat completion (non-streaming)."""
    if provider == "openai":
        return await _openai_chat(api_key, model, messages)
    elif provider == "anthropic":
        return await _anthropic_chat(api_key, model, messages)
    elif provider == "google":
        return await _google_chat(api_key, model, messages)
    elif provider == "groq":
        return await _groq_chat(api_key, model, messages)
    else:
        raise ValueError(f"Unsupported provider: {provider}. Use: openai, anthropic, google, groq")


async def _stream_llm_chat(
    provider: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
) -> AsyncGenerator[str, None]:
    """Stream LLM provider response chunks."""
    if provider == "openai":
        async for chunk in _openai_stream(api_key, model, messages):
            yield chunk
    elif provider == "anthropic":
        async for chunk in _anthropic_stream(api_key, model, messages):
            yield chunk
    elif provider == "google":
        async for chunk in _google_stream(api_key, model, messages):
            yield chunk
    elif provider == "groq":
        async for chunk in _groq_stream(api_key, model, messages):
            yield chunk
    else:
        raise ValueError(f"Unsupported provider: {provider}")


# -- OpenAI --

async def _openai_chat(api_key: str, model: str, messages: List[Dict[str, str]]) -> str:
    import httpx

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 2000},
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def _openai_stream(
    api_key: str, model: str, messages: List[Dict[str, str]]
) -> AsyncGenerator[str, None]:
    import httpx

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 2000, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue


# -- Anthropic --

async def _anthropic_chat(api_key: str, model: str, messages: List[Dict[str, str]]) -> str:
    import httpx

    # Anthropic uses a separate system parameter
    system_msg = ""
    chat_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_msg = msg["content"]
        else:
            chat_messages.append(msg)

    body: Dict[str, Any] = {
        "model": model,
        "max_tokens": 2000,
        "messages": chat_messages,
    }
    if system_msg:
        body["system"] = system_msg

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        )
        response.raise_for_status()
        return response.json()["content"][0]["text"]


async def _anthropic_stream(
    api_key: str, model: str, messages: List[Dict[str, str]]
) -> AsyncGenerator[str, None]:
    import httpx

    system_msg = ""
    chat_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_msg = msg["content"]
        else:
            chat_messages.append(msg)

    body: Dict[str, Any] = {
        "model": model,
        "max_tokens": 2000,
        "messages": chat_messages,
        "stream": True,
    }
    if system_msg:
        body["system"] = system_msg

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if data.get("type") == "content_block_delta":
                            text = data.get("delta", {}).get("text", "")
                            if text:
                                yield text
                    except (json.JSONDecodeError, KeyError):
                        continue


# -- Google Gemini --

async def _google_chat(api_key: str, model: str, messages: List[Dict[str, str]]) -> str:
    import httpx

    # Convert messages to Gemini format
    contents = _to_gemini_contents(messages)

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json={
                "contents": contents,
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2000},
            },
        )
        response.raise_for_status()
        return response.json()["candidates"][0]["content"]["parts"][0]["text"]


async def _google_stream(
    api_key: str, model: str, messages: List[Dict[str, str]]
) -> AsyncGenerator[str, None]:
    import httpx

    contents = _to_gemini_contents(messages)

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent",
            params={"key": api_key, "alt": "sse"},
            headers={"Content-Type": "application/json"},
            json={
                "contents": contents,
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2000},
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                        for part in parts:
                            text = part.get("text", "")
                            if text:
                                yield text
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue


def _to_gemini_contents(messages: List[Dict[str, str]]) -> List[Dict]:
    """Convert OpenAI-style messages to Gemini contents format."""
    contents = []
    system_text = ""

    for msg in messages:
        if msg["role"] == "system":
            system_text = msg["content"]
        elif msg["role"] == "user":
            text = msg["content"]
            if system_text and not contents:
                # Prepend system prompt to first user message
                text = f"{system_text}\n\n{text}"
                system_text = ""
            contents.append({"role": "user", "parts": [{"text": text}]})
        elif msg["role"] == "assistant":
            contents.append({"role": "model", "parts": [{"text": msg["content"]}]})

    return contents


# -- Groq (OpenAI-compatible) --

async def _groq_chat(api_key: str, model: str, messages: List[Dict[str, str]]) -> str:
    import httpx

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 2000},
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def _groq_stream(
    api_key: str, model: str, messages: List[Dict[str, str]]
) -> AsyncGenerator[str, None]:
    import httpx

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 2000, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
