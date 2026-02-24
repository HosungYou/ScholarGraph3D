'use client';

import { useMemo, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { Radar, Waypoints, Sparkles, ChevronDown } from 'lucide-react';
import type { StructuralGap, Paper } from '@/types';

export default function GapSpotterPanel() {
  const {
    gaps,
    graphData,
    frontierIds,
    selectPaper,
    setHighlightedPaperIds,
    clearHighlightedPaperIds,
    setPanelSelectionId,
    setHighlightedClusterPair,
    setHoveredGapEdges,
  } = useGraphStore();

  const frontierPapers = useMemo(() => {
    if (!graphData) return [];
    return frontierIds
      .map((id) => graphData.nodes.find((n) => n.id === id))
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [frontierIds, graphData]);

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
            graphData={graphData!}
            selectPaper={selectPaper}
            setPanelSelectionId={setPanelSelectionId}
            onMouseEnter={() => {
              const ids = new Set(gap.bridge_papers.map((bp) => bp.paper_id));
              setHighlightedPaperIds(ids);
              setHighlightedClusterPair([gap.cluster_a.id, gap.cluster_b.id]);
              setHoveredGapEdges(gap.potential_edges);
            }}
            onMouseLeave={() => {
              clearHighlightedPaperIds();
              setHighlightedClusterPair(null);
              setHoveredGapEdges([]);
            }}
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
              <button
                key={paper.id}
                onClick={() => {
                  selectPaper(paper);
                  setPanelSelectionId(paper.id);
                }}
                onMouseEnter={() => setHighlightedPaperIds(new Set([paper.id]))}
                onMouseLeave={() => clearHighlightedPaperIds()}
                className="w-full text-left p-2 rounded-lg border border-[rgba(212,175,55,0.08)] bg-[rgba(212,175,55,0.02)] hover:border-[rgba(212,175,55,0.15)] hover:bg-[rgba(212,175,55,0.04)] transition-all group"
              >
                <p className="text-[10px] font-mono text-[#D4AF37]/70 leading-snug line-clamp-2 group-hover:text-[#D4AF37] transition-colors">
                  {paper.title}
                </p>
                <div className="flex items-center gap-2 text-[9px] font-mono text-[#999999]/30 mt-0.5">
                  {paper.year && <span>{paper.year}</span>}
                  <span>{(paper.citation_count || 0).toLocaleString()} cit.</span>
                  {paper.frontier_score != null && (
                    <span className="text-[#D4AF37]/40 ml-auto">
                      frontier {Math.round(paper.frontier_score * 100)}%
                    </span>
                  )}
                </div>
              </button>
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
  graphData: NonNullable<ReturnType<typeof useGraphStore.getState>['graphData']>;
  selectPaper: (paper: Paper) => void;
  setPanelSelectionId: (id: string | null) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function GapCard({ gap, graphData, selectPaper, setPanelSelectionId, onMouseEnter, onMouseLeave }: GapCardProps) {
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
              {gap.bridge_papers.slice(0, 3).map((bp) => {
                const fullPaper = graphData.nodes.find((n) => n.id === bp.paper_id);
                return (
                  <button
                    key={bp.paper_id}
                    onClick={() => {
                      if (fullPaper) {
                        selectPaper(fullPaper);
                        setPanelSelectionId(fullPaper.id);
                      }
                    }}
                    className="w-full flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-[rgba(255,255,255,0.04)] transition-colors text-left"
                  >
                    <div
                      className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: '#D4AF37', opacity: bp.score * 0.8 }}
                    />
                    <span className="text-[10px] font-mono text-[#999999]/60 leading-snug line-clamp-2 hover:text-[#D4AF37]/80 transition-colors">
                      {bp.title}
                    </span>
                    <span className="text-[9px] font-mono text-[#999999]/25 flex-shrink-0 ml-auto">
                      {Math.round(bp.score * 100)}%
                    </span>
                  </button>
                );
              })}
              {gap.bridge_papers.length > 3 && (
                <p className="text-[9px] font-mono text-[#999999]/25 px-1.5">
                  +{gap.bridge_papers.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Research Questions */}
        {gap.research_questions.length > 0 && (
          <ResearchQuestions questions={gap.research_questions} />
        )}
      </div>
    </div>
  );
}

// ─── Research Questions Accordion ────────────────────────────────────────────

function ResearchQuestions({ questions }: { questions: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        <span className="hud-label">Research Questions</span>
        <span className="text-[9px] font-mono text-[#999999]/25">{questions.length}</span>
        <div className="flex-1" />
        <ChevronDown
          className={`w-3 h-3 text-[#999999]/30 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {questions.map((q, i) => (
            <div
              key={i}
              className="text-[10px] font-mono text-[#999999]/50 leading-snug pl-2 border-l border-[rgba(212,175,55,0.1)]"
            >
              {q}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
