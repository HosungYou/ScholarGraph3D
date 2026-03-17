#!/usr/bin/env python3
"""
Generate a frontend review fixture by calling the FastAPI app in-process.

This avoids needing to bind a local port just to freeze a real paper review case.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate ScholarGraph3D review fixture in-process")
    parser.add_argument("--paper-id", required=True, help="Seed paper ID used by /api/seed-explore")
    parser.add_argument("--slug", required=True, help="Output fixture filename slug")
    parser.add_argument("--label", help="Display label shown in review mode")
    parser.add_argument("--description", help="Short description for the fixture")
    parser.add_argument("--max-papers", type=int, default=40, help="Max papers for the seed graph")
    parser.add_argument("--expand-id", help="Optional node ID to precompute expand flow for")
    return parser.parse_args()


def derive_expand_target(graph: dict, explicit_expand_id: str | None) -> str:
    if explicit_expand_id:
      return explicit_expand_id

    seed_id = graph.get("meta", {}).get("seed_paper_id")
    if seed_id:
        return seed_id

    candidates = sorted(
        [node for node in graph.get("nodes", []) if node.get("s2_paper_id") or node.get("doi")],
        key=lambda node: (node.get("frontier_score") or 0, node.get("citation_count") or 0),
        reverse=True,
    )

    if not candidates:
        raise RuntimeError("No expandable node found in graph result")

    return candidates[0]["id"]


def map_expansion_node(node: dict) -> dict:
    return {
        "id": node.get("paper_id"),
        "s2_paper_id": node.get("paper_id"),
        "doi": node.get("doi") or None,
        "title": node.get("title") or "",
        "authors": node.get("authors") or [],
        "year": node.get("year") or 0,
        "venue": node.get("venue") or None,
        "citation_count": node.get("citation_count") or 0,
        "abstract": node.get("abstract") or None,
        "tldr": node.get("tldr") or None,
        "fields": node.get("fields") or [],
        "topics": [],
        "x": node.get("initial_x") or 0,
        "y": node.get("initial_y") or 0,
        "z": node.get("initial_z") or 0,
        "cluster_id": node.get("cluster_id", -1),
        "cluster_label": "Expanded",
        "is_open_access": node.get("is_open_access") or False,
        "oa_url": node.get("oa_url") or None,
        "frontier_score": node.get("frontier_score") or 0,
        "is_bridge": False,
    }


def main() -> int:
    args = parse_args()

    backend_root = Path(__file__).resolve().parents[1]
    repo_root = backend_root.parent
    frontend_fixture_dir = repo_root / "frontend" / "public" / "review-fixtures"

    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from main import app
    import httpx

    label = args.label or f"Live Review: {args.slug}"
    description = args.description or f"Generated in-process for paper {args.paper_id}."

    async def run() -> None:
        transport = httpx.ASGITransport(app=app)

        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=transport, base_url="http://scholargraph3d.local") as client:
                print(f"[fixture] fetching seed graph for {args.paper_id}")
                graph_response = await client.post(
                    "/api/seed-explore",
                    json={
                        "paper_id": args.paper_id,
                        "depth": 1,
                        "max_papers": args.max_papers,
                        "include_references": True,
                        "include_citations": True,
                    },
                )
                graph_response.raise_for_status()
                graph = graph_response.json()

                print("[fixture] fetching network overview")
                overview_response = await client.post(
                    "/api/network-overview",
                    json={
                        "graph_context": {
                            "papers": graph["nodes"],
                            "edges": graph["edges"],
                            "clusters": graph["clusters"],
                        }
                    },
                )
                overview = overview_response.json() if overview_response.is_success else None

                expand_target_id = derive_expand_target(graph, args.expand_id)
                expand_target_node = next(
                    (
                        node
                        for node in graph["nodes"]
                        if node["id"] == expand_target_id or node.get("s2_paper_id") == expand_target_id
                    ),
                    None,
                )
                if expand_target_node is None:
                    raise RuntimeError(f'Expand target "{expand_target_id}" was not found in graph nodes')

                expand_request_id = (
                    expand_target_node.get("s2_paper_id")
                    or (f'DOI:{expand_target_node["doi"]}' if expand_target_node.get("doi") else expand_target_node["id"])
                )

                print(f"[fixture] precomputing expand flow for {expand_request_id}")
                expansion_response = await client.post(
                    f"/api/papers/{expand_request_id}/expand-stable",
                    json={
                        "existing_nodes": [
                            {
                                "id": node["id"],
                                "x": node["x"],
                                "y": node["y"],
                                "z": node["z"],
                                "cluster_id": node["cluster_id"],
                            }
                            for node in graph["nodes"]
                        ],
                        "limit": 20,
                    },
                )
                expansion_response.raise_for_status()
                expansion = expansion_response.json()

                fixture = {
                    "id": args.slug,
                    "label": label,
                    "description": description,
                    "graph": graph,
                    "overview": overview,
                    "expansions": {
                        expand_target_node["id"]: {
                            "nodes": [map_expansion_node(node) for node in expansion.get("nodes", [])],
                            "edges": expansion.get("edges", []),
                            "meta": expansion.get("meta"),
                        }
                    },
                }

                frontend_fixture_dir.mkdir(parents=True, exist_ok=True)
                out_file = frontend_fixture_dir / f"{args.slug}.json"
                out_file.write_text(json.dumps(fixture, indent=2), encoding="utf-8")

                print(f"[fixture] wrote {out_file}")
                print(f"[fixture] open /explore/seed?fixture={args.slug}")

    try:
        asyncio.run(run())
    except Exception as exc:
        print("[fixture] generation failed", file=sys.stderr)
        print(f"[fixture] {exc}", file=sys.stderr)
        print(
            "[fixture] If this failed during seed-explore, verify outbound access to Semantic Scholar/OpenAlex and confirm backend env configuration.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
