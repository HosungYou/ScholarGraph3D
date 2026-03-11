'use client';

import { useMemo, useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { Radar, Waypoints, Sparkles, ChevronDown, ChevronRight, FileText, Loader2, Copy, AlertTriangle } from 'lucide-react';
import type { StructuralGap, Paper, GapScoreBreakdown } from '@/types';
import { api } from '@/lib/api';

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
    setActiveGapReport,
    setGapReportLoading,
    gapReportLoading,
  } = useGraphStore();

  const frontierPapers = useMemo(() => {
    if (!graphData) return [];
    return frontierIds
      .map((id) => graphData.nodes.find((n) => n.id === id))
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [frontierIds, graphData]);

  const handleGenerateReport = useCallback(async (gap: StructuralGap) => {
    if (!graphData || gapReportLoading) return;

    setGapReportLoading(true);
    try {
      // Capture 3D graph snapshot if possible
      let snapshotDataUrl: string | undefined;
      try {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          snapshotDataUrl = canvas.toDataURL('image/png');
        }
      } catch {
        // Snapshot capture is best-effort
      }

      const graphContext = {
        papers: graphData.nodes.map(n => ({
          id: n.id,
          title: n.title,
          cluster_id: n.cluster_id,
          cluster_label: n.cluster_label,
          year: n.year,
          citation_count: n.citation_count,
        })),
        clusters: graphData.clusters.map(c => ({
          id: c.id,
          label: c.label,
          paper_count: c.paper_count,
        })),
        total_papers: graphData.nodes.length,
      };

      const report = await api.generateGapReport(gap, graphContext, snapshotDataUrl);
      setActiveGapReport(report);
    } catch (err) {
      console.error('Gap report generation failed:', err);
    } finally {
      setGapReportLoading(false);
    }
  }, [graphData, gapReportLoading, setActiveGapReport, setGapReportLoading]);

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
      </div>

      {/* Summary Dashboard */}
      <div className="mb-4 p-3 hud-panel-clean rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-bold text-[#D4AF37]">{gaps.length}</span>
            <span className="text-[10px] font-mono text-[#999999]/40 uppercase">gaps detected</span>
          </div>
          {gaps.length > 0 && (
            <button
              onClick={() => {
                const strongest = gaps[0];
                setHighlightedClusterPair([strongest.cluster_a.id, strongest.cluster_b.id]);
                setHoveredGapEdges(strongest.potential_edges);
              }}
              className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-[#D4AF37]/70 border border-[rgba(212,175,55,0.2)] rounded hover:bg-[rgba(212,175,55,0.1)] transition-colors"
            >
              Focus Strongest
            </button>
          )}
        </div>
        {gaps.length > 0 && (
          <p className="text-[9px] font-mono text-[#999999]/40">
            Strongest: <span className="text-[#D4AF37]/60">{gaps[0].cluster_a.label}</span>
            <span className="text-[#999999]/20"> ↔ </span>
            <span className="text-[#D4AF37]/60">{gaps[0].cluster_b.label}</span>
            <span className="text-[#999999]/30"> ({Math.round(gaps[0].gap_strength * 100)}%)</span>
          </p>
        )}
      </div>

      {/* Cluster quality warning */}
      {(() => {
        const sil = graphData?.meta?.cluster_silhouette as number | undefined;
        if (sil !== undefined && sil < 0.25) {
          const confidence = sil < 0.10 ? 'very low' : 'low';
          return (
            <div className="mb-3 px-3 py-2 rounded-lg border border-[rgba(231,76,60,0.2)] bg-[rgba(231,76,60,0.05)]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#E74C3C]/70 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-mono text-[#E74C3C]/80 leading-snug">
                    Cluster quality is {confidence} (silhouette={sil.toFixed(2)}).
                    Gap results may be unreliable.
                  </p>
                  <p className="text-[9px] font-mono text-[#999999]/40 mt-0.5 leading-snug">
                    Try a larger graph or different seed paper for more meaningful clusters.
                  </p>
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Copy All RQs button */}
      {gaps.length > 0 && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => {
              const allRQs = gaps.flatMap(g =>
                g.research_questions.map(q =>
                  typeof q === 'string' ? q : q.question
                )
              ).join('\n\n');
              navigator.clipboard.writeText(allRQs);
            }}
            className="flex items-center gap-1 px-2 py-1 text-[8px] font-mono uppercase tracking-wider text-[#999999]/40 hover:text-[#D4AF37] border border-[rgba(255,255,255,0.04)] rounded hover:border-[rgba(212,175,55,0.2)] transition-all"
          >
            <Copy className="w-3 h-3" />
            Copy All RQs
          </button>
        </div>
      )}

      {/* Gap cards grouped by severity */}
      {(() => {
        const critical = gaps.filter(g => g.gap_strength > 0.75);
        const notable = gaps.filter(g => g.gap_strength > 0.50 && g.gap_strength <= 0.75);
        const minor = gaps.filter(g => g.gap_strength <= 0.50);

        return (
          <div className="space-y-3 mb-4">
            {critical.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#D4AF37] uppercase tracking-wider">Critical</span>
                  <span className="text-[8px] font-mono text-[#D4AF37]/40">{critical.length}</span>
                </div>
                <div className="space-y-2">
                  {critical.map((gap) => (
                    <GapCard
                      key={gap.gap_id}
                      gap={gap}
                      graphData={graphData!}
                      selectPaper={selectPaper}
                      setPanelSelectionId={setPanelSelectionId}
                      onGenerateReport={() => handleGenerateReport(gap)}
                      isGenerating={gapReportLoading}
                      severity="critical"
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
              </div>
            )}
            {notable.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#999999]/60 uppercase tracking-wider">Notable</span>
                  <span className="text-[8px] font-mono text-[#999999]/30">{notable.length}</span>
                </div>
                <div className="space-y-2">
                  {notable.map((gap) => (
                    <GapCard
                      key={gap.gap_id}
                      gap={gap}
                      graphData={graphData!}
                      selectPaper={selectPaper}
                      setPanelSelectionId={setPanelSelectionId}
                      onGenerateReport={() => handleGenerateReport(gap)}
                      isGenerating={gapReportLoading}
                      severity="notable"
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
              </div>
            )}
            {minor.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#999999]/30 uppercase tracking-wider">Minor</span>
                  <span className="text-[8px] font-mono text-[#999999]/20">{minor.length}</span>
                </div>
                <div className="space-y-2">
                  {minor.map((gap) => (
                    <GapCard
                      key={gap.gap_id}
                      gap={gap}
                      graphData={graphData!}
                      selectPaper={selectPaper}
                      setPanelSelectionId={setPanelSelectionId}
                      onGenerateReport={() => handleGenerateReport(gap)}
                      isGenerating={gapReportLoading}
                      severity="minor"
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
              </div>
            )}
          </div>
        );
      })()}

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
  onGenerateReport: () => void;
  isGenerating: boolean;
  severity: 'critical' | 'notable' | 'minor';
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function GapCard({ gap, graphData, selectPaper, setPanelSelectionId, onGenerateReport, isGenerating, severity, onMouseEnter, onMouseLeave }: GapCardProps) {
  const [collapsed, setCollapsed] = useState(severity !== 'critical');
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
      className={`rounded-lg transition-all cursor-default ${
        severity === 'critical'
          ? 'hud-panel-clean border-l-2 border-l-[#D4AF37] hover:border-[rgba(212,175,55,0.2)]'
          : severity === 'notable'
          ? 'hud-panel-clean border-l-2 border-l-[#999999]/30 hover:border-[rgba(153,153,153,0.15)]'
          : 'hud-panel-clean hover:border-[rgba(255,255,255,0.06)]'
      }`}
    >
      <div className="p-3">
        {/* Cluster pair — clickable header for collapse */}
        <div
          className="flex items-center gap-1.5 mb-2 cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-[#999999]/30 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-[#999999]/30 flex-shrink-0" />
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
          <span className="hud-label text-[#999999]/30 flex-shrink-0 ml-auto">
            {gap.cluster_a.paper_count + gap.cluster_b.paper_count}p
          </span>
        </div>

        {/* Collapsed: show inline strength bar only */}
        {collapsed && (
          <div className="h-0.5 bg-[rgba(255,255,255,0.02)] rounded-full overflow-hidden -mt-1">
            <div
              className="h-full rounded-full"
              style={{
                width: `${strengthPct}%`,
                backgroundColor: strengthColor,
              }}
            />
          </div>
        )}

        {/* Expanded body */}
        {!collapsed && (<>

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

        {/* Actionability badge */}
        {gap.actionability && (
          <div className="mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase tracking-wider ${
              gap.actionability.recommendation === 'high_opportunity'
                ? 'bg-[rgba(46,204,113,0.1)] text-[#2ECC71] border border-[rgba(46,204,113,0.2)]'
                : gap.actionability.recommendation === 'needs_collaboration'
                ? 'bg-[rgba(230,126,34,0.1)] text-[#E67E22] border border-[rgba(230,126,34,0.2)]'
                : gap.actionability.recommendation === 'terminology_barrier'
                ? 'bg-[rgba(231,76,60,0.1)] text-[#E74C3C] border border-[rgba(231,76,60,0.2)]'
                : 'bg-[rgba(149,165,166,0.1)] text-[#95A5A6] border border-[rgba(149,165,166,0.2)]'
            }`}>
              {gap.actionability.recommendation === 'high_opportunity' ? 'HIGH OPPORTUNITY' :
               gap.actionability.recommendation === 'needs_collaboration' ? 'NEEDS COLLABORATION' :
               gap.actionability.recommendation === 'terminology_barrier' ? 'TERMINOLOGY BARRIER' :
               'INFRASTRUCTURE GAP'}
            </span>
          </div>
        )}

        {/* Score breakdown mini bars */}
        {gap.gap_score_breakdown && (
          <ScoreBreakdown breakdown={gap.gap_score_breakdown} />
        )}

        {/* Key papers preview */}
        {(gap.key_papers_a?.length || gap.key_papers_b?.length) ? (
          <div className="mb-1.5">
            <span className="hud-label mb-1 block">Key Papers</span>
            <div className="space-y-0.5">
              {[...(gap.key_papers_a || []).slice(0, 1), ...(gap.key_papers_b || []).slice(0, 1)].map((kp) => (
                <div key={kp.paper_id} className="text-[9px] font-mono text-[#999999]/50 leading-snug line-clamp-1 px-1.5">
                  {kp.title}
                </div>
              ))}
            </div>
          </div>
        ) : null}

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

        {/* First Research Question - shown directly */}
        {gap.research_questions.length > 0 && (
          <div className="mt-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="hud-label">Research Questions</span>
              <span className="text-[9px] font-mono text-[#999999]/25">{gap.research_questions.length}</span>
            </div>
            <div className="text-[10px] font-mono text-[#999999]/60 leading-snug pl-2 border-l border-[rgba(212,175,55,0.15)]">
              {typeof gap.research_questions[0] === 'string' ? gap.research_questions[0] : gap.research_questions[0].question}
            </div>
            {gap.research_questions.length > 1 && (
              <ResearchQuestions questions={gap.research_questions.slice(1)} />
            )}
          </div>
        )}

        {/* Generate Report button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerateReport();
          }}
          disabled={isGenerating}
          className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              GENERATING...
            </>
          ) : (
            <>
              <FileText className="w-3 h-3" />
              GENERATE REPORT
            </>
          )}
        </button>

        </>)}
      </div>
    </div>
  );
}

// ─── Score Breakdown Mini Bars ──────────────────────────────────────────────

function ScoreBreakdown({ breakdown }: { breakdown: GapScoreBreakdown }) {
  const dimensions: { key: keyof GapScoreBreakdown; label: string }[] = [
    { key: 'structural', label: 'STR' },
    { key: 'relatedness', label: 'REL' },
    { key: 'temporal', label: 'TMP' },
    { key: 'intent', label: 'INT' },
    { key: 'directional', label: 'DIR' },
    { key: 'structural_holes', label: 'SHL' },
    { key: 'influence', label: 'INF' },
    { key: 'author_silo', label: 'AUT' },
    { key: 'venue_diversity', label: 'VEN' },
  ];

  return (
    <div className="mb-2 space-y-0.5">
      {dimensions.map(({ key, label }) => {
        const val = breakdown[key] ?? 0;
        const pct = Math.round(val * 100);
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-[#999999]/30 w-6 text-right">{label}</span>
            <div className="flex-1 h-[3px] bg-[rgba(255,255,255,0.02)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: val > 0.7 ? '#D4AF37' : val > 0.4 ? '#666666' : '#333333',
                }}
              />
            </div>
            <span className="text-[8px] font-mono text-[#999999]/25 w-7">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Research Questions Accordion ────────────────────────────────────────────

function ResearchQuestions({ questions }: { questions: (string | { question: string; justification: string; methodology_hint: string })[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        <span className="text-[9px] font-mono text-[#999999]/30">+{questions.length} more</span>
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
              {typeof q === 'string' ? q : q.question}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
