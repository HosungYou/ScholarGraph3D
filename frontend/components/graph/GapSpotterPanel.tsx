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

      {/* Gap cards */}
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

// ─── Gap Card ─────────────────────────────────────────────────────────────────

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
    gap.gap_strength > 0.75 ? '#D4AF37'
    : gap.gap_strength > 0.5 ? '#999999'
    : '#444444';

  const isActive = highlightedClusterPair &&
    ((highlightedClusterPair[0] === gap.cluster_a.id && highlightedClusterPair[1] === gap.cluster_b.id) ||
     (highlightedClusterPair[0] === gap.cluster_b.id && highlightedClusterPair[1] === gap.cluster_a.id));

  return (
    <div className="hud-panel-clean rounded-lg" style={isActive ? { borderLeft: '2px solid #D4AF37' } : undefined}>
      <div className="p-3">
        {/* Header row */}
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
          {expanded
            ? <ChevronDown className="w-3 h-3 text-[#999999]/30 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-[#999999]/30 flex-shrink-0" />
          }
          <Waypoints className="w-3 h-3 text-[#999999]/40 flex-shrink-0" />
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-[10px] font-mono text-[#999999]/70 truncate max-w-[100px]" title={gap.cluster_a.label}>
              {gap.cluster_a.label}
            </span>
            <span className="text-[10px] font-mono text-[rgba(255,255,255,0.1)] flex-shrink-0">↔</span>
            <span className="text-[10px] font-mono text-[#999999]/70 truncate max-w-[100px]" title={gap.cluster_b.label}>
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

        {/* Expanded: Field Relationship View */}
        {expanded && (
          <FieldRelationshipView
            gap={gap}
            graphData={graphData}
            selectPaper={selectPaper}
            setPanelSelectionId={setPanelSelectionId}
            setHighlightedClusterPair={setHighlightedClusterPair}
          />
        )}
      </div>
    </div>
  );
}

// ─── Field Relationship View ───────────────────────────────────────────────────

type RelationshipType = 'unknown-neighbors' | 'emerging-bridge' | 'different-fields' | 'well-connected';

function classifyRelationship(similarity: number, density: number): RelationshipType {
  if (density > 0.15) return 'well-connected';
  if (similarity > 0.65 && density < 0.05) return 'unknown-neighbors';
  if (similarity > 0.65) return 'emerging-bridge';
  if (similarity < 0.40) return 'different-fields';
  return 'emerging-bridge';
}

const RELATIONSHIP_META: Record<RelationshipType, { label: string; color: string; description: string }> = {
  'unknown-neighbors': {
    label: 'Unknown Neighbors',
    color: '#D4AF37',
    description: 'Semantically close but rarely cite each other — high potential for cross-pollination.',
  },
  'emerging-bridge': {
    label: 'Emerging Bridge',
    color: '#51CF66',
    description: 'Some connections exist and are growing. Integration is underway.',
  },
  'different-fields': {
    label: 'Different Fields',
    color: '#999999',
    description: 'Low semantic overlap and low citations — genuinely separate domains.',
  },
  'well-connected': {
    label: 'Well Connected',
    color: '#4DA6FF',
    description: 'Fields actively cite each other. Gap may be overstated.',
  },
};

interface FieldRelationshipViewProps {
  gap: StructuralGap;
  graphData: NonNullable<ReturnType<typeof useGraphStore.getState>['graphData']>;
  selectPaper: (paper: Paper) => void;
  setPanelSelectionId: (id: string | null) => void;
  setHighlightedClusterPair: (pair: [number, number] | null) => void;
}

function FieldRelationshipView({
  gap,
  graphData,
  selectPaper,
  setPanelSelectionId,
  setHighlightedClusterPair,
}: FieldRelationshipViewProps) {
  const evidence = gap.evidence_detail;
  const breakdown = gap.gap_score_breakdown;
  const temporal = gap.temporal_context;

  const clusterAData = graphData.clusters.find(c => c.id === gap.cluster_a.id);
  const clusterBData = graphData.clusters.find(c => c.id === gap.cluster_b.id);
  const colorA = clusterAData?.color ?? '#D4AF37';
  const colorB = clusterBData?.color ?? '#4DA6FF';

  const density = evidence
    ? evidence.actual_edges / Math.max(1, evidence.max_possible_edges)
    : 0;
  const similarity = evidence?.centroid_similarity ?? breakdown?.relatedness ?? 0;

  const relType = classifyRelationship(similarity, density);
  const relMeta = RELATIONSHIP_META[relType];

  const bridgePapers = gap.bridge_papers.filter(
    bp => (bp.cited_by_a_count ?? 0) > 0 || (bp.cited_by_b_count ?? 0) > 0
  );
  const semanticOnly = gap.bridge_papers.filter(
    bp => (bp.cited_by_a_count ?? 0) === 0 && (bp.cited_by_b_count ?? 0) === 0
  );

  return (
    <div className="mt-3 space-y-3">

      {/* Relationship type */}
      <div
        className="rounded-lg p-3"
        style={{ borderLeft: `2px solid ${relMeta.color}`, background: 'rgba(255,255,255,0.015)' }}
      >
        <span className="text-[11px] font-semibold font-mono" style={{ color: relMeta.color }}>
          {relMeta.label}
        </span>
        <p className="text-[10px] font-mono text-[#999999]/55 leading-relaxed mt-1">
          {relMeta.description}
        </p>
      </div>

      {/* Quantitative evidence */}
      {evidence && (
        <div className="space-y-2.5">
          <span className="hud-label text-[#999999]/40 block">Evidence</span>

          {/* Citation density */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono text-[#999999]/50">Citation density</span>
              <span className="text-[9px] font-mono text-[#999999]/70">
                {evidence.actual_edges} / {evidence.max_possible_edges}
              </span>
            </div>
            <div className="h-1 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, density * 800)}%`,
                  backgroundColor: density > 0.10 ? '#51CF66' : density > 0.03 ? '#D4AF37' : '#FF6B6B',
                  minWidth: evidence.actual_edges > 0 ? '4px' : '0',
                }}
              />
            </div>
          </div>

          {/* Semantic similarity */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono text-[#999999]/50">Semantic similarity</span>
              <span className="text-[9px] font-mono text-[#999999]/70">
                {Math.round(similarity * 100)}%
              </span>
            </div>
            <div className="h-1 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4DA6FF]"
                style={{ width: `${similarity * 100}%` }}
              />
            </div>
          </div>

          {/* Temporal context */}
          {temporal && temporal.year_range_a[0] > 0 && temporal.year_range_b[0] > 0 && (
            <div className="text-[9px] font-mono text-[#999999]/40 space-y-0.5 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorA }} />
                <span style={{ color: colorA + '99' }}>
                  {gap.cluster_a.label.slice(0, 16)}: {temporal.year_range_a[0]}–{temporal.year_range_a[1]}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorB }} />
                <span style={{ color: colorB + '99' }}>
                  {gap.cluster_b.label.slice(0, 16)}: {temporal.year_range_b[0]}–{temporal.year_range_b[1]}
                </span>
              </div>
              {temporal.overlap_years > 0 && (
                <div className="text-[#999999]/30">{temporal.overlap_years} overlapping years</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bridge papers with citation evidence */}
      {bridgePapers.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="hud-label">Bridge Papers</span>
            <span className="text-[9px] font-mono text-[#999999]/30 ml-auto">cross-cluster citations</span>
          </div>
          <div className="space-y-1">
            {bridgePapers.slice(0, 5).map((bp) => {
              const fullPaper = graphData.nodes.find(n => n.id === bp.paper_id);
              return (
                <button
                  key={bp.paper_id}
                  onClick={() => {
                    if (fullPaper) {
                      setHighlightedClusterPair(null);
                      selectPaper(fullPaper);
                      setPanelSelectionId(fullPaper.id);
                    }
                  }}
                  className="w-full text-left px-2 py-1.5 rounded border border-transparent hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.06)] transition-colors"
                >
                  <div className="text-[10px] font-mono text-[#999999]/80 leading-snug line-clamp-1 hover:text-[#D4AF37]/80 transition-colors">
                    ⬡ {bp.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-mono" style={{ color: colorA + '80' }}>
                      A: {bp.cited_by_a_count ?? 0}
                    </span>
                    <span className="text-[rgba(255,255,255,0.1)]">·</span>
                    <span className="text-[9px] font-mono" style={{ color: colorB + '80' }}>
                      B: {bp.cited_by_b_count ?? 0}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Semantic-only bridges */}
      {semanticOnly.length > 0 && bridgePapers.length === 0 && (
        <div>
          <span className="hud-label text-[#999999]/30 block mb-1">
            Semantic candidates
          </span>
          <div className="space-y-0.5">
            {semanticOnly.slice(0, 3).map((bp) => {
              const fullPaper = graphData.nodes.find(n => n.id === bp.paper_id);
              return (
                <button
                  key={bp.paper_id}
                  onClick={() => {
                    if (fullPaper) {
                      setHighlightedClusterPair(null);
                      selectPaper(fullPaper);
                      setPanelSelectionId(fullPaper.id);
                    }
                  }}
                  className="w-full text-left px-1.5 py-1 rounded hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                >
                  <span className="text-[10px] font-mono text-[#999999]/40 leading-snug line-clamp-1">
                    {bp.title}
                  </span>
                  <div className="text-[9px] font-mono text-[#999999]/20 mt-0.5">no citation evidence</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
