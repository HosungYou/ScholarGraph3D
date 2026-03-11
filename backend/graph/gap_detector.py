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
    gap_score_breakdown: Dict[str, float] = field(default_factory=dict)  # {structural, relatedness, temporal, intent, directional, structural_holes, composite}
    key_papers_a: List[Dict] = field(default_factory=list)  # cluster A top 3 papers {paper_id, title, tldr, citation_count}
    key_papers_b: List[Dict] = field(default_factory=list)  # cluster B top 3 papers
    temporal_context: Dict = field(default_factory=dict)  # {year_range_a, year_range_b, overlap_years}
    intent_summary: Dict = field(default_factory=dict)  # {background, methodology, result} cross-citation distribution
    evidence_detail: Dict[str, Any] = field(default_factory=dict)
    actionability: Optional["GapActionability"] = None


@dataclass
class GapActionability:
    """Actionability assessment for a research gap."""

    score: float  # 0-1 composite actionability
    breakdown: Dict[str, float] = field(default_factory=dict)  # sub-dimension scores
    recommendation: str = "high_opportunity"  # high_opportunity | needs_collaboration | infrastructure_gap | terminology_barrier


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
        Detect structural gaps between clusters with multi-dimensional scoring.

        Args:
            papers: List of paper dicts with keys: id, title, cluster_id, embedding (optional), year, tldr, citation_count
            clusters: List of cluster dicts with keys: id, label, paper_count
            edges: List of edge dicts with keys: source, target, type, weight, intent (optional)
            citation_pairs: Set of (citing_id, cited_id) tuples for directional analysis
            intent_edges: List of edge dicts with intent field for intent distribution analysis
            node_metrics: Dict mapping paper_id to {pagerank, betweenness} from SNA computation
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

            # ── Directional score (weight 0.10) ──
            directional_score, citations_a_to_b, citations_b_to_a = self._compute_directional_score(
                cid_a, cid_b, paper_cluster, citation_pairs
            )

            # ── Structural holes score (weight 0.12) ──
            structural_holes_score = self._compute_structural_holes_score(
                cid_a, cid_b, paper_cluster, edges
            )

            # ── Influence score (weight 0.08) — PageRank/Betweenness gap scoring ──
            influence_score = self._compute_influence_score(
                cid_a, cid_b, papers_a, papers_b, node_metrics
            )

            # ── Author silo score (weight 0.06) ──
            author_silo_score, author_detail = self._compute_author_overlap_score(papers_a, papers_b)

            # ── Venue diversity score (weight 0.06) ──
            venue_diversity_score, venue_detail = self._compute_venue_diversity_score(papers_a, papers_b)

            # ── Composite score (rebalanced 9-dimension) ──
            raw_composite = (
                0.20 * structural_score
                + 0.20 * relatedness_score
                + 0.10 * temporal_score
                + 0.10 * intent_score
                + 0.08 * directional_score
                + 0.12 * structural_holes_score
                + 0.08 * influence_score
                + 0.06 * author_silo_score
                + 0.06 * venue_diversity_score
            )
            composite = raw_composite

            gap_score_breakdown = {
                "structural": round(structural_score, 4),
                "relatedness": round(relatedness_score, 4),
                "temporal": round(temporal_score, 4),
                "intent": round(intent_score, 4),
                "directional": round(directional_score, 4),
                "structural_holes": round(structural_holes_score, 4),
                "influence": round(influence_score, 4),
                "author_silo": round(author_silo_score, 4),
                "venue_diversity": round(venue_diversity_score, 4),
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

            # Key papers per cluster (top 3 by PageRank if available, else citation count)
            key_papers_a = self._extract_key_papers(papers_a, node_metrics=node_metrics)
            key_papers_b = self._extract_key_papers(papers_b, node_metrics=node_metrics)

            # Evidence detail for frontend explainability
            total_cross = sum(intent_dist.values()) if intent_dist else 0
            methodology_ratio = intent_dist.get("methodology", 0) / total_cross if total_cross > 0 else 0.0
            background_ratio = intent_dist.get("background", 0) / total_cross if total_cross > 0 else 0.0

            year_range_a = temporal_ctx.get("year_range_a", [0, 0])
            year_range_b = temporal_ctx.get("year_range_b", [0, 0])
            total_year_span = 0
            if year_range_a[0] > 0 and year_range_b[0] > 0:
                total_year_span = max(year_range_a[1], year_range_b[1]) - min(year_range_a[0], year_range_b[0]) + 1

            # Terminology barrier detection
            abstracts_a = [p.get("abstract", "") or "" for p in papers_a]
            abstracts_b = [p.get("abstract", "") or "" for p in papers_b]
            terminology_detail = self._compute_terminology_barrier(
                abstracts_a, abstracts_b, centroid_similarity
            )

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
                # Author silo details
                "shared_author_count": author_detail.get("shared_author_count", 0),
                "unique_authors_a": author_detail.get("unique_authors_a", 0),
                "unique_authors_b": author_detail.get("unique_authors_b", 0),
                # Venue diversity details
                "venues_a": venue_detail.get("venues_a", []),
                "venues_b": venue_detail.get("venues_b", []),
                "shared_venues": venue_detail.get("shared_venues", []),
                # Terminology barrier details
                "shared_terms": terminology_detail.get("shared_terms", []),
                "unique_terms_a": terminology_detail.get("unique_terms_a", []),
                "unique_terms_b": terminology_detail.get("unique_terms_b", []),
                "terminology_barrier": terminology_detail.get("terminology_barrier", False),
            }

            # Compute actionability score
            actionability = self._compute_actionability(
                bridge_papers, key_papers_a, key_papers_b,
                papers_a, papers_b, temporal_ctx,
                background_ratio, methodology_ratio,
                terminology_detail,
            )

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
                actionability=actionability,
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

        # Q6: Author silo
        if evidence_detail.get("shared_author_count", 0) == 0:
            unique_a = evidence_detail.get("unique_authors_a", 0)
            unique_b = evidence_detail.get("unique_authors_b", 0)
            if unique_a > 0 and unique_b > 0:
                questions.append({
                    "question": f"Why is there no researcher overlap between {label_a} ({unique_a} authors) and {label_b} ({unique_b} authors)?",
                    "justification": f"Complete author silo: 0 shared authors between {unique_a} and {unique_b} unique researchers.",
                    "methodology_hint": "Map researcher collaboration networks to identify potential cross-domain matchmakers.",
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
    def _extract_key_papers(
        papers: List[Dict[str, Any]],
        top_n: int = 3,
        node_metrics: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> List[Dict]:
        """Extract top N papers by PageRank (if available) or citation count from a cluster."""
        if node_metrics:
            # Sort by PageRank when SNA metrics are available
            sorted_papers = sorted(
                papers,
                key=lambda p: node_metrics.get(str(p.get("id", "")), {}).get("pagerank", 0.0),
                reverse=True,
            )
        else:
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

    def _compute_structural_holes_score(
        self,
        cid_a: int,
        cid_b: int,
        paper_cluster: Dict[str, int],
        edges: List[Dict[str, Any]],
    ) -> float:
        """
        Compute structural holes score between two clusters using Burt's constraint.

        Nodes that span structural holes have low constraint values.
        High average constraint among cross-cluster nodes → larger structural hole → higher gap score.

        Returns a score from 0 (well-brokered, no hole) to 1 (deep structural hole).
        """
        try:
            import networkx as nx
        except ImportError:
            return 0.5  # neutral fallback

        papers_in_a = {pid for pid, cid in paper_cluster.items() if cid == cid_a}
        papers_in_b = {pid for pid, cid in paper_cluster.items() if cid == cid_b}
        combined = papers_in_a | papers_in_b

        if len(combined) < 4:
            return 0.5

        # Build subgraph for the two clusters
        G = nx.Graph()
        G.add_nodes_from(combined)
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            if src in combined and tgt in combined:
                G.add_edge(src, tgt)

        if G.number_of_edges() == 0:
            return 0.9  # no edges = strong structural hole

        # Compute constraint for cross-cluster nodes
        try:
            constraint = nx.constraint(G)
        except Exception:
            return 0.5

        # Focus on nodes that have connections in both clusters
        cross_nodes = []
        for node in combined:
            neighbors = set(G.neighbors(node))
            has_a = bool(neighbors & papers_in_a)
            has_b = bool(neighbors & papers_in_b)
            if has_a and has_b:
                cross_nodes.append(node)

        if not cross_nodes:
            return 0.8  # no cross-cluster nodes = significant hole

        # Average constraint of cross-cluster nodes
        # High constraint = few brokerage opportunities = deeper hole
        avg_constraint = sum(
            constraint.get(n, 1.0) for n in cross_nodes
        ) / len(cross_nodes)

        # Normalize: constraint ranges 0-1 for well-connected, can exceed 1
        score = min(1.0, avg_constraint)
        return round(score, 4)

    def _compute_influence_score(
        self,
        cid_a: int,
        cid_b: int,
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
        node_metrics: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> float:
        """
        Compute influence-based gap score using PageRank and Betweenness centrality.

        Formula: (mean_pr_A * mean_pr_B) * (1 - max_betweenness_cross_normalized)
        High-influence clusters with no cross-cluster brokers → higher gap score.

        Returns a score from 0 to 1.
        """
        if not node_metrics:
            return 0.5  # neutral fallback when metrics unavailable

        def _get_metrics(papers: List[Dict]) -> Tuple[List[float], List[float]]:
            prs, bets = [], []
            for p in papers:
                pid = str(p.get("id", ""))
                m = node_metrics.get(pid, {})
                prs.append(m.get("pagerank", 0.0))
                bets.append(m.get("betweenness", 0.0))
            return prs, bets

        prs_a, bets_a = _get_metrics(papers_a)
        prs_b, bets_b = _get_metrics(papers_b)

        mean_pr_a = np.mean(prs_a) if prs_a else 0.0
        mean_pr_b = np.mean(prs_b) if prs_b else 0.0

        # Combine betweenness from both clusters, find max (cross-cluster broker)
        all_betweenness = bets_a + bets_b
        max_bet = max(all_betweenness) if all_betweenness else 0.0
        # Normalize betweenness (it's already 0-1 from networkx for normalized=True,
        # but values are often very small, so cap at 1.0)
        max_bet_norm = min(1.0, max_bet)

        # PageRank product indicates combined influence of the two clusters
        # Normalize: PageRank values are typically small (1/N), so scale up
        n_total = len(papers_a) + len(papers_b)
        if n_total > 0:
            pr_product = (mean_pr_a * n_total) * (mean_pr_b * n_total)
        else:
            pr_product = 0.0

        # Clamp pr_product to [0, 1]
        pr_product = min(1.0, pr_product)

        # Score: high influence clusters with low cross-cluster brokerage = high gap
        score = pr_product * (1.0 - max_bet_norm)

        # Ensure reasonable range — blend with neutral to avoid extreme values
        score = 0.3 + 0.7 * score
        return round(min(1.0, max(0.0, score)), 4)

    @staticmethod
    def _compute_author_overlap_score(
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Compute author silo score based on Jaccard index of author sets.

        score = 1 - jaccard (no overlap = high gap)
        Returns (score, detail_dict).
        """
        authors_a: Set[str] = set()
        authors_b: Set[str] = set()

        for p in papers_a:
            for author in (p.get("authors") or []):
                # Handle both dict-style and string-style author entries
                if isinstance(author, dict):
                    aid = author.get("authorId") or author.get("id") or author.get("name", "")
                else:
                    aid = str(author)
                if aid:
                    authors_a.add(aid)

        for p in papers_b:
            for author in (p.get("authors") or []):
                if isinstance(author, dict):
                    aid = author.get("authorId") or author.get("id") or author.get("name", "")
                else:
                    aid = str(author)
                if aid:
                    authors_b.add(aid)

        if not authors_a and not authors_b:
            return 0.5, {"shared_author_count": 0, "unique_authors_a": 0, "unique_authors_b": 0}

        shared = authors_a & authors_b
        union = authors_a | authors_b
        jaccard = len(shared) / len(union) if union else 0.0
        score = 1.0 - jaccard  # no overlap = high gap

        detail = {
            "shared_author_count": len(shared),
            "unique_authors_a": len(authors_a - shared),
            "unique_authors_b": len(authors_b - shared),
        }
        return round(score, 4), detail

    @staticmethod
    def _compute_venue_diversity_score(
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Compute venue diversity score based on Jaccard overlap of venue sets.

        score = 1 - jaccard_overlap (different venues = high gap)
        Returns (score, detail_dict).
        """
        venues_a: Set[str] = set()
        venues_b: Set[str] = set()

        for p in papers_a:
            v = p.get("venue")
            if v and str(v).strip():
                venues_a.add(str(v).strip().lower())

        for p in papers_b:
            v = p.get("venue")
            if v and str(v).strip():
                venues_b.add(str(v).strip().lower())

        if not venues_a and not venues_b:
            return 0.5, {"venues_a": [], "venues_b": [], "shared_venues": []}

        shared = venues_a & venues_b
        union = venues_a | venues_b
        jaccard = len(shared) / len(union) if union else 0.0
        score = 1.0 - jaccard  # different venues = high gap

        detail = {
            "venues_a": sorted(list(venues_a))[:10],  # cap for response size
            "venues_b": sorted(list(venues_b))[:10],
            "shared_venues": sorted(list(shared))[:10],
        }
        return round(score, 4), detail

    @staticmethod
    def _compute_terminology_barrier(
        abstracts_a: List[str],
        abstracts_b: List[str],
        centroid_similarity: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Detect terminology barriers between two clusters using TF-IDF.

        If centroid_sim > 0.3 but term_overlap < 0.1 → terminology_barrier = True.
        Returns detail dict with shared_terms, unique_terms, and barrier flag.
        """
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
        except ImportError:
            return {"shared_terms": [], "unique_terms_a": [], "unique_terms_b": [], "terminology_barrier": False}

        # Combine abstracts per cluster into single documents
        text_a = " ".join(a for a in abstracts_a if a)
        text_b = " ".join(b for b in abstracts_b if b)

        if not text_a.strip() or not text_b.strip():
            return {"shared_terms": [], "unique_terms_a": [], "unique_terms_b": [], "terminology_barrier": False}

        try:
            vectorizer = TfidfVectorizer(
                max_features=200,
                stop_words="english",
                min_df=1,
                ngram_range=(1, 2),
            )
            tfidf_matrix = vectorizer.fit_transform([text_a, text_b])
            feature_names = vectorizer.get_feature_names_out()

            # Get top-20 terms per cluster by TF-IDF score
            scores_a = tfidf_matrix[0].toarray().flatten()
            scores_b = tfidf_matrix[1].toarray().flatten()

            top_indices_a = scores_a.argsort()[-20:][::-1]
            top_indices_b = scores_b.argsort()[-20:][::-1]

            terms_a = set(feature_names[i] for i in top_indices_a if scores_a[i] > 0)
            terms_b = set(feature_names[i] for i in top_indices_b if scores_b[i] > 0)

            shared_terms = terms_a & terms_b
            unique_a = terms_a - shared_terms
            unique_b = terms_b - shared_terms

            # Compute term overlap ratio
            union = terms_a | terms_b
            term_overlap = len(shared_terms) / len(union) if union else 0.0

            # Terminology barrier: semantically similar but different vocabulary
            terminology_barrier = centroid_similarity > 0.3 and term_overlap < 0.1

            return {
                "shared_terms": sorted(list(shared_terms))[:15],
                "unique_terms_a": sorted(list(unique_a))[:15],
                "unique_terms_b": sorted(list(unique_b))[:15],
                "terminology_barrier": terminology_barrier,
                "term_overlap": round(term_overlap, 4),
            }
        except Exception as e:
            logger.warning(f"Terminology barrier computation failed: {e}")
            return {"shared_terms": [], "unique_terms_a": [], "unique_terms_b": [], "terminology_barrier": False}

    def _compute_actionability(
        self,
        bridge_papers: List[Dict[str, Any]],
        key_papers_a: List[Dict],
        key_papers_b: List[Dict],
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
        temporal_ctx: Dict,
        background_ratio: float,
        methodology_ratio: float,
        terminology_detail: Dict[str, Any],
    ) -> GapActionability:
        """
        Compute gap actionability score with 5 sub-dimensions.

        Returns GapActionability with score, breakdown, and recommendation.
        """
        # 1. Bridge feasibility (0.25): max bridge paper score — higher = easier to bridge
        if bridge_papers:
            bridge_feasibility = max(bp.get("score", 0.0) for bp in bridge_papers)
        else:
            bridge_feasibility = 0.0

        # 2. Open access ratio (0.15): proportion of key papers that are open access
        all_key_papers = papers_a + papers_b
        oa_count = sum(1 for p in all_key_papers if p.get("is_open_access", False))
        oa_ratio = oa_count / len(all_key_papers) if all_key_papers else 0.0

        # 3. Recency (0.20): 1 - (avg_years_since_latest / 10), clamped to [0, 1]
        import datetime
        current_year = datetime.datetime.now().year
        years_a = [p.get("year") for p in papers_a if p.get("year")]
        years_b = [p.get("year") for p in papers_b if p.get("year")]
        if years_a and years_b:
            latest_a = max(years_a)
            latest_b = max(years_b)
            avg_years_since = ((current_year - latest_a) + (current_year - latest_b)) / 2.0
            recency = max(0.0, min(1.0, 1.0 - (avg_years_since / 10.0)))
        else:
            recency = 0.5  # neutral

        # 4. Method transferability (0.20): background_ratio * 0.8 + (1 - methodology_ratio) * 0.2
        #    High background ratio + low methodology sharing = high transferability opportunity
        method_transferability = background_ratio * 0.8 + (1.0 - methodology_ratio) * 0.2

        # 5. Terminology similarity (0.20): term_overlap from TF-IDF
        #    Higher overlap = easier to communicate across clusters
        term_overlap = terminology_detail.get("term_overlap", 0.5)
        terminology_sim = term_overlap  # Direct: higher overlap = more actionable

        # Composite actionability
        score = (
            0.25 * bridge_feasibility
            + 0.15 * oa_ratio
            + 0.20 * recency
            + 0.20 * method_transferability
            + 0.20 * terminology_sim
        )

        breakdown = {
            "bridge_feasibility": round(bridge_feasibility, 4),
            "open_access_ratio": round(oa_ratio, 4),
            "recency": round(recency, 4),
            "method_transferability": round(method_transferability, 4),
            "terminology_similarity": round(terminology_sim, 4),
        }

        # Determine recommendation
        terminology_barrier = terminology_detail.get("terminology_barrier", False)
        if terminology_barrier:
            recommendation = "terminology_barrier"
        elif oa_ratio < 0.2 and bridge_feasibility < 0.3:
            recommendation = "infrastructure_gap"
        elif bridge_feasibility < 0.4 and method_transferability < 0.3:
            recommendation = "needs_collaboration"
        else:
            recommendation = "high_opportunity"

        return GapActionability(
            score=round(score, 4),
            breakdown=breakdown,
            recommendation=recommendation,
        )

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
