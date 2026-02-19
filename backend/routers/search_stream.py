"""SSE search progress stream - provides UX feedback during searches."""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio
import json

router = APIRouter(tags=["Search Stream"])


@router.get("/api/search/stream")
async def stream_search_progress(q: str):
    """Stream search progress updates via SSE for UX feedback."""

    async def generate():
        stages = [
            (0.15, "fetch", "Searching OpenAlex..."),
            (0.30, "fetch", "Searching Semantic Scholar..."),
            (0.45, "fetch", "Merging and deduplicating papers..."),
            (0.60, "embed", "Computing SPECTER2 embeddings..."),
            (0.75, "layout", "Running UMAP 3D layout..."),
            (0.85, "cluster", "Clustering with HDBSCAN..."),
            (0.92, "edges", "Computing similarity edges..."),
            (0.98, "done", "Finalizing graph..."),
        ]

        for progress, stage, message in stages:
            data = json.dumps({"stage": stage, "progress": progress, "message": message})
            yield f"data: {data}\n\n"
            await asyncio.sleep(1.2)

        # Final done event
        yield f"data: {json.dumps({'stage': 'complete', 'progress': 1.0, 'message': 'Graph ready!'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
