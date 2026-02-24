"""
Research gap detection between clusters.

Analyzes inter-cluster citation density and embedding similarity
to identify structural gaps where research connections are missing.
"""

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from itertools import combinations
from math import sqrt
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class StructuralGap:
    """A detected research gap between two clusters."""

    gap_id: str
    cluster_a: Dict[str, Any]  # {id, label, paper_count}
    cluster_b: Dict[str, Any]
    gap_strength: float  # 0 (well-connected) to 1 (complete gap)
    bridge_papers: List[Dict[str, Any]] = field(default_factory=list)  # [{paper_id, title, score}]
    potential_edges: List[Dict[str, Any]] = field(default_factory=list)  # [{source, target, similarity}]
    research_questions: List[Any] = field(default_factory=list)  # str (legacy) or Dict (grounded)
    gap_score_breakdown: Dict[str, float] = field(default_factory=dict)  # {structural, relatedness, temporal, intent, directional, composite}
    key_papers_a: List[Dict] = field(default_factory=list)  # cluster A top 3 papers {paper_id, title, tldr, citation_count}
    key_papers_b: List[Dict] = field(default_factory=list)  # cluster B top 3 papers
    temporal_context: Dict = field(default_factory=dict)  # {year_range_a, year_range_b, overlap_years}
    intent_summary: Dict = field(default_factory=dict)  # {background, methodology, result} cross-citation distribution
    evidence_detail: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GapAnalysisResult:
    """Complete gap analysis across all cluster pairs."""

    gaps: List[StructuralGap] = field(default_factory=list)
    cluster_connectivity_matrix: Dict[str, int] = field(default_factory=dict)  # "(i,j)": edge_count
    summary: Dict[str, Any] = field(default_factory=dict)


class GapDetector:
    """
    Detects research gaps between clusters by analyzing:
    1. Inter-cluster citation/similarity edge density
    2. Cross-cluster embedding similarity for bridge candidates
    3. Potential "ghost edges" that could connect clusters
    """

    def detect_gaps(
        self,
        papers: List[Dict[str, Any]],
        clusters: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        citation_pairs: Optional[set] = None,
        intent_edges: Optional[List[Dict[str, Any]]] = None,
    ) -> GapAnalysisResult:
        """
        Detect structural gaps between clusters with multi-dimensional scoring.

        Args:
            papers: List of paper dicts with keys: id, title, cluster_id, embedding (optional), year, tldr, citation_count
            clusters: List of cluster dicts with keys: id, label, paper_count
            edges: List of edge dicts with keys: source, target, type, weight, intent (optional)
            citation_pairs: Set of (citing_id, cited_id) tuples for directional analysis
            intent_edges: List of edge dicts with intent field for intent distribution analysis

        Returns:
            GapAnalysisResult with gaps, connectivity matrix, and summary
        """
        if not papers or not clusters or len(clusters) < 2:
            return GapAnalysisResult(
                summary={"total_gaps": 0, "avg_gap_strength": 0.0, "strongest_gap": None}
            )

        # Filter out noise cluster
        valid_clusters = [c for c in clusters if c.get("id", -1) != -1]
        if len(valid_clusters) < 2:
            return GapAnalysisResult(
                summary={"total_gaps": 0, "avg_gap_strength": 0.0, "strongest_gap": None}
            )

        # Build cluster -> papers mapping
        cluster_papers: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        paper_by_id: Dict[str, Dict[str, Any]] = {}
        for paper in papers:
            cid = paper.get("cluster_id", -1)
            pid = str(paper.get("id", ""))
            paper_by_id[pid] = paper
            if cid != -1:
                cluster_papers[cid].append(paper)

        # Build paper_id -> cluster_id mapping
        paper_cluster: Dict[str, int] = {}
        for paper in papers:
            pid = str(paper.get("id", ""))
            paper_cluster[pid] = paper.get("cluster_id", -1)

        # Count inter-cluster edges
        connectivity = self._compute_connectivity(edges, paper_cluster, valid_clusters)

        # Compute cluster centroids if embeddings available
        cluster_centroids = self._compute_centroids(cluster_papers)

        # Detect gaps for each cluster pair
        gaps: List[StructuralGap] = []

        for cluster_a, cluster_b in combinations(valid_clusters, 2):
            cid_a = cluster_a["id"]
            cid_b = cluster_b["id"]

            papers_a = cluster_papers.get(cid_a, [])
            papers_b = cluster_papers.get(cid_b, [])
            size_a = len(papers_a)
            size_b = len(papers_b)

            if size_a == 0 or size_b == 0:
                continue

            # Count actual inter-cluster edges
            pair_key = self._pair_key(cid_a, cid_b)
            actual_edges = connectivity.get(pair_key, 0)

            # ── Structural score (weight 0.3) ──
            max_possible = size_a * size_b
            structural_score = 1.0 - (actual_edges / max_possible) if max_possible > 0 else 1.0

            # ── Semantic score (weight 0.25) ──
            centroid_a = cluster_centroids.get(cid_a)
            centroid_b = cluster_centroids.get(cid_b)
            if centroid_a is not None and centroid_b is not None:
                centroid_similarity = self._cosine_similarity(centroid_a, centroid_b)
                relatedness_score = centroid_similarity  # High similarity = more actionable gap
            else:
                centroid_similarity = 0.0
                relatedness_score = 0.5  # neutral fallback

            # ── Temporal score (weight 0.15) ──
            temporal_score, temporal_ctx = self._compute_temporal_score(papers_a, papers_b)

            # ── Intent score (weight 0.15) ──
            intent_score, intent_dist = self._compute_intent_score(
                cid_a, cid_b, paper_cluster, intent_edges or edges
            )

            # ── Directional score (weight 0.15) ──
            directional_score, citations_a_to_b, citations_b_to_a = self._compute_directional_score(
                cid_a, cid_b, paper_cluster, citation_pairs
            )

            # ── Composite score ──
            composite = (
                0.35 * structural_score
                + 0.25 * relatedness_score
                + 0.15 * temporal_score
                + 0.15 * intent_score
                + 0.10 * directional_score
            )

            gap_score_breakdown = {
                "structural": round(structural_score, 4),
                "relatedness": round(relatedness_score, 4),
                "temporal": round(temporal_score, 4),
                "intent": round(intent_score, 4),
                "directional": round(directional_score, 4),
                "composite": round(composite, 4),
            }

            # Find bridge candidates using centroid similarity
            bridge_papers = self._find_bridge_papers(
                papers_a, papers_b, centroid_a, centroid_b,
            )

            # Find potential ghost edges (cross-cluster high-similarity pairs)
            potential_edges = self._find_potential_edges(
                papers_a, papers_b, threshold=0.5, top_k=5,
            )

            # Key papers per cluster (top 3 by citation count)
            key_papers_a = self._extract_key_papers(papers_a)
            key_papers_b = self._extract_key_papers(papers_b)

            # Evidence detail for frontend explainability
            total_cross = sum(intent_dist.values()) if intent_dist else 0
            methodology_ratio = intent_dist.get("methodology", 0) / total_cross if total_cross > 0 else 0.0
            background_ratio = intent_dist.get("background", 0) / total_cross if total_cross > 0 else 0.0

            year_range_a = temporal_ctx.get("year_range_a", [0, 0])
            year_range_b = temporal_ctx.get("year_range_b", [0, 0])
            total_year_span = 0
            if year_range_a[0] > 0 and year_range_b[0] > 0:
                total_year_span = max(year_range_a[1], year_range_b[1]) - min(year_range_a[0], year_range_b[0]) + 1

            evidence_detail = {
                "actual_edges": actual_edges,
                "max_possible_edges": max_possible,
                "centroid_similarity": round(centroid_similarity, 4),
                "total_year_span": total_year_span,
                "total_cross_citations": citations_a_to_b + citations_b_to_a,
                "methodology_ratio": round(methodology_ratio, 4),
                "background_ratio": round(background_ratio, 4),
                "citations_a_to_b": citations_a_to_b,
                "citations_b_to_a": citations_b_to_a,
            }

            gaps.append(StructuralGap(
                gap_id=str(uuid.uuid4()),
                cluster_a={
                    "id": cid_a,
                    "label": cluster_a.get("label", f"Cluster {cid_a}"),
                    "paper_count": size_a,
                },
                cluster_b={
                    "id": cid_b,
                    "label": cluster_b.get("label", f"Cluster {cid_b}"),
                    "paper_count": size_b,
                },
                gap_strength=round(composite, 4),  # composite = gap_strength for backward compat
                bridge_papers=bridge_papers,
                potential_edges=potential_edges,
                research_questions=self._generate_grounded_questions(
                    cluster_a, cluster_b,
                    key_papers_a, key_papers_b,
                    bridge_papers, evidence_detail,
                    temporal_ctx, intent_dist,
                ),
                gap_score_breakdown=gap_score_breakdown,
                key_papers_a=key_papers_a,
                key_papers_b=key_papers_b,
                temporal_context=temporal_ctx,
                intent_summary=intent_dist,
                evidence_detail=evidence_detail,
            ))

        # Apply adaptive threshold filtering
        threshold = self._adaptive_threshold(gaps)
        significant_gaps = [g for g in gaps if g.gap_strength >= threshold]
        significant_gaps.sort(key=lambda g: g.gap_strength, reverse=True)

        # Build connectivity matrix for response
        connectivity_matrix = {
            str(k): v for k, v in connectivity.items()
        }

        # Summary
        avg_strength = (
            sum(g.gap_strength for g in significant_gaps) / len(significant_gaps)
            if significant_gaps
            else 0.0
        )
        strongest = significant_gaps[0] if significant_gaps else None

        result = GapAnalysisResult(
            gaps=significant_gaps,
            cluster_connectivity_matrix=connectivity_matrix,
            summary={
                "total_gaps": len(significant_gaps),
                "avg_gap_strength": round(avg_strength, 4),
                "strongest_gap": {
                    "gap_id": strongest.gap_id,
                    "clusters": (
                        strongest.cluster_a["label"],
                        strongest.cluster_b["label"],
                    ),
                    "strength": strongest.gap_strength,
                } if strongest else None,
                "threshold_used": round(threshold, 4),
            },
        )

        logger.info(
            f"Gap analysis: {len(significant_gaps)} significant gaps "
            f"(threshold={threshold:.3f}) from {len(gaps)} total pairs"
        )

        return result

    def _generate_grounded_questions(
        self,
        cluster_a: dict,
        cluster_b: dict,
        key_papers_a: List[Dict],
        key_papers_b: List[Dict],
        bridge_papers: List[Dict],
        evidence_detail: Dict,
        temporal_ctx: Dict,
        intent_dist: Dict,
    ) -> List[Dict]:
        """Generate research questions grounded in actual paper data."""
        questions: List[Dict] = []
        label_a = cluster_a.get("label", "Cluster A")
        label_b = cluster_b.get("label", "Cluster B")

        # Q1: Method transfer based on top paper
        top_a = key_papers_a[0] if key_papers_a else None
        top_b = key_papers_b[0] if key_papers_b else None

        if top_a and top_a.get("tldr"):
            questions.append({
                "question": f"How could the approach in '{top_a['title'][:80]}' ({top_a.get('citation_count', 0)} citations) be adapted for {label_b}?",
                "justification": f"Core finding — {top_a['tldr'][:150]} — has high influence in {label_a} but no citations from {label_b}.",
                "methodology_hint": f"Replicate methodology of {top_a['title'][:50]} with {label_b} datasets or populations.",
            })
        elif top_a:
            questions.append({
                "question": f"How might methods from '{top_a['title'][:80]}' be applied to {label_b}?",
                "justification": f"Top paper in {label_a} ({top_a.get('citation_count', 0)} citations) has no cross-cluster impact.",
                "methodology_hint": "Conduct a systematic comparison of methodological approaches across both domains.",
            })

        # Q2: Bridge paper extension
        if bridge_papers:
            bp = bridge_papers[0]
            bp_title = bp.get("title", "")[:80]
            sim_a = bp.get("sim_to_cluster_a", bp.get("score", 0))
            sim_b = bp.get("sim_to_cluster_b", bp.get("score", 0))
            questions.append({
                "question": f"What unexplored directions does '{bp_title}' suggest for connecting {label_a} and {label_b}?",
                "justification": f"Bridge paper has {sim_a:.0%} similarity to {label_a} and {sim_b:.0%} to {label_b}, spanning both areas.",
                "methodology_hint": "Trace how this paper's ideas have propagated in each cluster via citation network analysis.",
            })

        # Q3: Temporal gap
        year_range_a = temporal_ctx.get("year_range_a", [0, 0])
        year_range_b = temporal_ctx.get("year_range_b", [0, 0])
        overlap = temporal_ctx.get("overlap_years", 0)

        if overlap == 0 and year_range_a[0] > 0 and year_range_b[0] > 0:
            earlier = label_a if year_range_a[1] < year_range_b[0] else label_b
            later = label_b if earlier == label_a else label_a
            questions.append({
                "question": f"Why did {later} develop without building on foundational work from {earlier}?",
                "justification": f"No temporal overlap: {label_a} ({year_range_a[0]}-{year_range_a[1]}) vs {label_b} ({year_range_b[0]}-{year_range_b[1]}).",
                "methodology_hint": "Historical bibliometric analysis to identify missed knowledge transfer opportunities.",
            })
        elif overlap < 5 and year_range_a[0] > 0:
            questions.append({
                "question": f"What recent developments in {label_a} or {label_b} could enable cross-disciplinary research?",
                "justification": f"Only {overlap} years of overlapping publication history suggests emerging convergence.",
                "methodology_hint": "Focus on papers from the overlap period to identify early integration attempts.",
            })

        # Q4: Intent depth
        total_cross = sum(intent_dist.values()) if intent_dist else 0
        if total_cross > 0:
            bg_ratio = intent_dist.get("background", 0) / total_cross
            meth_ratio = intent_dist.get("methodology", 0) / total_cross
            if bg_ratio > 0.7:
                questions.append({
                    "question": f"How can {label_a} and {label_b} move beyond surface-level citations to deeper methodological exchange?",
                    "justification": f"{bg_ratio:.0%} of {total_cross} cross-citations are background references — no method sharing.",
                    "methodology_hint": "Design a study applying a method from one cluster to a problem in the other.",
                })
            elif meth_ratio > 0.3:
                questions.append({
                    "question": f"Which methods are being transferred between {label_a} and {label_b}, and what gaps remain?",
                    "justification": f"{meth_ratio:.0%} methodology citations suggest active but incomplete methodological exchange.",
                    "methodology_hint": "Map specific methods cited across clusters to identify untransferred techniques.",
                })
        else:
            questions.append({
                "question": f"What shared mechanisms or theoretical principles could connect {label_a} and {label_b}?",
                "justification": "No cross-cluster citations detected — these areas have no documented connection.",
                "methodology_hint": "Conduct a scoping review to identify potential theoretical bridges.",
            })

        # Q5: Directional asymmetry
        a_to_b = evidence_detail.get("citations_a_to_b", 0)
        b_to_a = evidence_detail.get("citations_b_to_a", 0)
        if a_to_b > 0 or b_to_a > 0:
            if a_to_b > b_to_a * 2:
                questions.append({
                    "question": f"Why does {label_a} cite {label_b} ({a_to_b}x) but not vice versa ({b_to_a}x)? What would {label_b} gain?",
                    "justification": f"Directional asymmetry ({a_to_b}:{b_to_a}) suggests one-way knowledge flow.",
                    "methodology_hint": "Interview researchers in both fields to understand barriers to bidirectional citation.",
                })
            elif b_to_a > a_to_b * 2:
                questions.append({
                    "question": f"Why does {label_b} cite {label_a} ({b_to_a}x) but not vice versa ({a_to_b}x)? What would {label_a} gain?",
                    "justification": f"Directional asymmetry ({a_to_b}:{b_to_a}) suggests one-way knowledge flow.",
                    "methodology_hint": "Interview researchers in both fields to understand barriers to bidirectional citation.",
                })

        # Fill to at least 3
        if len(questions) < 3:
            if top_b and top_b.get("tldr"):
                questions.append({
                    "question": f"Could a unified framework encompass {label_a} and the approach in '{top_b['title'][:80]}'?",
                    "justification": f"'{top_b['title'][:60]}' ({top_b.get('citation_count', 0)} cit.) represents {label_b} core: {top_b['tldr'][:100]}.",
                    "methodology_hint": "Develop a conceptual mapping between key constructs in both areas.",
                })
            else:
                questions.append({
                    "question": f"What datasets or tools from {label_a} could advance research in {label_b}?",
                    "justification": f"Structural gap: {evidence_detail.get('actual_edges', 0)}/{evidence_detail.get('max_possible_edges', 0)} possible connections exist.",
                    "methodology_hint": "Inventory available datasets and tools in each cluster for cross-applicability.",
                })

        return questions[:5]

    def _compute_connectivity(
        self,
        edges: List[Dict[str, Any]],
        paper_cluster: Dict[str, int],
        clusters: List[Dict[str, Any]],
    ) -> Dict[Tuple[int, int], int]:
        """Count edges between each cluster pair."""
        connectivity: Dict[Tuple[int, int], int] = defaultdict(int)

        for edge in edges:
            src_cluster = paper_cluster.get(str(edge.get("source", "")), -1)
            tgt_cluster = paper_cluster.get(str(edge.get("target", "")), -1)

            if src_cluster == -1 or tgt_cluster == -1:
                continue
            if src_cluster == tgt_cluster:
                continue

            pair = self._pair_key(src_cluster, tgt_cluster)
            connectivity[pair] += 1

        return dict(connectivity)

    def _compute_centroids(
        self,
        cluster_papers: Dict[int, List[Dict[str, Any]]],
    ) -> Dict[int, Optional[np.ndarray]]:
        """Compute mean embedding centroid for each cluster."""
        centroids: Dict[int, Optional[np.ndarray]] = {}

        for cid, papers in cluster_papers.items():
            embeddings = [
                np.array(p["embedding"])
                for p in papers
                if p.get("embedding") is not None
            ]
            if embeddings:
                centroids[cid] = np.mean(embeddings, axis=0)
            else:
                centroids[cid] = None

        return centroids

    def _find_bridge_papers(
        self,
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
        centroid_a: Optional[np.ndarray],
        centroid_b: Optional[np.ndarray],
        top_n: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Find papers that could bridge two clusters.

        Score = geometric_mean(sim_to_centroid_a, sim_to_centroid_b)
        """
        if centroid_a is None or centroid_b is None:
            return []

        all_papers = papers_a + papers_b
        candidates: List[Tuple[float, Dict[str, Any]]] = []

        for paper in all_papers:
            emb = paper.get("embedding")
            if emb is None:
                continue

            emb = np.array(emb)
            sim_a = self._cosine_similarity(emb, centroid_a)
            sim_b = self._cosine_similarity(emb, centroid_b)

            # Geometric mean of similarities to both centroids
            if sim_a > 0 and sim_b > 0:
                score = sqrt(sim_a * sim_b)
                candidates.append((score, paper))

        # Sort by score descending
        candidates.sort(key=lambda x: x[0], reverse=True)

        return [
            {
                "paper_id": str(p.get("id", "")),
                "title": p.get("title", ""),
                "score": round(score, 4),
                "sim_to_cluster_a": round(float(self._cosine_similarity(np.array(p["embedding"]), centroid_a)), 4),
                "sim_to_cluster_b": round(float(self._cosine_similarity(np.array(p["embedding"]), centroid_b)), 4),
            }
            for score, p in candidates[:top_n]
        ]

    def _find_potential_edges(
        self,
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
        threshold: float = 0.5,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Find cross-cluster paper pairs with high cosine similarity.

        These are "ghost edges" that represent potential research connections.
        """
        embeddings_a = [
            (p, np.array(p["embedding"]))
            for p in papers_a
            if p.get("embedding") is not None
        ]
        embeddings_b = [
            (p, np.array(p["embedding"]))
            for p in papers_b
            if p.get("embedding") is not None
        ]

        if not embeddings_a or not embeddings_b:
            return []

        candidates: List[Tuple[float, str, str]] = []

        # Vectorized computation for efficiency
        mat_a = np.array([e for _, e in embeddings_a])
        mat_b = np.array([e for _, e in embeddings_b])

        # Normalize
        norms_a = np.linalg.norm(mat_a, axis=1, keepdims=True)
        norms_b = np.linalg.norm(mat_b, axis=1, keepdims=True)
        norms_a = np.where(norms_a == 0, 1, norms_a)
        norms_b = np.where(norms_b == 0, 1, norms_b)
        norm_a = mat_a / norms_a
        norm_b = mat_b / norms_b

        # Similarity matrix
        sim_matrix = norm_a @ norm_b.T

        # Find pairs above threshold
        rows, cols = np.where(sim_matrix >= threshold)
        for r, c in zip(rows, cols):
            sim = float(sim_matrix[r, c])
            src_id = str(embeddings_a[r][0].get("id", ""))
            tgt_id = str(embeddings_b[c][0].get("id", ""))
            candidates.append((sim, src_id, tgt_id))

        # Sort by similarity descending, take top_k
        candidates.sort(key=lambda x: x[0], reverse=True)

        return [
            {
                "source": src,
                "target": tgt,
                "similarity": round(sim, 4),
            }
            for sim, src, tgt in candidates[:top_k]
        ]

    @staticmethod
    def _extract_key_papers(papers: List[Dict[str, Any]], top_n: int = 3) -> List[Dict]:
        """Extract top N papers by citation count from a cluster."""
        sorted_papers = sorted(
            papers,
            key=lambda p: p.get("citation_count", 0),
            reverse=True,
        )
        return [
            {
                "paper_id": str(p.get("id", "")),
                "title": p.get("title", ""),
                "tldr": p.get("tldr", ""),
                "citation_count": p.get("citation_count", 0),
            }
            for p in sorted_papers[:top_n]
        ]

    @staticmethod
    def _compute_temporal_score(
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
    ) -> Tuple[float, Dict]:
        """
        Compute temporal gap score based on year distribution non-overlap.

        Returns (score, context_dict).
        """
        years_a = [p.get("year") for p in papers_a if p.get("year")]
        years_b = [p.get("year") for p in papers_b if p.get("year")]

        if not years_a or not years_b:
            return 0.5, {"year_range_a": [0, 0], "year_range_b": [0, 0], "overlap_years": 0}

        min_a, max_a = min(years_a), max(years_a)
        min_b, max_b = min(years_b), max(years_b)

        # Compute year range overlap
        overlap_start = max(min_a, min_b)
        overlap_end = min(max_a, max_b)
        overlap_years = max(0, overlap_end - overlap_start + 1)

        total_span = max(max_a, max_b) - min(min_a, min_b) + 1
        non_overlap_ratio = 1.0 - (overlap_years / total_span) if total_span > 0 else 0.5

        context = {
            "year_range_a": [min_a, max_a],
            "year_range_b": [min_b, max_b],
            "overlap_years": overlap_years,
        }
        return round(non_overlap_ratio, 4), context

    def _compute_intent_score(
        self,
        cid_a: int,
        cid_b: int,
        paper_cluster: Dict[str, int],
        edges: List[Dict[str, Any]],
    ) -> Tuple[float, Dict]:
        """
        Compute intent-based gap score from cross-cluster citation intents.

        Higher methodology ratio in cross-citations indicates stronger methodological gap.
        Returns (score, distribution_dict).
        """
        intent_counts = {"background": 0, "methodology": 0, "result": 0}
        total_cross = 0

        for edge in edges:
            if edge.get("type") != "citation":
                continue
            src_cluster = paper_cluster.get(str(edge.get("source", "")), -1)
            tgt_cluster = paper_cluster.get(str(edge.get("target", "")), -1)

            pair = self._pair_key(src_cluster, tgt_cluster) if src_cluster != -1 and tgt_cluster != -1 else None
            target_pair = self._pair_key(cid_a, cid_b)

            if pair != target_pair:
                continue

            total_cross += 1
            intent = edge.get("intent", "background")
            if intent in ("methodology",):
                intent_counts["methodology"] += 1
            elif intent in ("result_comparison", "result"):
                intent_counts["result"] += 1
            else:
                intent_counts["background"] += 1

        if total_cross == 0:
            return 0.8, {"background": 0, "methodology": 0, "result": 0}

        # Higher methodology ratio → higher gap score (methods aren't being shared)
        methodology_ratio = intent_counts["methodology"] / total_cross
        # If most cross-citations are background, gap is significant
        background_ratio = intent_counts["background"] / total_cross
        score = 0.5 + 0.3 * background_ratio + 0.2 * (1.0 - methodology_ratio)
        score = min(1.0, max(0.0, score))

        return round(score, 4), intent_counts

    def _compute_directional_score(
        self,
        cid_a: int,
        cid_b: int,
        paper_cluster: Dict[str, int],
        citation_pairs: Optional[set] = None,
    ) -> Tuple[float, int, int]:
        """
        Compute directional asymmetry score between two clusters.

        A→B vs B→A citation imbalance indicates knowledge flow gap.
        Returns (score, a_to_b_count, b_to_a_count).
        """
        if not citation_pairs:
            return 0.5, 0, 0

        a_to_b = 0
        b_to_a = 0

        papers_in_a = {pid for pid, cid in paper_cluster.items() if cid == cid_a}
        papers_in_b = {pid for pid, cid in paper_cluster.items() if cid == cid_b}

        for citing_id, cited_id in citation_pairs:
            if citing_id in papers_in_a and cited_id in papers_in_b:
                a_to_b += 1
            elif citing_id in papers_in_b and cited_id in papers_in_a:
                b_to_a += 1

        total = a_to_b + b_to_a
        if total == 0:
            return 0.8, 0, 0  # No cross-citations = high gap

        # Asymmetry: |A→B - B→A| / (A→B + B→A)
        asymmetry = abs(a_to_b - b_to_a) / total
        return round(asymmetry, 4), a_to_b, b_to_a

    @staticmethod
    def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """Compute cosine similarity between two vectors."""
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    @staticmethod
    def _pair_key(a: int, b: int) -> Tuple[int, int]:
        """Canonical key for an unordered cluster pair."""
        return (min(a, b), max(a, b))

    @staticmethod
    def _adaptive_threshold(gaps: List[StructuralGap]) -> float:
        """
        Compute adaptive gap strength threshold.

        threshold = min(0.7, 25th_percentile + 0.1)
        """
        if not gaps:
            return 0.7

        strengths = sorted(g.gap_strength for g in gaps)
        n = len(strengths)

        # 25th percentile
        idx = max(0, int(n * 0.25) - 1)
        p25 = strengths[idx]

        return min(0.7, p25 + 0.1)
