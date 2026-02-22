'use client';

import { useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { api } from '@/lib/api';
import type { StructuralGap } from '@/types';

// Skeleton loader
function GapSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-[#0a0f1e] rounded-lg p-4 border border-[#1a2555]">
          <div className="h-4 bg-[#111833] rounded w-full mb-2" />
          <div className="h-3 bg-[#111833] rounded w-2/3 mb-2" />
          <div className="h-2 bg-[#111833] rounded w-full" />
        </div>
      ))}
    </div>
  );
}

// Single gap card
function GapCard({
  gap,
  onHighlight,
  llmAvailable,
}: {
  gap: StructuralGap;
  onHighlight: (gap: StructuralGap) => void;
  llmAvailable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hypotheses, setHypotheses] = useState<string[]>(gap.research_questions);
  const [isGenerating, setIsGenerating] = useState(false);
  const { llmSettings } = useGraphStore();

  const strengthPercent = Math.round(gap.gap_strength * 100);

  // Color based on gap strength
  const strengthColor =
    strengthPercent >= 70
      ? '#EF4444'
      : strengthPercent >= 40
        ? '#F59E0B'
        : '#22C55E';

  const handleGenerateHypotheses = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!llmSettings) return;
      setIsGenerating(true);
      try {
        const result = await api.generateHypotheses(
          gap.gap_id,
          gap,
          llmSettings
        );
        setHypotheses(result);
      } catch (err) {
        console.error('Failed to generate hypotheses:', err);
      } finally {
        setIsGenerating(false);
      }
    },
    [gap, llmSettings]
  );

  return (
    <div className="bg-[#0a0f1e] rounded-lg overflow-hidden border border-[#1a2555] hover:border-cosmic-glow/20 transition-all duration-200">
      {/* Main clickable area */}
      <button
        onClick={() => onHighlight(gap)}
        className="w-full text-left p-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-mono font-medium text-[#E8EAF6] truncate">
            {gap.cluster_a.label}
          </span>
          <span className="text-[#7B8CDE]/50 flex-shrink-0">&#8596;</span>
          <span className="text-sm font-mono font-medium text-[#E8EAF6] truncate">
            {gap.cluster_b.label}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-[#7B8CDE]/80 mb-2">
          <span>{gap.bridge_papers.length} bridge papers</span>
          <span>{gap.potential_edges.length} potential links</span>
        </div>

        {/* Gap strength bar */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#7B8CDE]/50 mb-0.5">
            <span>Gap strength</span>
            <span>{strengthPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#111833] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${strengthPercent}%`,
                backgroundColor: strengthColor,
              }}
            />
          </div>
        </div>
      </button>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-1.5 text-xs font-mono text-[#7B8CDE]/50 hover:text-[#7B8CDE]/80 hover:bg-[#111833] transition-colors border-t border-[#1a2555] flex items-center justify-center gap-1"
      >
        {expanded ? 'Hide details' : 'Show details'}
        <span
          className={`transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          ▼
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-[#1a2555]">
          {/* Bridge papers */}
          {gap.bridge_papers.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-mono font-medium uppercase tracking-widest text-[#7B8CDE]/50 mb-1.5">
                Bridge Papers
              </div>
              <div className="space-y-1">
                {gap.bridge_papers.slice(0, 5).map((bp) => (
                  <div
                    key={bp.paper_id}
                    className="text-xs font-mono text-cosmic-glow hover:text-cosmic-glow/80 bg-[#111833] rounded px-2 py-1.5 flex items-center justify-between transition-colors"
                  >
                    <span className="truncate mr-2">{bp.title}</span>
                    <span className="text-[#7B8CDE]/50 flex-shrink-0">
                      {Math.round(bp.score * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Potential edges */}
          {gap.potential_edges.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-mono font-medium uppercase tracking-widest text-[#7B8CDE]/50 mb-1.5">
                Potential Connections
              </div>
              <div className="text-xs font-mono text-[#7B8CDE]/80">
                {gap.potential_edges.length} potential edges (avg similarity:{' '}
                {Math.round(
                  (gap.potential_edges.reduce(
                    (s, e) => s + e.similarity,
                    0
                  ) /
                    gap.potential_edges.length) *
                    100
                )}
                %)
              </div>
            </div>
          )}

          {/* Research questions / hypotheses */}
          {hypotheses.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-mono font-medium uppercase tracking-widest text-[#7B8CDE]/50 mb-1.5">
                Research Questions
              </div>
              <div className="space-y-1.5">
                {hypotheses.map((q, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono text-[#7B8CDE] bg-cosmic-glow/10 border border-cosmic-glow/20 rounded px-2 py-1.5"
                  >
                    {q}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate hypotheses button */}
          {llmAvailable && (
            <button
              onClick={handleGenerateHypotheses}
              disabled={isGenerating}
              className="mt-3 w-full px-3 py-2 bg-cosmic-glow/10 hover:bg-cosmic-glow/20 text-cosmic-glow rounded-lg text-xs font-mono uppercase tracking-wider font-medium transition-colors border border-cosmic-glow/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating
                ? 'GENERATING...'
                : hypotheses.length > 0
                  ? 'REGENERATE HYPOTHESES'
                  : 'GENERATE HYPOTHESES (AI)'}
            </button>
          )}

          {!llmAvailable && hypotheses.length === 0 && (
            <div className="mt-3 text-xs font-mono text-[#7B8CDE]/50 text-center py-2">
              Configure LLM settings to generate hypotheses
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GapPanel() {
  const {
    graphData,
    gapAnalysis,
    llmSettings,
    setGapAnalysis,
    setHighlightedPaperIds,
  } = useGraphStore();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!graphData) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await api.analyzeGaps(
        graphData.nodes,
        graphData.clusters,
        graphData.edges
      );
      setGapAnalysis(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to analyze gaps'
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [graphData, setGapAnalysis]);

  const handleHighlightGap = useCallback(
    (gap: StructuralGap) => {
      // Highlight papers from both clusters + bridge papers
      const ids = new Set<string>();
      gap.bridge_papers.forEach((bp) => ids.add(bp.paper_id));

      // Also highlight all papers in the two clusters
      if (graphData) {
        graphData.nodes.forEach((n) => {
          if (
            n.cluster_id === gap.cluster_a.id ||
            n.cluster_id === gap.cluster_b.id
          ) {
            ids.add(n.id);
          }
        });
      }

      setHighlightedPaperIds(ids);
    },
    [graphData, setHighlightedPaperIds]
  );

  if (!graphData) {
    return (
      <div className="p-4">
        <div className="text-xs font-mono font-medium uppercase tracking-widest text-cosmic-glow/60 mb-3">
          GAP ANALYSIS
        </div>
        <p className="text-sm font-mono text-[#7B8CDE]/50">
          Search to analyze research gaps
        </p>
      </div>
    );
  }

  const sortedGaps = gapAnalysis
    ? [...gapAnalysis.gaps].sort((a, b) => b.gap_strength - a.gap_strength)
    : [];

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base text-cosmic-glow/60">&#9638;</span>
        <span className="text-xs font-mono font-medium uppercase tracking-widest text-cosmic-glow/60">
          GAP ANALYSIS
        </span>
      </div>

      {/* Analyze button */}
      {!gapAnalysis && !isAnalyzing && (
        <button
          onClick={handleAnalyze}
          className="hud-button w-full px-4 py-2.5 uppercase font-mono tracking-wider text-sm mb-4"
        >
          ANALYZE GAPS
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm font-mono text-red-300">
          {error}
          <button
            onClick={handleAnalyze}
            className="block mt-2 text-xs text-red-400 hover:text-red-300 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {isAnalyzing && <GapSkeleton />}

      {/* Results */}
      {gapAnalysis && !isAnalyzing && (
        <>
          {/* Summary */}
          <div className="bg-[#0a0f1e] rounded-lg p-3 mb-4 text-xs font-mono text-[#7B8CDE]/80 border border-[#1a2555]">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-sm font-medium text-[#E8EAF6]/90">
                  {gapAnalysis.summary.total_gaps}
                </div>
                <div>Gaps Found</div>
              </div>
              <div>
                <div className="text-sm font-medium text-[#E8EAF6]/90">
                  {Math.round(gapAnalysis.summary.avg_gap_strength * 100)}%
                </div>
                <div>Avg Strength</div>
              </div>
            </div>
          </div>

          {/* Gap cards */}
          <div className="space-y-2">
            {sortedGaps.map((gap) => (
              <GapCard
                key={gap.gap_id}
                gap={gap}
                onHighlight={handleHighlightGap}
                llmAvailable={!!llmSettings}
              />
            ))}
          </div>

          {sortedGaps.length === 0 && (
            <div className="text-center py-8 text-sm font-mono text-[#7B8CDE]/50">
              No significant gaps detected between clusters
            </div>
          )}

          {/* Re-analyze button */}
          <button
            onClick={handleAnalyze}
            className="w-full px-4 py-2 bg-[#111833] hover:bg-[#1a2555] text-[#7B8CDE] rounded-lg text-xs font-mono uppercase tracking-wider font-medium transition-colors mt-4 border border-[#1a2555]"
          >
            RE-ANALYZE
          </button>
        </>
      )}
    </div>
  );
}
