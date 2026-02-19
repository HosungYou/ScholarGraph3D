'use client';

import { useGraphStore } from '@/hooks/useGraphStore';
import { motion } from 'framer-motion';
import { Layers, ChevronRight } from 'lucide-react';

export default function ClusterPanel() {
  const { graphData, selectedCluster, selectCluster } = useGraphStore();

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
          return (
            <motion.button
              key={cluster.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => selectCluster(isSelected ? null : cluster)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                isSelected
                  ? 'bg-surface-hover border border-border/60'
                  : 'hover:bg-surface-hover/50 border border-transparent'
              }`}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cluster.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">
                  {cluster.label}
                </div>
                <div className="text-xs text-text-secondary">
                  {cluster.paper_count} papers
                </div>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-text-secondary/40 transition-transform ${
                  isSelected ? 'rotate-90' : ''
                }`}
              />
            </motion.button>
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
