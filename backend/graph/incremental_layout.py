"""
Incremental graph layout for stable paper expansion.

Places new papers into an existing 3D graph without re-running UMAP.
Uses nearest-neighbor position interpolation from existing nodes.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


def place_new_paper(
    new_embedding: np.ndarray,
    existing_nodes: List[Dict[str, Any]],
    k: int = 3,
    jitter_scale: float = 2.0,
) -> Tuple[float, float, float]:
    """
    Compute 3D position for a new paper without re-running UMAP.

    Uses weighted average of top-k most similar existing nodes' positions,
    then adds small jitter to avoid exact overlap.

    Args:
        new_embedding: 768-dim SPECTER2 embedding
        existing_nodes: List of dicts with keys: embedding, x, y, z
        k: Number of nearest neighbors to use
        jitter_scale: Standard deviation for position jitter

    Returns:
        (x, y, z) tuple for the new paper
    """
    if not existing_nodes:
        return 0.0, 0.0, 0.0

    # Filter nodes with embeddings and coordinates
    valid_nodes = [
        n for n in existing_nodes
        if n.get("embedding") is not None
        and n.get("x") is not None
    ]

    if not valid_nodes:
        return 0.0, 0.0, 0.0

    existing_embeddings = np.array([n["embedding"] for n in valid_nodes])

    # Compute cosine similarities
    new_norm = np.linalg.norm(new_embedding)
    if new_norm == 0:
        return 0.0, 0.0, 0.0
    new_normalized = new_embedding / new_norm

    existing_norms = np.linalg.norm(existing_embeddings, axis=1, keepdims=True)
    existing_norms = np.where(existing_norms == 0, 1, existing_norms)
    existing_normalized = existing_embeddings / existing_norms

    similarities = existing_normalized @ new_normalized

    # Get top-k indices
    actual_k = min(k, len(valid_nodes))
    top_k_idx = np.argsort(similarities)[-actual_k:][::-1]
    top_k_weights = similarities[top_k_idx]

    # Avoid negative weights
    top_k_weights = np.maximum(top_k_weights, 0)
    weight_sum = top_k_weights.sum()

    if weight_sum == 0:
        # Fallback: uniform weights
        top_k_weights = np.ones(actual_k)
        weight_sum = actual_k

    top_k_weights = top_k_weights / weight_sum

    # Compute weighted position
    x = float(sum(
        valid_nodes[i]["x"] * w
        for i, w in zip(top_k_idx, top_k_weights)
    ))
    y = float(sum(
        valid_nodes[i]["y"] * w
        for i, w in zip(top_k_idx, top_k_weights)
    ))
    z = float(sum(
        valid_nodes[i]["z"] * w
        for i, w in zip(top_k_idx, top_k_weights)
    ))

    # Add jitter to avoid overlap
    rng = np.random.default_rng()
    x += float(rng.normal(0, jitter_scale))
    y += float(rng.normal(0, jitter_scale))
    z += float(rng.normal(0, jitter_scale))

    return x, y, z


def assign_cluster(
    new_embedding: np.ndarray,
    cluster_centroids: Dict[int, np.ndarray],
    threshold: float = 0.5,
) -> int:
    """
    Assign a new paper to the most similar existing cluster without HDBSCAN.

    Args:
        new_embedding: 768-dim SPECTER2 embedding
        cluster_centroids: Mapping from cluster_id to centroid embedding
        threshold: Minimum cosine similarity to assign (default 0.5)

    Returns:
        cluster_id (or -1 if no cluster meets the threshold)
    """
    if not cluster_centroids:
        return -1

    new_norm = np.linalg.norm(new_embedding)
    if new_norm == 0:
        return -1
    new_normalized = new_embedding / new_norm

    best_cluster = -1
    best_sim = -1.0

    for cid, centroid in cluster_centroids.items():
        centroid_norm = np.linalg.norm(centroid)
        if centroid_norm == 0:
            continue
        sim = float(np.dot(new_normalized, centroid / centroid_norm))
        if sim > best_sim:
            best_sim = sim
            best_cluster = cid

    return best_cluster if best_sim >= threshold else -1


def compute_cluster_centroids(
    nodes: List[Dict[str, Any]],
) -> Dict[int, np.ndarray]:
    """
    Compute mean embedding centroid for each cluster.

    Args:
        nodes: List of node dicts with keys: cluster_id, embedding

    Returns:
        Mapping from cluster_id to centroid ndarray
    """
    cluster_embeddings: Dict[int, List[np.ndarray]] = {}

    for node in nodes:
        cid = node.get("cluster_id", -1)
        if cid == -1:
            continue
        emb = node.get("embedding")
        if emb is None:
            continue
        if cid not in cluster_embeddings:
            cluster_embeddings[cid] = []
        cluster_embeddings[cid].append(np.array(emb))

    return {
        cid: np.mean(embeds, axis=0)
        for cid, embeds in cluster_embeddings.items()
        if embeds
    }
