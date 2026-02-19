"""
Bridge node detection for ScholarGraph3D.

Detects papers that act as hubs connecting multiple research clusters.
"""

import logging
from collections import defaultdict
from typing import Any, Dict, List, Set

import numpy as np

logger = logging.getLogger(__name__)


def detect_bridge_nodes(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    top_percentile: float = 0.05,
) -> Set[str]:
    """
    Detect bridge nodes — papers that connect multiple research clusters.

    A node is a bridge if it has cross-cluster edges to more than one
    other cluster. Scored by number of distinct clusters it connects to.

    Args:
        nodes: List of node dicts with keys: id, cluster_id
        edges: List of edge dicts with keys: source, target
        top_percentile: Top fraction to label as bridges (default 5%)

    Returns:
        Set of node IDs that are bridge nodes
    """
    if not nodes or not edges:
        return set()

    # Build cluster map
    node_cluster: Dict[str, int] = {}
    for n in nodes:
        pid = str(n.get("id", ""))
        node_cluster[pid] = n.get("cluster_id", -1)

    # Count distinct clusters each node connects to (cross-cluster only)
    bridge_scores: Dict[str, Set[int]] = defaultdict(set)

    for edge in edges:
        src = str(edge.get("source", ""))
        tgt = str(edge.get("target", ""))

        src_cluster = node_cluster.get(src, -1)
        tgt_cluster = node_cluster.get(tgt, -1)

        # Only count cross-cluster edges, skip noise cluster (-1)
        if src_cluster == tgt_cluster:
            continue
        if src_cluster == -1 or tgt_cluster == -1:
            continue

        bridge_scores[src].add(tgt_cluster)
        bridge_scores[tgt].add(src_cluster)

    if not bridge_scores:
        return set()

    # Score = number of distinct clusters node bridges to
    scores = {nid: len(clusters) for nid, clusters in bridge_scores.items()}

    # Only nodes connecting >= 2 clusters are candidates
    candidates = {nid: s for nid, s in scores.items() if s >= 2}

    if not candidates:
        return set()

    # Apply top percentile threshold
    score_values = list(candidates.values())
    threshold = np.percentile(score_values, (1 - top_percentile) * 100)
    threshold = max(2, int(threshold))  # At least 2 clusters

    bridge_ids = {nid for nid, s in candidates.items() if s >= threshold}

    logger.info(
        f"Bridge detection: {len(bridge_ids)} bridge nodes "
        f"(threshold={threshold} clusters, from {len(candidates)} candidates)"
    )

    return bridge_ids
