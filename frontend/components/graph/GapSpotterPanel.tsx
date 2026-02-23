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

  const paperTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!graphData) return map;
    graphData.nodes.forEach((n) => map.set(n.id, n.title));
    return map;
  }, [graphData]);

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
          <Radar className="w-4 h-4 text-[#D4AF37]/60" />
          <span className="hud-label text-[#D4AF37]/50">GAP SPOTTER</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Waypoints className="w-8 h-8 text-[rgba(255,255,255,0.04)] mb-3" />
          <p className="text-[10px] font-mono text-[#999999]/40 leading-relaxed max-w-[200px]">
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
        <Radar className="w-4 h-4 text-[#D4AF37]" />
        <span className="hud-label text-[#D4AF37]/60">GAP SPOTTER</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-transparent" />
        <span className="hud-label text-[#999999]/40">
          {gaps.length} gap{gaps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Gap cards */}
      <div className="space-y-2 mb-4">
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
        <div className="mt-4 pt-4">
          <div className="hud-divider mb-4" />
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hud-label text-[#D4AF37]/60">FRONTIER PAPERS</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[rgba(212,175,55,0.12)] to-transparent" />
            <span className="hud-label text-[#999999]/30">
              {frontierPapers.length}
            </span>
          </div>
          <p className="text-[10px] font-mono text-[#999999]/35 mb-2 leading-relaxed">
            Papers with many unexplored connections
          </p>
          <div className="space-y-1">
            {frontierPapers.slice(0, 8).map((paper) => (
              <div
                key={paper.id}
                className="p-2 rounded-lg border border-[rgba(212,175,55,0.08)] bg-[rgba(212,175,55,0.02)] hover:border-[rgba(212,175,55,0.15)] hover:bg-[rgba(212,175,55,0.04)] transition-all"
              >
                <p className="text-[10px] font-mono text-[#D4AF37]/70 leading-snug line-clamp-2">
                  {paper.title}
                </p>
              </div>
            ))}
            {frontierPapers.length > 8 && (
              <p className="text-[10px] font-mono text-[#999999]/30 pt-1 text-center">
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

  const strengthColor =
    gap.gap_strength > 0.75
      ? '#D4AF37'
      : gap.gap_strength > 0.5
      ? '#999999'
      : '#444444';

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="hud-panel-clean rounded-lg hover:border-[rgba(212,175,55,0.15)] transition-all cursor-default"
    >
      <div className="p-3">
        {/* Cluster pair */}
        <div className="flex items-center gap-1.5 mb-2">
          <Waypoints className="w-3 h-3 text-[#999999]/40 flex-shrink-0" />
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-[10px] font-mono text-[#999999]/70 truncate max-w-[80px]">
              {gap.cluster_a.label}
            </span>
            <span className="text-[10px] font-mono text-[rgba(255,255,255,0.1)]">↔</span>
            <span className="text-[10px] font-mono text-[#999999]/70 truncate max-w-[80px]">
              {gap.cluster_b.label}
            </span>
          </div>
          <span className="hud-label text-[#999999]/30 flex-shrink-0 ml-auto">
            {gap.cluster_a.paper_count + gap.cluster_b.paper_count}p
          </span>
        </div>

        {/* Gap strength bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="hud-label">Gap Strength</span>
            <span className="text-[9px] font-mono font-semibold" style={{ color: strengthColor }}>
              {strengthPct}%
            </span>
          </div>
          <div className="h-0.5 bg-[rgba(255,255,255,0.02)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${strengthPct}%`,
                backgroundColor: strengthColor,
                boxShadow: gap.gap_strength > 0.6 ? `0 0 6px ${strengthColor}40` : undefined,
              }}
            />
          </div>
        </div>

        {/* Bridge papers */}
        {gap.bridge_papers.length > 0 && (
          <div className="mb-1">
            <span className="hud-label mb-1 block">Bridge Papers</span>
            <div className="space-y-0.5">
              {gap.bridge_papers.slice(0, 3).map((bp) => (
                <div
                  key={bp.paper_id}
                  className="flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                >
                  <div
                    className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: '#D4AF37', opacity: bp.score * 0.8 }}
                  />
                  <span className="text-[10px] font-mono text-[#999999]/60 leading-snug line-clamp-2">
                    {bp.title}
                  </span>
                  <span className="text-[9px] font-mono text-[#999999]/25 flex-shrink-0 ml-auto">
                    {Math.round(bp.score * 100)}%
                  </span>
                </div>
              ))}
              {gap.bridge_papers.length > 3 && (
                <p className="text-[9px] font-mono text-[#999999]/25 px-1.5">
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
