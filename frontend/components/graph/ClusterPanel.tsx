'use client';

import { useMemo, useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { Layers } from 'lucide-react';
import type { Paper } from '@/types';

export default function ClusterPanel() {
  const {
    graphData,
    selectedCluster,
    selectCluster,
    setHighlightedPaperIds,
    clearHighlightedPaperIds,
    selectPaper,
    selectedPaper,
    setPanelSelectionId,
  } = useGraphStore();

  const [showAllPapers, setShowAllPapers] = useState(false);

  const clusterPapers = useMemo(() => {
    if (!graphData || !selectedCluster) return [];
    return graphData.nodes
      .filter(n => n.cluster_id === selectedCluster.id)
      .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
  }, [graphData, selectedCluster]);

  const sharedFoundations = useMemo(() => {
    if (!graphData || !selectedCluster) return [];

    const clusterPaperIds = new Set(
      graphData.nodes
        .filter(n => n.cluster_id === selectedCluster.id)
        .map(n => n.id)
    );
    const clusterSize = clusterPaperIds.size;
    if (clusterSize < 3) return [];

    // Count how many cluster papers cite each target
    const citedByCount = new Map<string, number>();
    graphData.edges.forEach(e => {
      if (e.type === 'citation' && clusterPaperIds.has(e.source)) {
        citedByCount.set(e.target, (citedByCount.get(e.target) || 0) + 1);
      }
    });

    // At least 3 papers must cite it, take top 5
    return Array.from(citedByCount.entries())
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        paper: graphData.nodes.find(n => n.id === id),
        count,
        total: clusterSize,
      }))
      .filter((f): f is { paper: Paper; count: number; total: number } => !!f.paper);
  }, [graphData, selectedCluster]);

  const handleClusterSelect = useCallback((cluster: typeof selectedCluster) => {
    if (cluster && cluster.id === selectedCluster?.id) {
      selectCluster(null);
      clearHighlightedPaperIds();
      setShowAllPapers(false);
    } else if (cluster) {
      selectCluster(cluster);
      const clusterNodeIds = new Set(
        (graphData?.nodes || [])
          .filter(n => n.cluster_id === cluster.id)
          .map(n => n.id)
      );
      setHighlightedPaperIds(clusterNodeIds);
      setShowAllPapers(false);
    }
  }, [graphData, selectedCluster, selectCluster, setHighlightedPaperIds, clearHighlightedPaperIds]);

  if (!graphData) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-[#D4AF37]/60" />
          <span className="hud-label text-[#D4AF37]/50">SECTOR SCANNER</span>
        </div>
        <p className="text-xs text-[#999999]/40 font-mono">
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
        <Layers className="w-4 h-4 text-[#D4AF37]" />
        <span className="hud-label text-[#D4AF37]/60">SECTOR SCANNER</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-transparent" />
        <span className="hud-label text-[#999999]/40">{clusters.length}</span>
      </div>

      {/* Cluster list */}
      <div className="space-y-1.5">
        {clusters.map((cluster) => {
          const isSelected = selectedCluster?.id === cluster.id;

          return (
            <div
              key={cluster.id}
              className={`rounded-lg border transition-all ${
                isSelected
                  ? 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.06)]'
                  : 'hover:bg-[rgba(255,255,255,0.01)] border-transparent'
              }`}
            >
              <button
                onClick={() => handleClusterSelect(isSelected ? null : cluster)}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} cluster: ${cluster.label}`}
                className="flex items-center gap-2 p-3 w-full text-left"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: cluster.color,
                    boxShadow: isSelected ? `0 0 8px ${cluster.color}60` : undefined,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate" title={cluster.label}>
                    {cluster.label}
                  </div>
                  <div className="text-[10px] font-mono text-[#999999]/50 mt-0.5">
                    {cluster.paper_count} papers
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected cluster detail */}
      {selectedCluster && (
        <div className="mt-4 space-y-3">
          {/* Key Terms */}
          <div className="hud-panel-clean rounded-lg p-3" style={{ borderLeft: `2px solid ${selectedCluster.color}` }}>
            <span className="hud-label text-[#999999]/50">Key Terms</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedCluster.topics.slice(0, 6).map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-0.5 rounded text-[10px] font-mono text-[#999999]/70 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>

          {/* Shared Foundations */}
          {sharedFoundations.length > 0 && (
            <div className="hud-panel-clean rounded-lg p-3" style={{ borderLeft: `2px solid ${selectedCluster.color}40` }}>
              <span className="hud-label text-[#999999]/50">Shared Foundations</span>
              <div className="space-y-1 mt-2">
                {sharedFoundations.map(({ paper, count, total }) => (
                  <button
                    key={paper.id}
                    onClick={() => {
                      selectPaper(paper);
                      setPanelSelectionId(paper.id);
                    }}
                    className={`w-full text-left p-2 rounded-lg transition-all group ${
                      selectedPaper?.id === paper.id
                        ? 'bg-[rgba(212,175,55,0.06)] border border-[rgba(212,175,55,0.12)]'
                        : 'hover:bg-[rgba(255,255,255,0.02)] border border-transparent'
                    }`}
                  >
                    <div className={`text-xs truncate transition-colors ${
                      selectedPaper?.id === paper.id
                        ? 'text-[#D4AF37] font-semibold'
                        : 'text-text-primary group-hover:text-[#D4AF37]'
                    }`}>
                      {paper.title}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[#999999]/40 mt-0.5">
                      {paper.year && <span>{paper.year}</span>}
                      <span className="text-[#D4AF37]/50">{count} / {total} papers cite this</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Paper list */}
          <div className="hud-panel-clean rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="hud-label text-[#999999]/50">Papers</span>
              <span className="ml-auto hud-label text-[#999999]/30">
                {clusterPapers.length}
              </span>
            </div>
            <div className="space-y-0.5">
              {(showAllPapers ? clusterPapers : clusterPapers.slice(0, 10)).map((paper) => (
                <button
                  key={paper.id}
                  onClick={() => {
                    selectPaper(paper);
                    setPanelSelectionId(paper.id);
                  }}
                  className={`w-full text-left p-2 rounded-lg transition-all group ${
                    selectedPaper?.id === paper.id
                      ? 'bg-[rgba(212,175,55,0.06)] border-l-2 border-[#D4AF37] border-t border-r border-b border-t-[rgba(212,175,55,0.12)] border-r-[rgba(212,175,55,0.12)] border-b-[rgba(212,175,55,0.12)]'
                      : 'hover:bg-[rgba(255,255,255,0.02)] border border-transparent hover:border-[rgba(255,255,255,0.04)]'
                  }`}
                >
                  <div className={`text-xs line-clamp-2 transition-colors ${
                    selectedPaper?.id === paper.id
                      ? 'text-[#D4AF37] font-semibold'
                      : 'text-text-primary truncate group-hover:text-[#D4AF37]'
                  }`}>
                    {paper.title}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#999999]/40 mt-0.5">
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
                className="w-full mt-2 py-1.5 text-[10px] font-mono text-[#999999]/50 hover:text-[#999999] transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
