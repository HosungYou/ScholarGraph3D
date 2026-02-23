'use client';

import { useMemo } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { Radar, Waypoints, Sparkles } from 'lucide-react';
import type { StructuralGap } from '@/types';

export default function GapSpotterPanel() {
  const {
    gaps,
    graphData,
    frontierIds,
    setHighlightedPaperIds,
    clearHighlightedPaperIds,
  } = useGraphStore();

  // Build paper id → title lookup from graph nodes
  const paperTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!graphData) return map;
    graphData.nodes.forEach((n) => map.set(n.id, n.title));
    return map;
  }, [graphData]);

  // Resolve frontier papers with titles
  const frontierPapers = useMemo(() => {
    return frontierIds
      .map((id) => ({ id, title: paperTitleMap.get(id) ?? id }))
      .filter((p) => p.title !== p.id || paperTitleMap.has(p.id));
  }, [frontierIds, paperTitleMap]);

  // Empty state
  if (gaps.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Radar className="w-4 h-4 text-[#00E5FF]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#00E5FF]/60">
            GAP SPOTTER
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Waypoints className="w-8 h-8 text-[#1a2555] mb-3" />
          <p className="text-xs font-mono text-[#7B8CDE]/50 leading-relaxed">
            No research gaps detected yet. Build a larger graph to discover connections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Radar className="w-4 h-4 text-[#00E5FF]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#00E5FF]/60">
          GAP SPOTTER
        </span>
        <span className="ml-auto text-[10px] font-mono text-[#7B8CDE]/60">
          {gaps.length} gap{gaps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Gap cards */}
      <div className="space-y-3 mb-4">
        {gaps.map((gap: StructuralGap) => (
          <GapCard
            key={gap.gap_id}
            gap={gap}
            onMouseEnter={() => {
              const ids = new Set(gap.bridge_papers.map((bp) => bp.paper_id));
              setHighlightedPaperIds(ids);
            }}
            onMouseLeave={() => clearHighlightedPaperIds()}
          />
        ))}
      </div>

      {/* Frontier papers section */}
      {frontierPapers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#1a2555]/40">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#a29bfe]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#a29bfe]/70">
              FRONTIER PAPERS
            </span>
            <span className="ml-auto text-[10px] font-mono text-[#7B8CDE]/40">
              {frontierPapers.length}
            </span>
          </div>
          <p className="text-[10px] font-mono text-[#7B8CDE]/40 mb-2 leading-relaxed">
            Papers with many unexplored connections
          </p>
          <div className="space-y-1">
            {frontierPapers.slice(0, 8).map((paper) => (
              <div
                key={paper.id}
                className="p-2 rounded border border-[#1a2555]/30 bg-[#050510]/60 hover:border-[#a29bfe]/30 hover:bg-[#0d0b1e]/60 transition-colors"
              >
                <p className="text-xs font-mono text-[#a29bfe]/80 leading-snug line-clamp-2">
                  {paper.title}
                </p>
              </div>
            ))}
            {frontierPapers.length > 8 && (
              <p className="text-[10px] font-mono text-[#7B8CDE]/40 pt-1 text-center">
                +{frontierPapers.length - 8} more frontier papers
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gap Card ────────────────────────────────────────────────────────────────

interface GapCardProps {
  gap: StructuralGap;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function GapCard({ gap, onMouseEnter, onMouseLeave }: GapCardProps) {
  const strengthPct = Math.round(gap.gap_strength * 100);

  // Color ramp: low gap strength = dim blue, high = bright cyan
  const strengthColor =
    gap.gap_strength > 0.75
      ? '#00E5FF'
      : gap.gap_strength > 0.5
      ? '#7B8CDE'
      : '#3a4a8a';

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="rounded-lg border border-[#1a2555] bg-[#050510]/80 hover:border-[#1a2555]/80 hover:bg-[#0a0d1e]/80 transition-all cursor-default"
    >
      <div className="p-3">
        {/* Cluster pair */}
        <div className="flex items-center gap-1.5 mb-2">
          <Waypoints className="w-3 h-3 text-[#7B8CDE]/60 flex-shrink-0" />
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-[10px] font-mono text-[#7B8CDE] truncate max-w-[80px]">
              {gap.cluster_a.label}
            </span>
            <span className="text-[10px] font-mono text-[#1a2555]">↔</span>
            <span className="text-[10px] font-mono text-[#7B8CDE] truncate max-w-[80px]">
              {gap.cluster_b.label}
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#7B8CDE]/40 flex-shrink-0 ml-auto">
            {gap.cluster_a.paper_count + gap.cluster_b.paper_count}p
          </span>
        </div>

        {/* Gap strength bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono uppercase tracking-wider text-[#7B8CDE]/40">
              Gap Strength
            </span>
            <span className="text-[9px] font-mono" style={{ color: strengthColor }}>
              {strengthPct}%
            </span>
          </div>
          <div className="h-1 bg-[#0a0f1e] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${strengthPct}%`,
                backgroundColor: strengthColor,
                boxShadow: gap.gap_strength > 0.6 ? `0 0 6px ${strengthColor}60` : undefined,
              }}
            />
          </div>
        </div>

        {/* Bridge papers */}
        {gap.bridge_papers.length > 0 && (
          <div className="mb-2">
            <div className="text-[9px] font-mono uppercase tracking-wider text-[#7B8CDE]/40 mb-1">
              Bridge Papers
            </div>
            <div className="space-y-0.5">
              {gap.bridge_papers.slice(0, 3).map((bp) => (
                <div
                  key={bp.paper_id}
                  className="flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-[#111833]/60 transition-colors"
                >
                  <div
                    className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: '#00E5FF', opacity: bp.score }}
                  />
                  <span className="text-[10px] font-mono text-[#7B8CDE]/70 leading-snug line-clamp-2">
                    {bp.title}
                  </span>
                  <span className="text-[9px] font-mono text-[#7B8CDE]/30 flex-shrink-0 ml-auto">
                    {Math.round(bp.score * 100)}%
                  </span>
                </div>
              ))}
              {gap.bridge_papers.length > 3 && (
                <p className="text-[9px] font-mono text-[#7B8CDE]/30 px-1.5">
                  +{gap.bridge_papers.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
