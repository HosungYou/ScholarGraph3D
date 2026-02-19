'use client';

import { useMemo } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { motion } from 'framer-motion';
import { Layers, ChevronRight, Eye, EyeOff, Focus } from 'lucide-react';

export default function ClusterPanel() {
  const {
    graphData,
    selectedCluster,
    selectCluster,
    hiddenClusterIds,
    toggleClusterVisibility,
  } = useGraphStore();

  // Compute per-cluster edge counts
  const clusterEdgeCounts = useMemo(() => {
    if (!graphData) return new Map<number, number>();
    const paperCluster = new Map<string, number>();
    graphData.nodes.forEach((n) => paperCluster.set(n.id, n.cluster_id));

    const counts = new Map<number, number>();
    graphData.edges.forEach((e) => {
      const srcCluster = paperCluster.get(e.source);
      const tgtCluster = paperCluster.get(e.target);
      if (srcCluster !== undefined && srcCluster === tgtCluster && srcCluster !== -1) {
        counts.set(srcCluster, (counts.get(srcCluster) || 0) + 1);
      }
    });
    return counts;
  }, [graphData]);

  // Max edge count for density bar scaling
  const maxEdges = useMemo(
    () => Math.max(1, ...Array.from(clusterEdgeCounts.values())),
    [clusterEdgeCounts]
  );

  if (!graphData) {
    return (
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-3">
          Clusters
        </div>
        <p className="text-sm text-text-secondary/60">
          Search to see topic clusters
        </p>
      </div>
    );
  }

  const clusters = graphData.clusters;

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-accent" />
        <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Topic Clusters
        </span>
        <span className="ml-auto text-xs text-text-secondary/60">
          {clusters.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {clusters.map((cluster, i) => {
          const isSelected = selectedCluster?.id === cluster.id;
          const isHidden = hiddenClusterIds.has(cluster.id);
          const edgeCount = clusterEdgeCounts.get(cluster.id) || 0;
          const densityRatio = edgeCount / maxEdges;

          return (
            <motion.div
              key={cluster.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`rounded-lg border transition-all ${
                isSelected
                  ? 'bg-surface-hover border-border/60'
                  : 'hover:bg-surface-hover/50 border-transparent'
              } ${isHidden ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2 p-3">
                {/* Color dot */}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cluster.color }}
                />

                {/* Main cluster info - clickable */}
                <button
                  onClick={() => selectCluster(isSelected ? null : cluster)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-medium text-text-primary truncate">
                    {cluster.label}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
                    <span>{cluster.paper_count} papers</span>
                    {edgeCount > 0 && (
                      <span className="text-text-secondary/50">· {edgeCount} edges</span>
                    )}
                  </div>

                  {/* Density bar */}
                  <div className="mt-1.5 h-1 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(densityRatio * 100)}%`,
                        backgroundColor: cluster.color,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </button>

                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Visibility toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleClusterVisibility(cluster.id);
                    }}
                    title={isHidden ? 'Show cluster' : 'Hide cluster'}
                    className="p-1 rounded text-text-secondary/40 hover:text-text-secondary transition-colors"
                  >
                    {isHidden ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Focus button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('focusCluster', { detail: { clusterId: cluster.id } })
                      );
                    }}
                    title="Focus on cluster"
                    className="p-1 rounded text-text-secondary/40 hover:text-text-secondary transition-colors"
                  >
                    <Focus className="w-3.5 h-3.5" />
                  </button>

                  <ChevronRight
                    className={`w-4 h-4 text-text-secondary/40 transition-transform ${
                      isSelected ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Cluster topics preview */}
      {selectedCluster && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 p-3 glass rounded-lg"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-2">
            Top Topics
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedCluster.topics.slice(0, 6).map((topic) => (
              <span
                key={topic}
                className="px-2 py-0.5 rounded text-xs bg-surface-hover text-text-secondary border border-border/30"
              >
                {topic}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
