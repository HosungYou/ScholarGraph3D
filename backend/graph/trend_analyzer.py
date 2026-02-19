"""
Trend analysis for research clusters.

Classifies clusters/topics as emerging, stable, or declining
based on temporal paper distribution within each cluster.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class ClusterTrend:
    """Trend classification for a single cluster."""

    cluster_id: int
    cluster_label: str
    classification: str  # "emerging" | "stable" | "declining"
    paper_count: int
    year_range: Tuple[int, int]
    year_distribution: Dict[int, int]
    trend_strength: float  # 0-1, ratio of recent papers to total
    velocity: float  # positive = growing, negative = shrinking
    representative_papers: List[str] = field(default_factory=list)  # top 3 paper IDs by citation


@dataclass
class TrendAnalysisResult:
    """Complete trend analysis across all clusters."""

    emerging: List[ClusterTrend] = field(default_factory=list)
    stable: List[ClusterTrend] = field(default_factory=list)
    declining: List[ClusterTrend] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)


class TrendAnalyzer:
    """
    Classifies research clusters as emerging, stable, or declining
    based on temporal paper distribution.

    Classification rules:
    - emerging: first_seen >= max_year - 2 AND paper_count >= 2
    - stable: paper_count >= 3 AND year_span >= 3
    - declining: last_seen <= max_year - 3
    """

    def analyze_trends(
        self,
        papers: List[Dict[str, Any]],
        clusters: List[Dict[str, Any]],
    ) -> TrendAnalysisResult:
        """
        Analyze temporal trends for each cluster.

        Args:
            papers: List of paper dicts with keys: id, year, citation_count, cluster_id
            clusters: List of cluster dicts with keys: id, label

        Returns:
            TrendAnalysisResult with emerging/stable/declining classifications
        """
        if not papers or not clusters:
            return TrendAnalysisResult(
                summary={"total_papers": 0, "year_range": None, "cluster_count": 0}
            )

        # Build cluster -> papers mapping
        cluster_papers: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for paper in papers:
            cid = paper.get("cluster_id", -1)
            if cid != -1:
                cluster_papers[cid].append(paper)

        # Determine global year range
        years = [p["year"] for p in papers if p.get("year")]
        if not years:
            logger.warning("No papers with year data for trend analysis")
            return TrendAnalysisResult(
                summary={"total_papers": len(papers), "year_range": None, "cluster_count": len(clusters)}
            )

        global_min_year = min(years)
        global_max_year = max(years)

        # Build cluster label lookup
        cluster_labels: Dict[int, str] = {}
        for c in clusters:
            cluster_labels[c["id"]] = c.get("label", f"Cluster {c['id']}")

        # Analyze each cluster
        result = TrendAnalysisResult()

        for cluster in clusters:
            cid = cluster["id"]
            if cid == -1:
                continue  # Skip noise cluster

            c_papers = cluster_papers.get(cid, [])
            if not c_papers:
                continue

            trend = self._analyze_cluster(
                cluster_id=cid,
                cluster_label=cluster_labels.get(cid, f"Cluster {cid}"),
                papers=c_papers,
                global_max_year=global_max_year,
            )

            if trend.classification == "emerging":
                result.emerging.append(trend)
            elif trend.classification == "stable":
                result.stable.append(trend)
            else:
                result.declining.append(trend)

        # Sort each category by trend_strength descending
        result.emerging.sort(key=lambda t: t.trend_strength, reverse=True)
        result.stable.sort(key=lambda t: t.paper_count, reverse=True)
        result.declining.sort(key=lambda t: t.velocity)  # most negative first

        result.summary = {
            "total_papers": len(papers),
            "year_range": (global_min_year, global_max_year),
            "cluster_count": len([c for c in clusters if c["id"] != -1]),
            "emerging_count": len(result.emerging),
            "stable_count": len(result.stable),
            "declining_count": len(result.declining),
        }

        logger.info(
            f"Trend analysis: {len(result.emerging)} emerging, "
            f"{len(result.stable)} stable, {len(result.declining)} declining"
        )

        return result

    def _analyze_cluster(
        self,
        cluster_id: int,
        cluster_label: str,
        papers: List[Dict[str, Any]],
        global_max_year: int,
    ) -> ClusterTrend:
        """Analyze trend for a single cluster."""

        # Collect year distribution
        year_counts: Dict[int, int] = defaultdict(int)
        for paper in papers:
            year = paper.get("year")
            if year:
                year_counts[year] += 1

        if not year_counts:
            return ClusterTrend(
                cluster_id=cluster_id,
                cluster_label=cluster_label,
                classification="stable",
                paper_count=len(papers),
                year_range=(0, 0),
                year_distribution={},
                trend_strength=0.0,
                velocity=0.0,
                representative_papers=self._get_representative_papers(papers),
            )

        sorted_years = sorted(year_counts.keys())
        first_seen = sorted_years[0]
        last_seen = sorted_years[-1]
        year_span = last_seen - first_seen + 1

        # Calculate trend_strength: ratio of recent papers (last 2 years) to total
        total_count = sum(year_counts.values())
        recent_count = sum(
            count for year, count in year_counts.items()
            if year >= global_max_year - 1
        )
        trend_strength = recent_count / total_count if total_count > 0 else 0.0

        # Calculate velocity: (recent_count - old_count) / year_span
        old_count = sum(
            count for year, count in year_counts.items()
            if year <= first_seen + 1
        )
        velocity = (recent_count - old_count) / max(year_span, 1)

        # Classify
        classification = self._classify(
            first_seen=first_seen,
            last_seen=last_seen,
            paper_count=total_count,
            year_span=year_span,
            global_max_year=global_max_year,
        )

        return ClusterTrend(
            cluster_id=cluster_id,
            cluster_label=cluster_label,
            classification=classification,
            paper_count=total_count,
            year_range=(first_seen, last_seen),
            year_distribution=dict(year_counts),
            trend_strength=round(trend_strength, 4),
            velocity=round(velocity, 4),
            representative_papers=self._get_representative_papers(papers),
        )

    def _classify(
        self,
        first_seen: int,
        last_seen: int,
        paper_count: int,
        year_span: int,
        global_max_year: int,
    ) -> str:
        """
        Classify cluster trend.

        Rules (evaluated in order):
        1. emerging: first_seen >= max_year - 2 AND paper_count >= 2
        2. declining: last_seen <= max_year - 3
        3. stable: paper_count >= 3 AND year_span >= 3
        4. Default: stable
        """
        # Emerging: recently appeared topic with some activity
        if first_seen >= global_max_year - 2 and paper_count >= 2:
            return "emerging"

        # Declining: no recent papers at all
        if last_seen <= global_max_year - 3:
            return "declining"

        # Stable: sustained presence across multiple years
        if paper_count >= 3 and year_span >= 3:
            return "stable"

        # Default to stable for small/ambiguous clusters
        return "stable"

    def _get_representative_papers(
        self,
        papers: List[Dict[str, Any]],
        top_n: int = 3,
    ) -> List[str]:
        """Get top N paper IDs by citation count."""
        sorted_papers = sorted(
            papers,
            key=lambda p: p.get("citation_count", 0),
            reverse=True,
        )
        return [str(p.get("id", "")) for p in sorted_papers[:top_n]]
