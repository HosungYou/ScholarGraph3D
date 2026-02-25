"""
Hybrid clustering for paper citation networks.

Supports three strategies (controlled by CLUSTERING_MODE env var):
- "hybrid" (default): Leiden on citation + bibliographic coupling + similarity graph,
  with automatic HDBSCAN fallback for sparse graphs.
- "leiden": Force Leiden algorithm (error if graph too sparse).
- "hdbscan": Legacy HDBSCAN-only mode.

v0.8.0: Hybrid Leiden + Bibliographic Coupling + HDBSCAN fallback.
         TF-IDF abstract labeling replaces fieldsOfStudy frequency.
v0.7.0: HDBSCAN on 50-dim intermediate UMAP embeddings.
"""

import logging
import os
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Threshold: if input has more dims than this, reduce to intermediate first.
_HIGH_DIM_THRESHOLD = 50

# Environment-controlled clustering mode
CLUSTERING_MODE = os.environ.get("CLUSTERING_MODE", "hybrid")  # "leiden" | "hdbscan" | "hybrid"


class PaperClusterer:
    """Hybrid paper clustering with Leiden, bibliographic coupling, and HDBSCAN fallback."""

    # ── Hybrid clustering (primary) ──────────────────────────────────────

    def cluster_hybrid(
        self,
        paper_ids: List[str],
        citation_pairs: Set[Tuple[str, str]],
        similarity_edges: List[Dict],
        embeddings: np.ndarray,
        reference_lists: Dict[str, List[str]],
        min_cluster_size: int = 3,
        resolution: float = 1.0,
    ) -> np.ndarray:
        """
        Cluster papers using a hybrid 3-layer graph + Leiden algorithm.

        Graph layers:
        1. Citation edges (weight=1.0) — direct citation relationships
        2. Bibliographic coupling edges (weight=shared_refs/max) — shared references
        3. Similarity edges (weight=cosine_similarity) — SPECTER2 embedding similarity

        Falls back to HDBSCAN if graph is too sparse for Leiden.

        Args:
            paper_ids: Ordered list of paper IDs (indices match embeddings)
            citation_pairs: Set of (citing_id, cited_id) tuples
            similarity_edges: List of {source, target, similarity} dicts
            embeddings: (N, D) array (50D intermediate for HDBSCAN fallback)
            reference_lists: {paper_id: [cited_paper_ids...]} for bib coupling
            min_cluster_size: Minimum papers per cluster
            resolution: Leiden resolution parameter (higher = more clusters)

        Returns:
            (N,) array of cluster labels (0-indexed, -1 = unclustered)
        """
        N = len(paper_ids)
        if N < min_cluster_size:
            logger.warning(f"Too few papers ({N}) for clustering")
            return np.zeros(N, dtype=int)

        mode = CLUSTERING_MODE
        id_to_idx = {pid: i for i, pid in enumerate(paper_ids)}
        id_set = set(paper_ids)

        # Build 3-layer edge list: (src_idx, tgt_idx, weight)
        edges: List[Tuple[int, int, float]] = []

        # Layer 1: Citation edges (weight=1.0)
        citation_count = 0
        for citing, cited in citation_pairs:
            if citing in id_to_idx and cited in id_to_idx:
                edges.append((id_to_idx[citing], id_to_idx[cited], 1.0))
                citation_count += 1

        # Layer 2: Bibliographic coupling edges
        bib_coupling_edges = self._compute_bib_coupling(paper_ids, citation_pairs, id_to_idx)
        edges.extend(bib_coupling_edges)

        # Layer 3: Similarity edges
        sim_count = 0
        for se in similarity_edges:
            src = se.get("source", "")
            tgt = se.get("target", "")
            sim = se.get("similarity", 0.0)
            if src in id_to_idx and tgt in id_to_idx and sim > 0:
                edges.append((id_to_idx[src], id_to_idx[tgt], sim))
                sim_count += 1

        total_edges = len(edges)
        logger.info(
            f"Hybrid graph: {N} nodes, {total_edges} edges "
            f"(citation={citation_count}, bib_coupling={len(bib_coupling_edges)}, similarity={sim_count})"
        )

        # Fallback decision
        if mode == "hdbscan":
            logger.info("CLUSTERING_MODE=hdbscan, using HDBSCAN directly")
            return self.cluster(embeddings, min_cluster_size)

        if mode == "hybrid" and total_edges < N * 0.5:
            logger.info(
                f"Sparse graph ({total_edges} edges < {N * 0.5:.0f} threshold), "
                "falling back to HDBSCAN"
            )
            return self.cluster(embeddings, min_cluster_size)

        # Leiden clustering
        try:
            import igraph as ig
            import leidenalg

            # Build igraph graph
            g = ig.Graph(n=N, directed=False)

            # Deduplicate edges (keep max weight per pair)
            edge_weights: Dict[Tuple[int, int], float] = {}
            for src, tgt, w in edges:
                if src == tgt:
                    continue
                key = (min(src, tgt), max(src, tgt))
                edge_weights[key] = max(edge_weights.get(key, 0), w)

            edge_list = list(edge_weights.keys())
            weights = [edge_weights[e] for e in edge_list]

            if not edge_list:
                logger.warning("No edges after dedup, falling back to HDBSCAN")
                return self.cluster(embeddings, min_cluster_size)

            g.add_edges(edge_list)

            # Run Leiden
            partition = leidenalg.find_partition(
                g,
                leidenalg.RBConfigurationVertexPartition,
                weights=weights,
                resolution_parameter=resolution,
                n_iterations=-1,
                seed=42,
            )

            labels = np.array(partition.membership, dtype=int)

            # Merge small clusters into noise (-1)
            cluster_counts = Counter(labels)
            for cid, count in cluster_counts.items():
                if count < min_cluster_size:
                    labels[labels == cid] = -1

            # Re-index clusters to be contiguous from 0
            unique_clusters = sorted(set(labels) - {-1})
            remap = {old: new for new, old in enumerate(unique_clusters)}
            remap[-1] = -1
            labels = np.array([remap[l] for l in labels], dtype=int)

            n_clusters = len(unique_clusters)
            n_noise = (labels == -1).sum()
            logger.info(
                f"Leiden: {n_clusters} clusters, {n_noise} noise points "
                f"(resolution={resolution}, modularity={partition.quality():.4f})"
            )

            return labels

        except ImportError as e:
            logger.warning(f"leidenalg/igraph not available ({e}), falling back to HDBSCAN")
            return self.cluster(embeddings, min_cluster_size)
        except Exception as e:
            logger.warning(f"Leiden failed ({e}), falling back to HDBSCAN")
            return self.cluster(embeddings, min_cluster_size)

    def _compute_bib_coupling(
        self,
        paper_ids: List[str],
        citation_pairs: Set[Tuple[str, str]],
        id_to_idx: Dict[str, int],
    ) -> List[Tuple[int, int, float]]:
        """
        Compute bibliographic coupling edges from existing citation_pairs.

        Two papers A and B have a coupling strength equal to the number of
        papers they both cite. No additional API calls needed.
        """
        id_set = set(paper_ids)

        # Build cited_id → {citing_ids in our set} mapping
        cited_by: Dict[str, List[str]] = defaultdict(list)
        for citing, cited in citation_pairs:
            if citing in id_set:
                cited_by[cited].append(citing)

        # Count shared references per pair
        pair_counts: Counter = Counter()
        for cited, citers in cited_by.items():
            if len(citers) < 2:
                continue
            for i in range(len(citers)):
                for j in range(i + 1, len(citers)):
                    key = (min(citers[i], citers[j]), max(citers[i], citers[j]))
                    pair_counts[key] += 1

        if not pair_counts:
            return []

        max_count = max(pair_counts.values())
        edges = []
        for (a, b), count in pair_counts.items():
            if a in id_to_idx and b in id_to_idx:
                weight = count / max_count
                edges.append((id_to_idx[a], id_to_idx[b], weight))

        logger.info(f"Bibliographic coupling: {len(edges)} edges (max shared refs={max_count})")
        return edges

    # ── TF-IDF cluster labeling ──────────────────────────────────────────

    def label_clusters_tfidf(
        self,
        papers: List[Dict[str, Any]],
        cluster_labels: np.ndarray,
    ) -> Dict[int, Dict[str, Any]]:
        """
        Label each cluster using TF-IDF on abstracts (bigrams + unigrams).

        Produces domain-specific labels like "prompt tuning" or "attention mechanism"
        instead of generic fields like "Computer Science / Mathematics".

        Args:
            papers: List of paper dicts with 'abstract' and 'title' keys
            cluster_labels: (N,) array of cluster labels

        Returns:
            Dict mapping cluster_id to {label, topic_names, paper_count, color}
        """
        from sklearn.feature_extraction.text import TfidfVectorizer

        cluster_info: Dict[int, Dict[str, Any]] = {}
        unique_labels = sorted(set(cluster_labels))

        colors = [
            "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
            "#264653", "#A8DADC", "#6D6875", "#B5838D", "#FFB4A2",
            "#CDB4DB", "#FFC8DD", "#BDE0FE", "#A2D2FF", "#CAFFBF",
        ]

        # Build per-cluster aggregated text
        cluster_texts: Dict[int, str] = {}
        cluster_paper_counts: Dict[int, int] = {}

        for label in unique_labels:
            if label == -1:
                cluster_info[-1] = {
                    "label": "Unclustered",
                    "topic_names": [],
                    "paper_count": int((cluster_labels == label).sum()),
                    "color": "#888888",
                }
                continue

            mask = cluster_labels == label
            cluster_papers = [p for p, m in zip(papers, mask) if m]
            cluster_paper_counts[label] = len(cluster_papers)

            # Concatenate abstracts and titles for this cluster
            texts = []
            for p in cluster_papers:
                text = (p.get("abstract") or "") + " " + (p.get("title") or "")
                texts.append(text.strip())
            cluster_texts[label] = " ".join(texts)

        # Run TF-IDF across all cluster documents
        valid_labels = [l for l in unique_labels if l != -1 and l in cluster_texts]
        if not valid_labels:
            return cluster_info

        corpus = [cluster_texts[l] for l in valid_labels]

        try:
            vectorizer = TfidfVectorizer(
                ngram_range=(1, 2),
                max_features=500,
                stop_words="english",
                min_df=1,
                max_df=0.85,
            )
            tfidf_matrix = vectorizer.fit_transform(corpus)
            feature_names = vectorizer.get_feature_names_out()

            for i, label in enumerate(valid_labels):
                # Get top TF-IDF terms for this cluster
                row = tfidf_matrix[i].toarray().flatten()
                top_indices = row.argsort()[::-1]

                # Prefer bigrams, then fill with unigrams
                bigrams = []
                unigrams = []
                for idx in top_indices:
                    term = feature_names[idx]
                    if row[idx] <= 0:
                        break
                    if " " in term:
                        bigrams.append(term)
                    else:
                        unigrams.append(term)
                    if len(bigrams) >= 3 and len(unigrams) >= 3:
                        break

                # Build label: prefer bigrams
                top_terms = bigrams[:2] if bigrams else unigrams[:2]
                if len(top_terms) < 2 and unigrams:
                    top_terms.extend(unigrams[:2 - len(top_terms)])

                topic_names = (bigrams[:3] + unigrams[:3])[:6]

                cluster_label = " / ".join(
                    t.title() for t in top_terms
                ) if top_terms else f"Cluster {label}"

                cluster_info[label] = {
                    "label": cluster_label,
                    "topic_names": [t.title() for t in topic_names],
                    "paper_count": cluster_paper_counts.get(label, 0),
                    "color": colors[label % len(colors)],
                }

        except Exception as e:
            logger.warning(f"TF-IDF labeling failed ({e}), falling back to generic labels")
            for label in valid_labels:
                cluster_info[label] = {
                    "label": f"Cluster {label}",
                    "topic_names": [],
                    "paper_count": cluster_paper_counts.get(label, 0),
                    "color": colors[label % len(colors)],
                }

        return cluster_info

    # ── Legacy HDBSCAN (fallback) ────────────────────────────────────────

    def cluster(
        self,
        embeddings: np.ndarray,
        min_cluster_size: int = 8,
        min_samples: Optional[int] = None,
    ) -> np.ndarray:
        """
        Cluster papers using HDBSCAN (legacy fallback).

        v0.7.0: Input should be high-dimensional embeddings (768-dim or
        50-dim intermediate UMAP), NOT 3D UMAP coordinates.
        """
        from hdbscan import HDBSCAN

        if embeddings.shape[0] < min_cluster_size:
            logger.warning(f"Too few papers ({embeddings.shape[0]}) for clustering")
            return np.zeros(embeddings.shape[0], dtype=int)

        cluster_input = self._prepare_cluster_input(embeddings)

        metric = "euclidean"

        clusterer = HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples or min_cluster_size,
            metric=metric,
            cluster_selection_method="eom",
        )

        labels = clusterer.fit_predict(cluster_input)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = (labels == -1).sum()
        logger.info(
            f"HDBSCAN: {n_clusters} clusters, {n_noise} noise points "
            f"from {embeddings.shape[0]} papers "
            f"(input shape for clustering: {cluster_input.shape})"
        )

        return labels

    def _prepare_cluster_input(self, embeddings: np.ndarray) -> np.ndarray:
        """Prepare embeddings for HDBSCAN clustering."""
        n, dim = embeddings.shape

        if dim <= _HIGH_DIM_THRESHOLD:
            if dim <= 3:
                logger.warning(
                    f"HDBSCAN received {dim}-dim input (UMAP 3D coords). "
                    "This may produce poor clusters due to information loss. "
                    "Pass 768-dim or 50-dim intermediate embeddings instead."
                )
            return embeddings

        logger.info(
            f"Reducing {dim}-dim embeddings to 50D intermediate for HDBSCAN "
            "(avoids double-distortion bug, preserves topology)"
        )
        from graph.embedding_reducer import EmbeddingReducer
        reducer = EmbeddingReducer()
        return reducer.reduce_to_intermediate(
            embeddings,
            n_components=min(50, n - 2),
            n_neighbors=min(15, n - 1),
        )

    # ── Legacy fieldsOfStudy labeling (kept for backward compat) ─────────

    def label_clusters(
        self,
        papers: List[Dict[str, Any]],
        cluster_labels: np.ndarray,
    ) -> Dict[int, Dict[str, Any]]:
        """Label each cluster using fields of study (legacy, use label_clusters_tfidf instead)."""
        cluster_info: Dict[int, Dict[str, Any]] = {}

        unique_labels = sorted(set(cluster_labels))
        colors = [
            "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
            "#264653", "#A8DADC", "#6D6875", "#B5838D", "#FFB4A2",
            "#CDB4DB", "#FFC8DD", "#BDE0FE", "#A2D2FF", "#CAFFBF",
        ]

        for label in unique_labels:
            if label == -1:
                cluster_info[-1] = {
                    "label": "Unclustered",
                    "topic_names": [],
                    "paper_count": int((cluster_labels == label).sum()),
                    "color": "#888888",
                }
                continue

            mask = cluster_labels == label
            cluster_papers = [p for p, m in zip(papers, mask) if m]

            field_counter: Counter = Counter()
            for paper in cluster_papers:
                for fos in paper.get("fields_of_study", []):
                    if fos:
                        field_counter[fos] += 1

            top_fields = [name for name, _ in field_counter.most_common(3)]
            if not top_fields:
                top_fields = [f"Cluster {label}"]

            cluster_label = " / ".join(top_fields[:2]) if len(top_fields) >= 2 else top_fields[0]

            cluster_info[label] = {
                "label": cluster_label,
                "topic_names": top_fields,
                "paper_count": len(cluster_papers),
                "color": colors[label % len(colors)],
            }

        return cluster_info

    def compute_hulls(
        self,
        coords_3d: np.ndarray,
        cluster_labels: np.ndarray,
    ) -> Dict[int, List[List[float]]]:
        """Compute convex hull vertices for each cluster in 3D space."""
        from scipy.spatial import ConvexHull

        hulls: Dict[int, List[List[float]]] = {}

        unique_labels = set(cluster_labels)
        for label in unique_labels:
            if label == -1:
                continue

            mask = cluster_labels == label
            points = coords_3d[mask]

            if points.shape[0] < 4:
                hulls[label] = points.tolist()
                continue

            try:
                hull = ConvexHull(points)
                hull_vertices = points[hull.vertices].tolist()
                hulls[label] = hull_vertices
            except Exception as e:
                logger.warning(f"Failed to compute hull for cluster {label}: {e}")
                hulls[label] = points.tolist()

        return hulls
