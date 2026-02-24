"""
Network metrics computation for citation network analysis.

Converts ScholarGraph3D graph data to networkx DiGraph and computes
standard Social Network Analysis metrics at network, node, and
community levels.

References:
    Burt (1992) - Structural Holes
    Freeman (1977, 1978) - Centrality measures
    Brin & Page (1998) - PageRank
    Bonacich (1987) - Eigenvector centrality
    Newman & Girvan (2004) - Modularity
    Rousseeuw (1987) - Silhouette score
"""

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
import numpy as np

logger = logging.getLogger(__name__)


class NetworkMetricsComputer:
    """
    Computes SNA metrics from ScholarGraph3D graph data.

    Converts paper/edge/cluster data to a networkx DiGraph and computes
    network-level, node-level, and community-level metrics. Zero
    additional S2 API calls — all data comes from the existing graph.
    """

    def compute_all(
        self,
        papers: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        clusters: List[Dict[str, Any]],
    ) -> dict:
        """
        Compute full SNA metrics for the citation network.

        Args:
            papers: List of paper dicts with keys: id, title, cluster_id, year, citation_count
            edges: List of edge dicts with keys: source, target, type, weight
            clusters: List of cluster dicts with keys: id, label, paper_count

        Returns:
            Dict with network_level, node_centrality, community_metrics,
            structural_holes, modularity, silhouette.
        """
        G = self._build_graph(papers, edges)

        if G.number_of_nodes() == 0:
            return self._empty_result()

        # Build lookup maps
        cluster_map = {c["id"]: c.get("label", f"Cluster {c['id']}") for c in clusters}
        node_cluster = nx.get_node_attributes(G, "cluster_id")
        partition = self._build_partition(node_cluster, clusters)

        # Network-level metrics
        network_level = self._compute_network_level(G)

        # Node centrality
        node_centrality = self._compute_node_centrality(G, cluster_map)

        # Community metrics
        community_metrics = self._compute_community_metrics(G, clusters, cluster_map)

        # Structural holes
        structural_holes = self._compute_structural_holes(G, cluster_map)

        # Modularity (Newman-Girvan Q)
        modularity = self._compute_modularity(G, partition)

        # Silhouette score
        silhouette = self._compute_silhouette(G, node_cluster)

        return {
            "network_level": network_level,
            "node_centrality": node_centrality,
            "community_metrics": community_metrics,
            "structural_holes": structural_holes,
            "modularity": modularity,
            "silhouette": silhouette,
        }

    def compute_network_overview(
        self,
        papers: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        clusters: List[Dict[str, Any]],
    ) -> dict:
        """
        Lightweight network overview for display before full report.

        Returns:
            Dict with node_count, edge_count, density, cluster_count, modularity.
        """
        G = self._build_graph(papers, edges)

        if G.number_of_nodes() == 0:
            return {
                "node_count": 0,
                "edge_count": 0,
                "density": 0.0,
                "cluster_count": 0,
                "modularity": 0.0,
            }

        node_cluster = nx.get_node_attributes(G, "cluster_id")
        partition = self._build_partition(node_cluster, clusters)

        return {
            "node_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges(),
            "density": round(nx.density(G), 6),
            "cluster_count": len([c for c in clusters if c.get("id", -1) != -1]),
            "modularity": round(self._compute_modularity(G, partition), 4),
        }

    # ─── Graph construction ────────────────────────────────────────────

    def _build_graph(
        self,
        papers: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> nx.DiGraph:
        """Build networkx DiGraph from papers and edges."""
        G = nx.DiGraph()

        for paper in papers:
            pid = str(paper.get("id", ""))
            if not pid:
                continue
            G.add_node(
                pid,
                title=paper.get("title", ""),
                cluster_id=paper.get("cluster_id", -1),
                cluster_label=paper.get("cluster_label", ""),
                year=paper.get("year", 0),
                citation_count=paper.get("citation_count", 0),
            )

        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            if not src or not tgt:
                continue
            # Ensure nodes exist
            if src not in G or tgt not in G:
                continue

            edge_type = edge.get("type", "citation")
            weight = edge.get("weight", 1.0)

            if edge_type == "citation":
                # Citation edges are directed
                G.add_edge(src, tgt, type=edge_type, weight=weight)
            else:
                # Similarity edges are undirected — add both directions
                G.add_edge(src, tgt, type=edge_type, weight=weight)
                G.add_edge(tgt, src, type=edge_type, weight=weight)

        return G

    # ─── Network-level metrics ─────────────────────────────────────────

    def _compute_network_level(self, G: nx.DiGraph) -> dict:
        """Compute network-level statistics."""
        n_nodes = G.number_of_nodes()
        n_edges = G.number_of_edges()
        density = nx.density(G)
        reciprocity = nx.reciprocity(G) if n_edges > 0 else 0.0
        transitivity = nx.transitivity(G)

        # Weakly connected components
        components = list(nx.weakly_connected_components(G))
        component_count = len(components)

        # Diameter and avg path length on largest weakly connected component
        diameter = 0
        avg_path_length = 0.0
        if components:
            largest_cc_nodes = max(components, key=len)
            if len(largest_cc_nodes) > 1:
                # Use undirected version for diameter/avg_path_length
                subgraph = G.subgraph(largest_cc_nodes).to_undirected()
                try:
                    diameter = nx.diameter(subgraph)
                    avg_path_length = nx.average_shortest_path_length(subgraph)
                except nx.NetworkXError as e:
                    logger.warning(f"Could not compute diameter/avg_path_length: {e}")
                    diameter = 0
                    avg_path_length = 0.0

        if component_count > 1:
            logger.warning(
                f"Graph is disconnected ({component_count} components). "
                "Diameter/avg_path_length computed on largest component."
            )

        # Average degree
        avg_degree = (2 * n_edges) / n_nodes if n_nodes > 0 else 0.0

        return {
            "density": round(density, 6),
            "diameter": diameter,
            "avg_path_length": round(avg_path_length, 4),
            "reciprocity": round(reciprocity, 4),
            "transitivity": round(transitivity, 4),
            "component_count": component_count,
            "avg_degree": round(avg_degree, 4),
            "node_count": n_nodes,
            "edge_count": n_edges,
        }

    # ─── Node centrality ───────────────────────────────────────────────

    def _compute_node_centrality(
        self,
        G: nx.DiGraph,
        cluster_map: Dict[int, str],
    ) -> List[dict]:
        """Compute centrality measures for all nodes."""
        n_nodes = G.number_of_nodes()
        if n_nodes == 0:
            return []

        # In-degree and out-degree
        in_degree = dict(G.in_degree())
        out_degree = dict(G.out_degree())

        # Betweenness centrality
        betweenness = nx.betweenness_centrality(G, weight="weight")

        # Closeness centrality
        closeness = nx.closeness_centrality(G, wf_improved=True)

        # PageRank
        try:
            pagerank = nx.pagerank(G, alpha=0.85, max_iter=1000, tol=1e-06)
        except nx.PowerIterationFailedConvergence:
            logger.warning("PageRank failed to converge — using uniform values")
            pagerank = {n: 1.0 / n_nodes for n in G.nodes()}

        # Eigenvector centrality on undirected graph
        G_undirected = G.to_undirected()
        try:
            eigenvector = nx.eigenvector_centrality(
                G_undirected, max_iter=1000, tol=1e-06
            )
        except nx.PowerIterationFailedConvergence:
            logger.warning("Eigenvector centrality failed to converge — returning 0.0 for all nodes")
            eigenvector = {n: 0.0 for n in G.nodes()}

        # Build result list
        result = []
        for node in G.nodes():
            node_data = G.nodes[node]
            cluster_id = node_data.get("cluster_id", -1)
            result.append({
                "paper_id": node,
                "title": node_data.get("title", ""),
                "cluster_id": cluster_id,
                "cluster_label": cluster_map.get(cluster_id, f"Cluster {cluster_id}"),
                "degree_in": in_degree.get(node, 0),
                "degree_out": out_degree.get(node, 0),
                "betweenness": round(betweenness.get(node, 0.0), 6),
                "closeness": round(closeness.get(node, 0.0), 6),
                "pagerank": round(pagerank.get(node, 0.0), 6),
                "eigenvector": round(eigenvector.get(node, 0.0), 6),
            })

        # Sort by betweenness descending
        result.sort(key=lambda x: x["betweenness"], reverse=True)
        return result

    # ─── Community metrics ─────────────────────────────────────────────

    def _compute_community_metrics(
        self,
        G: nx.DiGraph,
        clusters: List[Dict[str, Any]],
        cluster_map: Dict[int, str],
    ) -> List[dict]:
        """Compute per-community metrics."""
        # Build cluster -> nodes mapping
        cluster_nodes: Dict[int, List[str]] = defaultdict(list)
        for node in G.nodes():
            cid = G.nodes[node].get("cluster_id", -1)
            if cid != -1:
                cluster_nodes[cid].append(node)

        result = []
        for cluster in clusters:
            cid = cluster.get("id", -1)
            if cid == -1:
                continue

            nodes = cluster_nodes.get(cid, [])
            paper_count = len(nodes)
            if paper_count == 0:
                continue

            # Intra-cluster density
            subgraph = G.subgraph(nodes)
            intra_density = nx.density(subgraph) if paper_count > 1 else 0.0

            # Year statistics
            years = [
                G.nodes[n].get("year", 0)
                for n in nodes
                if G.nodes[n].get("year", 0) > 0
            ]
            if years:
                avg_year = round(sum(years) / len(years), 1)
                year_range = f"{min(years)}-{max(years)}"
            else:
                avg_year = 0.0
                year_range = "N/A"

            # h-index from citation counts
            citation_counts = [
                G.nodes[n].get("citation_count", 0) for n in nodes
            ]
            h_index = self._compute_h_index(citation_counts)

            result.append({
                "cluster_id": cid,
                "label": cluster_map.get(cid, cluster.get("label", f"Cluster {cid}")),
                "paper_count": paper_count,
                "intra_density": round(intra_density, 6),
                "avg_year": avg_year,
                "year_range": year_range,
                "h_index": h_index,
            })

        return result

    # ─── Structural holes ──────────────────────────────────────────────

    def _compute_structural_holes(
        self,
        G: nx.DiGraph,
        cluster_map: Dict[int, str],
    ) -> List[dict]:
        """Compute Burt's structural holes measures."""
        n_nodes = G.number_of_nodes()
        if n_nodes == 0:
            return []

        # Constraint
        try:
            constraint = nx.constraint(G)
        except Exception as e:
            logger.warning(f"Constraint computation failed: {e}")
            constraint = {n: 1.0 for n in G.nodes()}

        # Effective size
        try:
            effective_size = nx.effective_size(G)
        except Exception as e:
            logger.warning(f"Effective size computation failed: {e}")
            effective_size = {n: 0.0 for n in G.nodes()}

        result = []
        for node in G.nodes():
            node_data = G.nodes[node]
            degree = G.degree(node)
            c = constraint.get(node, 1.0)
            es = effective_size.get(node, 0.0)

            # Handle isolates: constraint=1.0, effective_size=0, efficiency=0
            if degree == 0:
                c = 1.0
                es = 0.0
                efficiency = 0.0
            else:
                efficiency = es / degree if degree > 0 else 0.0

            cluster_id = node_data.get("cluster_id", -1)
            result.append({
                "paper_id": node,
                "title": node_data.get("title", ""),
                "cluster_id": cluster_id,
                "constraint": round(c, 6),
                "effective_size": round(es, 4),
                "efficiency": round(efficiency, 4),
            })

        # Sort by constraint ascending (lower = better broker)
        result.sort(key=lambda x: x["constraint"])
        return result

    # ─── Modularity ────────────────────────────────────────────────────

    def _compute_modularity(
        self,
        G: nx.DiGraph,
        partition: List[set],
    ) -> float:
        """Compute Newman-Girvan modularity Q."""
        if not partition or G.number_of_nodes() == 0:
            return 0.0

        # Filter out empty communities
        non_empty = [s for s in partition if len(s) > 0]
        if not non_empty:
            return 0.0

        try:
            # Use undirected version for modularity
            G_undirected = G.to_undirected()
            return nx.algorithms.community.modularity(G_undirected, non_empty)
        except (nx.NetworkXError, ZeroDivisionError) as e:
            logger.warning(f"Modularity computation failed: {e}")
            return 0.0

    # ─── Silhouette score ──────────────────────────────────────────────

    def _compute_silhouette(
        self,
        G: nx.DiGraph,
        node_cluster: Dict[str, int],
    ) -> float:
        """
        Compute mean silhouette score over communities using shortest path distances.

        Returns -1.0 if too many disconnected nodes or insufficient communities.
        """
        # Filter to nodes with valid cluster assignment
        valid_nodes = [n for n, c in node_cluster.items() if c != -1 and n in G]
        if len(valid_nodes) < 2:
            return -1.0

        # Check we have at least 2 clusters
        unique_clusters = set(node_cluster[n] for n in valid_nodes)
        if len(unique_clusters) < 2:
            return -1.0

        # Use undirected graph for distance computation
        G_undirected = G.to_undirected()

        # Compute pairwise shortest path distances
        try:
            node_list = list(valid_nodes)
            node_idx = {n: i for i, n in enumerate(node_list)}
            n = len(node_list)

            # Build distance matrix
            dist_matrix = np.full((n, n), np.inf)
            np.fill_diagonal(dist_matrix, 0.0)

            # Compute shortest paths from valid nodes only
            subgraph = G_undirected.subgraph(node_list)
            path_lengths = dict(nx.all_pairs_shortest_path_length(subgraph))

            connected_count = 0
            total_pairs = 0
            for src in node_list:
                if src in path_lengths:
                    for tgt, dist in path_lengths[src].items():
                        if tgt in node_idx:
                            i = node_idx[src]
                            j = node_idx[tgt]
                            dist_matrix[i][j] = dist
                            if i != j:
                                total_pairs += 1
                                if dist < np.inf:
                                    connected_count += 1

            # If too many disconnected pairs, return -1
            if total_pairs > 0 and connected_count / total_pairs < 0.5:
                logger.warning(
                    f"Too many disconnected node pairs ({connected_count}/{total_pairs}) "
                    "for meaningful silhouette score"
                )
                return -1.0

            # Replace inf with large value for disconnected pairs
            max_finite = np.max(dist_matrix[np.isfinite(dist_matrix)])
            dist_matrix[np.isinf(dist_matrix)] = max_finite * 2 if max_finite > 0 else 1.0

            # Compute silhouette scores
            labels = np.array([node_cluster[n] for n in node_list])
            silhouette_scores = []

            for i in range(n):
                cluster_i = labels[i]

                # a(i) = mean distance to same cluster
                same_mask = labels == cluster_i
                same_mask[i] = False
                same_count = np.sum(same_mask)
                if same_count == 0:
                    continue  # Skip singleton clusters
                a_i = np.mean(dist_matrix[i][same_mask])

                # b(i) = min mean distance to other clusters
                b_i = np.inf
                for cluster_j in unique_clusters:
                    if cluster_j == cluster_i:
                        continue
                    other_mask = labels == cluster_j
                    other_count = np.sum(other_mask)
                    if other_count == 0:
                        continue
                    mean_dist = np.mean(dist_matrix[i][other_mask])
                    b_i = min(b_i, mean_dist)

                if b_i == np.inf:
                    continue

                # Silhouette coefficient
                s_i = (b_i - a_i) / max(a_i, b_i) if max(a_i, b_i) > 0 else 0.0
                silhouette_scores.append(s_i)

            if not silhouette_scores:
                return -1.0

            return round(float(np.mean(silhouette_scores)), 4)

        except Exception as e:
            logger.warning(f"Silhouette computation failed: {e}")
            return -1.0

    # ─── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _compute_h_index(citation_counts: List[int]) -> int:
        """
        Compute h-index from a list of citation counts.

        Sort descending, find largest h where h papers have >= h citations.
        """
        if not citation_counts:
            return 0
        sorted_counts = sorted(citation_counts, reverse=True)
        h = 0
        for i, count in enumerate(sorted_counts):
            if count >= i + 1:
                h = i + 1
            else:
                break
        return h

    @staticmethod
    def _build_partition(
        node_cluster: Dict[str, int],
        clusters: List[Dict[str, Any]],
    ) -> List[set]:
        """Build list of node sets per community for modularity."""
        cluster_nodes: Dict[int, set] = defaultdict(set)
        for node, cid in node_cluster.items():
            if cid != -1:
                cluster_nodes[cid].add(node)

        return [nodes for nodes in cluster_nodes.values() if len(nodes) > 0]

    def _empty_result(self) -> dict:
        """Return empty metrics for an empty graph."""
        return {
            "network_level": {
                "density": 0.0,
                "diameter": 0,
                "avg_path_length": 0.0,
                "reciprocity": 0.0,
                "transitivity": 0.0,
                "component_count": 0,
                "avg_degree": 0.0,
                "node_count": 0,
                "edge_count": 0,
            },
            "node_centrality": [],
            "community_metrics": [],
            "structural_holes": [],
            "modularity": 0.0,
            "silhouette": -1.0,
        }
