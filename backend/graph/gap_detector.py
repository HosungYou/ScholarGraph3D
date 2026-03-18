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

# ── Weight constants (3-dimension scoring) ──
WEIGHT_STRUCTURAL = 0.40
WEIGHT_RELATEDNESS = 0.35
WEIGHT_TEMPORAL = 0.25


@dataclass
class StructuralGap:
    """A detected research gap between two clusters."""

    gap_id: str
    cluster_a: Dict[str, Any]  # {id, label, paper_count}
    cluster_b: Dict[str, Any]
    gap_strength: float  # 0 (well-connected) to 1 (complete gap)
    bridge_papers: List[Dict[str, Any]] = field(default_factory=list)  # [{paper_id, title, score}]
    potential_edges: List[Dict[str, Any]] = field(default_factory=list)  # [{source, target, similarity}]
    research_questions: List[Any] = field(default_factory=list)  # Dict (grounded)
    gap_score_breakdown: Dict[str, float] = field(default_factory=dict)  # {structural, relatedness, temporal, composite}
    key_papers_a: List[Dict] = field(default_factory=list)  # cluster A top 3 papers {paper_id, title, tldr, citation_count}
    key_papers_b: List[Dict] = field(default_factory=list)  # cluster B top 3 papers
    temporal_context: Dict = field(default_factory=dict)  # {year_range_a, year_range_b, overlap_years}
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
        node_metrics: Optional[Dict[str, Dict[str, float]]] = None,
        cluster_quality: Optional[float] = None,
    ) -> GapAnalysisResult:
        """
        Detect structural gaps between clusters with 3-dimensional scoring.

        Args:
            papers: List of paper dicts with keys: id, title, cluster_id, embedding (optional), year, tldr, citation_count
            clusters: List of cluster dicts with keys: id, label, paper_count
            edges: List of edge dicts with keys: source, target, type, weight, intent (optional)
            citation_pairs: Unused (kept for API compatibility)
            intent_edges: Unused (kept for API compatibility)
            node_metrics: Unused (kept for API compatibility)
            cluster_quality: Silhouette score (0-1). When < 0.25, gap confidence is dampened.

        Returns:
            GapAnalysisResult with gaps, connectivity matrix, and summary
        """
        # Compute cluster quality constraints
        # Low silhouette → clusters may be meaningless → cap gap count + raise threshold
        self._cluster_quality = cluster_quality
        if cluster_quality is not None and cluster_quality < 0.25:
            logger.info(
                f"Low cluster quality (silhouette={cluster_quality:.3f}), "
                f"applying stricter gap filtering"
            )
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

            # ── Structural score (weight 0.40) ──
            max_possible = size_a * size_b
            structural_score = 1.0 - (actual_edges / max_possible) if max_possible > 0 else 1.0

            # ── Relatedness score (weight 0.35) ──
            centroid_a = cluster_centroids.get(cid_a)
            centroid_b = cluster_centroids.get(cid_b)
            if centroid_a is not None and centroid_b is not None:
                centroid_similarity = self._cosine_similarity(centroid_a, centroid_b)
                relatedness_score = centroid_similarity  # High similarity = more actionable gap
            else:
                centroid_similarity = 0.0
                relatedness_score = 0.5  # neutral fallback

            # ── Temporal score (weight 0.25) ──
            temporal_score, temporal_ctx = self._compute_temporal_score(papers_a, papers_b)

            # ── Composite score (3-dimension) ──
            composite = (
                WEIGHT_STRUCTURAL * structural_score
                + WEIGHT_RELATEDNESS * relatedness_score
                + WEIGHT_TEMPORAL * temporal_score
            )

            gap_score_breakdown = {
                "structural": round(structural_score, 4),
                "relatedness": round(relatedness_score, 4),
                "temporal": round(temporal_score, 4),
                "composite": round(composite, 4),
            }

            # Find bridge candidates using citation evidence + embedding similarity
            bridge_papers = self._find_bridge_papers(
                papers_a, papers_b, centroid_a, centroid_b, edges=edges,
            )

            # Find potential ghost edges (cross-cluster high-similarity pairs)
            potential_edges = self._find_potential_edges(
                papers_a, papers_b, threshold=0.5, top_k=5,
            )

            # Key papers per cluster (by citation count)
            key_papers_a = self._extract_key_papers(papers_a)
            key_papers_b = self._extract_key_papers(papers_b)

            # Temporal span for evidence
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
                    temporal_ctx,
                ),
                gap_score_breakdown=gap_score_breakdown,
                key_papers_a=key_papers_a,
                key_papers_b=key_papers_b,
                temporal_context=temporal_ctx,
                evidence_detail=evidence_detail,
            ))

        # Apply adaptive threshold filtering
        threshold = self._adaptive_threshold(gaps)

        # Raise threshold when cluster quality is low
        if self._cluster_quality is not None and self._cluster_quality < 0.25:
            # Boost threshold by up to +0.10 for very low quality
            quality_boost = 0.10 * (1.0 - self._cluster_quality / 0.25)
            threshold = min(0.85, threshold + quality_boost)
            logger.info(
                f"Quality-adjusted threshold: {threshold:.3f} "
                f"(boost +{quality_boost:.3f})"
            )

        significant_gaps = [g for g in gaps if g.gap_strength >= threshold]
        significant_gaps.sort(key=lambda g: g.gap_strength, reverse=True)

        # Cap gap count for low-quality clusters
        if self._cluster_quality is not None and self._cluster_quality < 0.25:
            # silhouette < 0.10 → max 2 gaps, 0.10-0.25 → max 5
            max_gaps = 2 if self._cluster_quality < 0.10 else 5
            if len(significant_gaps) > max_gaps:
                logger.info(
                    f"Capping gaps from {len(significant_gaps)} to {max_gaps} "
                    f"due to low cluster quality"
                )
                significant_gaps = significant_gaps[:max_gaps]

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
                "cluster_quality": round(self._cluster_quality, 4) if self._cluster_quality is not None else None,
                "quality_limited": (
                    self._cluster_quality is not None
                    and self._cluster_quality < 0.25
                ),
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

        # Q4: No cross-citations fallback
        actual_edges = evidence_detail.get("actual_edges", 0)
        max_possible = evidence_detail.get("max_possible_edges", 0)
        if actual_edges == 0:
            questions.append({
                "question": f"What shared mechanisms or theoretical principles could connect {label_a} and {label_b}?",
                "justification": "No cross-cluster citations detected — these areas have no documented connection.",
                "methodology_hint": "Conduct a scoping review to identify potential theoretical bridges.",
            })
        else:
            questions.append({
                "question": f"What datasets or tools from {label_a} could advance research in {label_b}?",
                "justification": f"Structural gap: {actual_edges}/{max_possible} possible connections exist.",
                "methodology_hint": "Inventory available datasets and tools in each cluster for cross-applicability.",
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
                    "question": f"What datasets or tools from {label_b} could advance research in {label_a}?",
                    "justification": f"Structural gap: {actual_edges}/{max_possible} possible connections exist.",
                    "methodology_hint": "Inventory available datasets and tools in each cluster for cross-applicability.",
                })

        return questions[:6]

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
        edges: Optional[List[Dict[str, Any]]] = None,
        top_n: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Find papers that bridge two clusters using citation evidence + embedding similarity.

        Citation score: papers cited by BOTH clusters are true bridges.
        Embedding score: geometric_mean(sim_to_centroid_a, sim_to_centroid_b) as fallback.
        Final score: citation-weighted hybrid, citations dominate when evidence exists.
        """
        papers_a_ids = {str(p.get("id", "")) for p in papers_a}
        papers_b_ids = {str(p.get("id", "")) for p in papers_b}

        # Count cross-cluster citations: who cites whom across the gap
        cited_by_a: Dict[str, int] = defaultdict(int)  # target -> count cited by A
        cited_by_b: Dict[str, int] = defaultdict(int)  # target -> count cited by B
        if edges:
            for edge in edges:
                src = str(edge.get("source", ""))
                tgt = str(edge.get("target", ""))
                if src in papers_a_ids and tgt not in papers_a_ids:
                    cited_by_a[tgt] += 1
                if src in papers_b_ids and tgt not in papers_b_ids:
                    cited_by_b[tgt] += 1
                # Also count reverse direction (cited paper cites across)
                if tgt in papers_a_ids and src not in papers_a_ids:
                    cited_by_a[src] += 1
                if tgt in papers_b_ids and src not in papers_b_ids:
                    cited_by_b[src] += 1

        n_a = max(1, len(papers_a_ids))
        n_b = max(1, len(papers_b_ids))

        all_papers = papers_a + papers_b
        candidates: List[Tuple[float, int, int, float, float, Dict[str, Any]]] = []

        for paper in all_papers:
            pid = str(paper.get("id", ""))
            ca = cited_by_a.get(pid, 0)
            cb = cited_by_b.get(pid, 0)

            # Normalized citation bridge score: geometric mean of cross-citations
            citation_score = sqrt((ca / n_a) * (cb / n_b)) if ca > 0 and cb > 0 else 0.0

            # Embedding similarity score
            sim_a, sim_b, sim_score = 0.0, 0.0, 0.0
            emb = paper.get("embedding")
            if emb is not None and centroid_a is not None and centroid_b is not None:
                emb_arr = np.array(emb)
                sim_a = self._cosine_similarity(emb_arr, centroid_a)
                sim_b = self._cosine_similarity(emb_arr, centroid_b)
                if sim_a > 0 and sim_b > 0:
                    sim_score = sqrt(sim_a * sim_b)

            # Hybrid: citation evidence dominates, embedding as fallback
            if ca > 0 and cb > 0:
                final_score = 0.7 * citation_score + 0.3 * sim_score
            elif (ca > 0 or cb > 0) and sim_score > 0.5:
                final_score = 0.15 * sim_score  # weak single-side signal
            else:
                final_score = 0.3 * sim_score   # embedding-only fallback

            if final_score > 0:
                candidates.append((final_score, ca, cb, sim_a, sim_b, paper))

        # Sort: citation-evidence papers first, then embedding-only
        candidates.sort(key=lambda x: x[0], reverse=True)

        results = []
        for score, ca, cb, sim_a, sim_b, paper in candidates[:top_n]:
            results.append({
                "paper_id": str(paper.get("id", "")),
                "title": paper.get("title", ""),
                "score": round(score, 4),
                "sim_to_cluster_a": round(float(sim_a), 4),
                "sim_to_cluster_b": round(float(sim_b), 4),
                "cited_by_a_count": ca,
                "cited_by_b_count": cb,
            })
        return results

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
    def _extract_key_papers(
        papers: List[Dict[str, Any]],
        top_n: int = 3,
        node_metrics: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> List[Dict]:
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
    def _compute_structural_score(
        actual_edges: int,
        max_possible: int,
    ) -> float:
        """Compute structural gap score from edge density."""
        return 1.0 - (actual_edges / max_possible) if max_possible > 0 else 1.0

    @staticmethod
    def _compute_relatedness_score(
        centroid_a: Optional[np.ndarray],
        centroid_b: Optional[np.ndarray],
    ) -> float:
        """Compute relatedness score from embedding centroids."""
        if centroid_a is None or centroid_b is None:
            return 0.5
        norm_a = np.linalg.norm(centroid_a)
        norm_b = np.linalg.norm(centroid_b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(centroid_a, centroid_b) / (norm_a * norm_b))

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
