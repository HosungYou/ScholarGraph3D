'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { Radar, Waypoints, ChevronDown, ChevronRight } from 'lucide-react';
import type { StructuralGap, Paper } from '@/types';

export default function GapSpotterPanel() {
  const {
    gaps,
    graphData,
    selectPaper,
    setPanelSelectionId,
    setHighlightedClusterPair,
    highlightedClusterPair,
  } = useGraphStore();

  if (gaps.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Radar className="w-4 h-4 text-[#D4AF37]/60" />
          <span className="hud-label text-[#D4AF37]/50">GAP SPOTTER</span>
        </div>
        <p className="text-[10px] font-mono text-[#999999]/40 py-4 text-center">
          No gaps detected. Expand the graph to discover connections.
        </p>
      </div>
    );
  }

  const sortedGaps = [...gaps].sort((a, b) => b.gap_strength - a.gap_strength);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Radar className="w-4 h-4 text-[#D4AF37]" />
        <span className="hud-label text-[#D4AF37]/60">GAP SPOTTER</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-transparent" />
        <span className="text-xs font-mono text-[#D4AF37]/70">{gaps.length}</span>
      </div>

      {/* Gap cards — flat list sorted by strength */}
      <div className="space-y-2">
        {sortedGaps.map((gap) => (
          <GapCard
            key={gap.gap_id}
            gap={gap}
            graphData={graphData!}
            selectPaper={selectPaper}
            setPanelSelectionId={setPanelSelectionId}
            setHighlightedClusterPair={setHighlightedClusterPair}
            highlightedClusterPair={highlightedClusterPair}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Gap Card ────────────────────────────────────────────────────────────────

interface GapCardProps {
  gap: StructuralGap;
  graphData: NonNullable<ReturnType<typeof useGraphStore.getState>['graphData']>;
  selectPaper: (paper: Paper) => void;
  setPanelSelectionId: (id: string | null) => void;
  setHighlightedClusterPair: (pair: [number, number] | null) => void;
  highlightedClusterPair: [number, number] | null;
}

function GapCard({ gap, graphData, selectPaper, setPanelSelectionId, setHighlightedClusterPair, highlightedClusterPair }: GapCardProps) {
  const [expanded, setExpanded] = useState(false);
  const strengthPct = Math.round(gap.gap_strength * 100);

  const strengthColor =
    gap.gap_strength > 0.75
      ? '#D4AF37'
      : gap.gap_strength > 0.5
      ? '#999999'
      : '#444444';

  const isActive = highlightedClusterPair &&
    ((highlightedClusterPair[0] === gap.cluster_a.id && highlightedClusterPair[1] === gap.cluster_b.id) ||
     (highlightedClusterPair[0] === gap.cluster_b.id && highlightedClusterPair[1] === gap.cluster_a.id));

  return (
    <div className="hud-panel-clean rounded-lg" style={isActive ? { borderLeft: '2px solid #D4AF37' } : undefined}>
      <div className="p-3">
        {/* Header row — cluster pair + strength */}
        <button
          className="flex items-center gap-1.5 w-full text-left"
          onClick={() => {
            const newExpanded = !expanded;
            setExpanded(newExpanded);
            if (newExpanded) {
              setHighlightedClusterPair([gap.cluster_a.id, gap.cluster_b.id]);
            } else {
              setHighlightedClusterPair(null);
            }
          }}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-[#999999]/30 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-[#999999]/30 flex-shrink-0" />
          )}
          <Waypoints className="w-3 h-3 text-[#999999]/40 flex-shrink-0" />
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-[10px] font-mono text-[#999999]/70 truncate max-w-[120px]" title={gap.cluster_a.label}>
              {gap.cluster_a.label}
            </span>
            <span className="text-[10px] font-mono text-[rgba(255,255,255,0.1)] flex-shrink-0">{'\u2194'}</span>
            <span className="text-[10px] font-mono text-[#999999]/70 truncate max-w-[120px]" title={gap.cluster_b.label}>
              {gap.cluster_b.label}
            </span>
          </div>
          <span className="text-[9px] font-mono font-semibold flex-shrink-0 ml-1" style={{ color: strengthColor }}>
            {strengthPct}%
          </span>
        </button>

        {/* Strength bar */}
        <div className="h-0.5 bg-[rgba(255,255,255,0.02)] rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full"
            style={{ width: `${strengthPct}%`, backgroundColor: strengthColor }}
          />
        </div>

        {/* Expanded body */}
        {expanded && (
          <div className="mt-3 space-y-2">
            {/* Bridge papers */}
            {gap.bridge_papers.length > 0 && (
              <div>
                <span className="hud-label mb-1 block">Bridge Papers</span>
                <div className="space-y-0.5">
                  {gap.bridge_papers.slice(0, 5).map((bp) => {
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
                        className="w-full text-left px-1.5 py-1 rounded hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                      >
                        <span className="text-[10px] font-mono text-[#999999]/60 leading-snug line-clamp-1 hover:text-[#D4AF37]/80 transition-colors">
                          {bp.title}
                        </span>
                      </button>
                    );
                  })}
                  {gap.bridge_papers.length > 5 && (
                    <p className="text-[9px] font-mono text-[#999999]/25 px-1.5">
                      +{gap.bridge_papers.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Research Questions (collapsed) */}
            {gap.research_questions.length > 0 && (
              <ResearchQuestions questions={gap.research_questions} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Research Questions Accordion ────────────────────────────────────────────

function ResearchQuestions({ questions }: { questions: (string | { question: string; justification: string; methodology_hint: string })[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
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
              className="text-[10px] font-mono text-[#999999]/60 leading-snug pl-2 border-l border-[rgba(212,175,55,0.15)]"
            >
              {typeof q === 'string' ? q : q.question}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
