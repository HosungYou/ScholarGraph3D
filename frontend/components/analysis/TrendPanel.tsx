'use client';

import { useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { api } from '@/lib/api';
import type { ClusterTrend } from '@/types';
import { TREND_COLORS } from '@/types';

// Simple sparkline bar chart for year distribution
function Sparkline({
  distribution,
  color,
}: {
  distribution: Record<number, number>;
  color: string;
}) {
  const years = Object.keys(distribution)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length === 0) return null;

  const values = years.map((y) => distribution[y]);
  const max = Math.max(...values, 1);

  return (
    <div className="flex items-end gap-px h-8 mt-1">
      {years.map((year) => {
        const height = Math.max(2, (distribution[year] / max) * 100);
        return (
          <div
            key={year}
            className="flex-1 min-w-[3px] max-w-[8px] rounded-t-sm transition-all duration-200"
            style={{
              height: `${height}%`,
              backgroundColor: color,
              opacity: 0.7,
            }}
            title={`${year}: ${distribution[year]} papers`}
          />
        );
      })}
    </div>
  );
}

// Skeleton loader
function TrendSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-[#0a0f1e] rounded-lg p-4 border border-[#1a2555]">
          <div className="h-4 bg-[#111833] rounded w-3/4 mb-2" />
          <div className="h-3 bg-[#111833] rounded w-1/2 mb-2" />
          <div className="h-8 bg-[#111833] rounded w-full" />
        </div>
      ))}
    </div>
  );
}

// Single trend card
function TrendCard({
  trend,
  onHighlight,
}: {
  trend: ClusterTrend;
  onHighlight: (paperIds: string[]) => void;
}) {
  const color = TREND_COLORS[trend.classification];
  const strengthPercent = Math.round(trend.trend_strength * 100);

  return (
    <button
      onClick={() => onHighlight(trend.representative_papers)}
      className="w-full text-left bg-[#0a0f1e] rounded-lg p-3 hover:bg-[#111833] transition-all duration-200 border border-[#1a2555] hover:border-cosmic-glow/20"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-mono font-medium text-[#E8EAF6] truncate flex-1 mr-2">
          {trend.cluster_label}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-mono font-medium flex-shrink-0"
          style={{
            backgroundColor: color + '20',
            color: color,
            border: `1px solid ${color}40`,
          }}
        >
          {trend.classification}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono text-[#7B8CDE]/80 mb-2">
        <span>{trend.paper_count} papers</span>
        <span>
          {trend.year_range[0]}-{trend.year_range[1]}
        </span>
      </div>

      {/* Trend strength bar */}
      <div className="mb-1">
        <div className="flex items-center justify-between text-xs font-mono text-[#7B8CDE]/50 mb-0.5">
          <span>Strength</span>
          <span>{strengthPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-[#111833] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${strengthPercent}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>

      {/* Year distribution sparkline */}
      <Sparkline distribution={trend.year_distribution} color={color} />
    </button>
  );
}

// Section for a trend classification
function TrendSection({
  title,
  trends,
  classification,
  onHighlight,
}: {
  title: string;
  trends: ClusterTrend[];
  classification: 'emerging' | 'stable' | 'declining';
  onHighlight: (paperIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const color = TREND_COLORS[classification];

  const titleColorClass =
    classification === 'emerging'
      ? 'text-green-400'
      : classification === 'stable'
        ? 'text-cosmic-glow'
        : 'text-[#7B8CDE]/50';

  if (trends.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full mb-2 group"
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className={`text-xs font-mono font-medium uppercase tracking-widest ${titleColorClass} group-hover:opacity-80 transition-opacity`}>
          {title}
        </span>
        <span className="text-xs font-mono text-[#7B8CDE]/50 ml-auto">
          {trends.length}
        </span>
        <span
          className={`text-[#7B8CDE]/50 text-xs transition-transform duration-200 ${
            expanded ? 'rotate-0' : '-rotate-90'
          }`}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {trends.map((trend) => (
            <TrendCard
              key={trend.cluster_id}
              trend={trend}
              onHighlight={onHighlight}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrendPanel() {
  const {
    graphData,
    trendAnalysis,
    setTrendAnalysis,
    setHighlightedPaperIds,
  } = useGraphStore();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!graphData) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await api.analyzeTrends(graphData.nodes, graphData.clusters);
      setTrendAnalysis(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to analyze trends'
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [graphData, setTrendAnalysis]);

  const handleHighlight = useCallback(
    (paperIds: string[]) => {
      setHighlightedPaperIds(new Set(paperIds));
    },
    [setHighlightedPaperIds]
  );

  if (!graphData) {
    return (
      <div className="p-4">
        <div className="text-xs font-mono font-medium uppercase tracking-widest text-cosmic-glow/60 mb-3">
          TREND ANALYSIS
        </div>
        <p className="text-sm font-mono text-[#7B8CDE]/50">
          Search to analyze research trends
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base text-cosmic-glow/60">~</span>
        <span className="text-xs font-mono font-medium uppercase tracking-widest text-cosmic-glow/60">
          TREND ANALYSIS
        </span>
      </div>

      {/* Analyze button */}
      {!trendAnalysis && !isAnalyzing && (
        <button
          onClick={handleAnalyze}
          className="hud-button w-full px-4 py-2.5 uppercase font-mono tracking-wider text-sm mb-4"
        >
          ANALYZE TRENDS
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
      {isAnalyzing && <TrendSkeleton />}

      {/* Results */}
      {trendAnalysis && !isAnalyzing && (
        <>
          {/* Summary */}
          <div className="bg-[#0a0f1e] rounded-lg p-3 mb-4 text-xs font-mono text-[#7B8CDE]/80 border border-[#1a2555]">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-medium text-[#E8EAF6]/90">
                  {trendAnalysis.summary.total_papers}
                </div>
                <div>Papers</div>
              </div>
              <div>
                <div className="text-sm font-medium text-[#E8EAF6]/90">
                  {trendAnalysis.summary.cluster_count}
                </div>
                <div>Clusters</div>
              </div>
              <div>
                <div className="text-sm font-medium text-[#E8EAF6]/90">
                  {trendAnalysis.summary.year_range[0]}-
                  {trendAnalysis.summary.year_range[1]}
                </div>
                <div>Years</div>
              </div>
            </div>
          </div>

          <TrendSection
            title="Emerging"
            classification="emerging"
            trends={trendAnalysis.emerging}
            onHighlight={handleHighlight}
          />
          <TrendSection
            title="Stable"
            classification="stable"
            trends={trendAnalysis.stable}
            onHighlight={handleHighlight}
          />
          <TrendSection
            title="Declining"
            classification="declining"
            trends={trendAnalysis.declining}
            onHighlight={handleHighlight}
          />

          {/* Re-analyze button */}
          <button
            onClick={handleAnalyze}
            className="w-full px-4 py-2 bg-[#111833] hover:bg-[#1a2555] text-[#7B8CDE] rounded-lg text-xs font-mono uppercase tracking-wider font-medium transition-colors mt-2 border border-[#1a2555]"
          >
            RE-ANALYZE
          </button>
        </>
      )}
    </div>
  );
}
