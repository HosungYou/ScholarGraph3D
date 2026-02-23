'use client';

import { useMemo, useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, ChevronRight, Eye, EyeOff, Focus, BarChart3, FileText } from 'lucide-react';
import type { Paper } from '@/types';

export default function ClusterPanel() {
  const {
    graphData,
    selectedCluster,
    selectCluster,
    hiddenClusterIds,
    toggleClusterVisibility,
    setHighlightedPaperIds,
    clearHighlightedPaperIds,
    selectPaper,
  } = useGraphStore();

  const [expandedPaperList, setExpandedPaperList] = useState<number | null>(null);
  const [showAllPapers, setShowAllPapers] = useState(false);

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

  const maxEdges = useMemo(
    () => Math.max(1, ...Array.from(clusterEdgeCounts.values())),
    [clusterEdgeCounts]
  );

  const clusterPapers = useMemo(() => {
    if (!graphData || !selectedCluster) return [];
    return graphData.nodes
      .filter(n => n.cluster_id === selectedCluster.id)
      .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
  }, [graphData, selectedCluster]);

  const clusterStats = useMemo(() => {
    if (!graphData || !selectedCluster) return null;
    const papers = graphData.nodes.filter(n => n.cluster_id === selectedCluster.id);
    if (papers.length === 0) return null;

    const citations = papers.map(p => p.citation_count || 0);
    const avgCitations = Math.round(citations.reduce((a, b) => a + b, 0) / citations.length);
    const years = papers.map(p => p.year).filter((y): y is number => y != null && !isNaN(y));
    const yearMin = years.length > 0 ? Math.min(...years) : null;
    const yearMax = years.length > 0 ? Math.max(...years) : null;

    const fieldCounts = new Map<string, number>();
    papers.forEach(p => {
      const field = p.fields?.[0];
      if (field) fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
    });
    const topField = Array.from(fieldCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed';

    const clusterNodeIds = new Set(papers.map(p => p.id));
    let internalEdges = 0;
    let externalEdges = 0;
    graphData.edges.forEach(e => {
      const srcIn = clusterNodeIds.has(e.source);
      const tgtIn = clusterNodeIds.has(e.target);
      if (srcIn && tgtIn) internalEdges++;
      else if (srcIn || tgtIn) externalEdges++;
    });

    return { avgCitations, yearMin, yearMax, topField, internalEdges, externalEdges };
  }, [graphData, selectedCluster]);

  const handleClusterSelect = useCallback((cluster: typeof selectedCluster) => {
    if (cluster && cluster.id === selectedCluster?.id) {
      selectCluster(null);
      clearHighlightedPaperIds();
      setExpandedPaperList(null);
      setShowAllPapers(false);
    } else if (cluster) {
      selectCluster(cluster);
      const clusterNodeIds = new Set(
        (graphData?.nodes || [])
          .filter(n => n.cluster_id === cluster.id)
          .map(n => n.id)
      );
      setHighlightedPaperIds(clusterNodeIds);
      setExpandedPaperList(cluster.id);
      setShowAllPapers(false);
    }
  }, [graphData, selectedCluster, selectCluster, setHighlightedPaperIds, clearHighlightedPaperIds]);

  if (!graphData) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-[#00E5FF]/60" />
          <span className="hud-label text-[#00E5FF]/50">SECTOR SCANNER</span>
        </div>
        <p className="text-xs text-[#7B8CDE]/40 font-mono">
          Search to see topic clusters
        </p>
      </div>
    );
  }

  const clusters = graphData.clusters;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-[#00E5FF]" />
        <span className="hud-label text-[#00E5FF]/60">SECTOR SCANNER</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[rgba(0,229,255,0.12)] to-transparent" />
        <span className="hud-label text-[#7B8CDE]/40">{clusters.length}</span>
      </div>

      {/* Cluster list */}
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
                  ? 'bg-[rgba(0,229,255,0.04)] border-[rgba(0,229,255,0.12)]'
                  : 'hover:bg-[rgba(0,229,255,0.02)] border-transparent'
              } ${isHidden ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2 p-3">
                {/* Color dot */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: cluster.color,
                      boxShadow: isSelected ? `0 0 8px ${cluster.color}60` : undefined,
                    }}
                  />
                </div>

                {/* Cluster info */}
                <button
                  onClick={() => handleClusterSelect(isSelected ? null : cluster)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-medium text-text-primary truncate">
                    {cluster.label}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#7B8CDE]/50 mt-0.5">
                    <span>{cluster.paper_count} papers</span>
                    {edgeCount > 0 && (
                      <span className="text-[#7B8CDE]/30">{edgeCount} edges</span>
                    )}
                  </div>

                  {/* Density bar */}
                  <div className="mt-1.5 h-0.5 bg-[rgba(0,229,255,0.04)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(densityRatio * 100)}%`,
                        backgroundColor: cluster.color,
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </button>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleClusterVisibility(cluster.id);
                    }}
                    title={isHidden ? 'Show cluster' : 'Hide cluster'}
                    className={`p-1.5 rounded-lg transition-all ${
                      isHidden
                        ? 'text-[#7B8CDE]/30 hover:text-[#7B8CDE]'
                        : 'text-[#00E5FF]/50 hover:text-[#00E5FF]'
                    }`}
                  >
                    {isHidden ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('focusCluster', { detail: { clusterId: cluster.id } })
                      );
                    }}
                    title="Focus on cluster"
                    className="p-1.5 rounded-lg text-[#7B8CDE]/30 hover:text-[#7B8CDE] transition-colors"
                  >
                    <Focus className="w-3.5 h-3.5" />
                  </button>

                  <ChevronRight
                    className={`w-3.5 h-3.5 text-[#7B8CDE]/30 transition-transform ${
                      isSelected ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Cluster detail panel */}
      <AnimatePresence>
        {selectedCluster && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-3"
          >
            {/* Topics */}
            <div className="hud-panel-clean rounded-lg p-3" style={{ borderLeft: `2px solid ${selectedCluster.color}` }}>
              <span className="hud-label text-[#7B8CDE]/50">Top Topics</span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedCluster.topics.slice(0, 6).map((topic) => (
                  <span
                    key={topic}
                    className="px-2 py-0.5 rounded text-[10px] font-mono text-[#7B8CDE]/70 bg-[rgba(0,229,255,0.03)] border border-[rgba(0,229,255,0.08)]"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            {/* Statistics */}
            {clusterStats && (
              <div className="hud-panel-clean rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-[#7B8CDE]/40" />
                  <span className="hud-label text-[#7B8CDE]/50">Statistics</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="hud-label mb-0.5">Avg Citations</div>
                    <div className="hud-value text-sm">{clusterStats.avgCitations.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="hud-label mb-0.5">Year Range</div>
                    <div className="hud-value text-sm">
                      {clusterStats.yearMin && clusterStats.yearMax
                        ? `${clusterStats.yearMin}–${clusterStats.yearMax}`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="hud-label mb-0.5">Primary Field</div>
                    <div className="hud-value text-sm truncate">{clusterStats.topField}</div>
                  </div>
                  <div>
                    <div className="hud-label mb-0.5">Edge Ratio</div>
                    <div className="hud-value text-sm">
                      {clusterStats.internalEdges}i / {clusterStats.externalEdges}e
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Paper list */}
            <div className="hud-panel-clean rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-[#7B8CDE]/40" />
                <span className="hud-label text-[#7B8CDE]/50">Papers</span>
                <span className="ml-auto hud-label text-[#7B8CDE]/30">
                  {clusterPapers.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {(showAllPapers ? clusterPapers : clusterPapers.slice(0, 10)).map((paper) => (
                  <button
                    key={paper.id}
                    onClick={() => selectPaper(paper)}
                    className="w-full text-left p-2 rounded-lg hover:bg-[rgba(0,229,255,0.04)] border border-transparent hover:border-[rgba(0,229,255,0.08)] transition-all group"
                  >
                    <div className="text-xs text-text-primary truncate group-hover:text-[#00E5FF] transition-colors">
                      {paper.title}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[#7B8CDE]/40 mt-0.5">
                      {paper.year && <span>{paper.year}</span>}
                      <span>{(paper.citation_count || 0).toLocaleString()} cit.</span>
                    </div>
                  </button>
                ))}
              </div>
              {clusterPapers.length > 10 && !showAllPapers && (
                <button
                  onClick={() => setShowAllPapers(true)}
                  className="hud-button w-full mt-2 py-1.5 rounded-lg text-[10px] uppercase tracking-wider"
                >
                  Show all {clusterPapers.length} papers
                </button>
              )}
              {showAllPapers && clusterPapers.length > 10 && (
                <button
                  onClick={() => setShowAllPapers(false)}
                  className="w-full mt-2 py-1.5 text-[10px] font-mono text-[#7B8CDE]/50 hover:text-[#7B8CDE] transition-colors"
                >
                  Show less
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
