'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Users,
  Calendar,
  Hash,
  Network,
  Cpu,
  Loader2,
  RouteIcon,
  Download,
  Sparkles,
  ScanSearch,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import type { Paper } from '@/types';
import { FIELD_COLORS } from '@/types';
import { useGraphStore } from '@/hooks/useGraphStore';
import { findCitationPath } from '@/lib/utils';
import { toBibtex, toRIS, downloadFile } from '@/lib/export';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

interface PaperDetailPanelProps {
  paper: Paper;
  onClose: () => void;
  onExpand: () => void;
  isExpanding?: boolean;
}

export default function PaperDetailPanel({
  paper,
  onClose,
  onExpand,
  isExpanding = false,
}: PaperDetailPanelProps) {
  const [showFullAbstract, setShowFullAbstract] = useState(false);
  const [recommendationFeedback, setRecommendationFeedback] = useState<Record<string, 'relevant' | 'not_now'>>({});
  const {
    graphData,
    expandedFromMap,
    pathStart,
    pathEnd,
    activePath,
    setPathStart,
    setPathEnd,
    setActivePath,
    selectPaper,
  } = useGraphStore();

  const recommendationStorageKey = 'seed-paper-recommendation-feedback';

  const loadLocalRecommendationFeedback = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(recommendationStorageKey);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, 'relevant' | 'not_now'>;
    } catch {
      return {};
    }
  }, [recommendationStorageKey]);

  const persistLocalRecommendationFeedback = React.useCallback(
    (nextState: Record<string, 'relevant' | 'not_now'>) => {
      try {
        localStorage.setItem(recommendationStorageKey, JSON.stringify(nextState));
      } catch {
        // Best-effort browser-side preference storage.
      }
    },
    [recommendationStorageKey]
  );

  const relationshipSummary = React.useMemo(() => {
    if (!graphData || !paper) return null;
    const incomingCitations = graphData.edges.filter(
      (e) => e.type === 'citation' && e.target === paper.id
    ).length;
    const outgoingCitations = graphData.edges.filter(
      (e) => e.type === 'citation' && e.source === paper.id
    ).length;
    const similarEdges = graphData.edges.filter(
      (e) => e.type === 'similarity' && (e.source === paper.id || e.target === paper.id)
    ).length;
    const isBridge = paper.is_bridge;
    return { incomingCitations, outgoingCitations, similarEdges, isBridge, conceptualCount: 0 };
  }, [graphData, paper]);

  const parentPaper = React.useMemo(() => {
    if (!expandedFromMap || !paper) return null;
    const parentId = expandedFromMap.get(paper.id);
    if (!parentId || !graphData) return null;
    return graphData.nodes.find(n => n.id === parentId) || null;
  }, [expandedFromMap, paper, graphData]);

  const provenanceTrail = useMemo(() => {
    if (!graphData || !paper) return [];

    const trail: string[] = [];
    const seedPaperId = graphData.meta?.seed_paper_id;
    const seedPaper = seedPaperId
      ? graphData.nodes.find((node) => node.id === seedPaperId)
      : null;

    if (seedPaper && seedPaper.id !== paper.id) {
      trail.push(seedPaper.title);
    } else if (!seedPaper && paper.cluster_label) {
      trail.push(paper.cluster_label);
    }

    if (parentPaper && parentPaper.id !== paper.id && parentPaper.id !== seedPaper?.id) {
      trail.push(parentPaper.title);
    }

    trail.push(paper.title);
    return trail;
  }, [graphData, paper, parentPaper]);

  const citationPercentile = useMemo(() => {
    if (!graphData || !paper) return 0;
    const sorted = [...graphData.nodes].sort((a, b) => b.citation_count - a.citation_count);
    const rank = sorted.findIndex(p => p.id === paper.id);
    return rank >= 0 ? 1 - rank / sorted.length : 0;
  }, [graphData, paper]);

  const abstractText = paper.abstract || paper.tldr || 'No abstract available.';
  const isLongAbstract = abstractText.length > 300;
  const displayAbstract =
    isLongAbstract && !showFullAbstract
      ? abstractText.substring(0, 300) + '...'
      : abstractText;

  const { user } = useAuth();

  const inGraphCounts = useMemo(() => {
    if (!graphData) return { references: 0, citedBy: 0 };

    return {
      references: graphData.edges.filter(
        (e) => e.type === 'citation' && e.source === paper.id
      ).length,
      citedBy: graphData.edges.filter(
        (e) => e.type === 'citation' && e.target === paper.id
      ).length,
    };
  }, [graphData, paper.id]);

  const actionPreview = useMemo(() => {
    const cues: string[] = [];

    if (paper.frontier_score && paper.frontier_score >= 0.65) {
      cues.push('high frontier score');
    }
    if (paper.is_bridge) {
      cues.push('bridge across clusters');
    }
    if (inGraphCounts.references > 0 || inGraphCounts.citedBy > 0) {
      cues.push(`${inGraphCounts.references + inGraphCounts.citedBy} linked papers already in this workspace`);
    }

    return cues.slice(0, 2);
  }, [inGraphCounts.citedBy, inGraphCounts.references, paper.frontier_score, paper.is_bridge]);

  const recommendedPapers = useMemo(() => {
    if (!graphData) return [];

    return graphData.nodes
      .filter((candidate) => candidate.id !== paper.id)
      .map((candidate) => {
        const hasCitationLink = graphData.edges.some(
          (edge) =>
            edge.type === 'citation' &&
            ((edge.source === paper.id && edge.target === candidate.id) ||
              (edge.target === paper.id && edge.source === candidate.id))
        );
        const hasSimilarityLink = graphData.edges.some(
          (edge) =>
            edge.type === 'similarity' &&
            ((edge.source === paper.id && edge.target === candidate.id) ||
              (edge.target === paper.id && edge.source === candidate.id))
        );

        let score = 0;
        const reasons: string[] = [];

        if (candidate.cluster_id === paper.cluster_id) {
          score += 3;
          reasons.push('same cluster');
        }
        if (candidate.is_bridge) {
          score += 2.5;
          reasons.push('bridge');
        }
        if ((candidate.frontier_score || 0) >= 0.55) {
          score += 2;
          reasons.push('high frontier');
        }
        if (hasCitationLink) {
          score += 2;
          reasons.push('citation-linked');
        }
        if (hasSimilarityLink) {
          score += 1.5;
          reasons.push('semantically close');
        }
        score += Math.min(2, Math.log10((candidate.citation_count || 0) + 1) / 2);

        const feedback = recommendationFeedback[`${paper.id}:${candidate.id}`];
        if (feedback === 'relevant') {
          score += 1;
          reasons.unshift('you marked relevant');
        } else if (feedback === 'not_now') {
          score -= 2;
          reasons.unshift('hidden by your feedback');
        }

        return { paper: candidate, score, reasons: reasons.slice(0, 2) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [graphData, paper.cluster_id, paper.id, recommendationFeedback]);

  React.useEffect(() => {
    if (!paper?.id) {
      setRecommendationFeedback({});
      return;
    }

    let cancelled = false;

    if (!user) {
      setRecommendationFeedback(loadLocalRecommendationFeedback());
      return () => {
        cancelled = true;
      };
    }

    const localState = loadLocalRecommendationFeedback();
    const localEntriesForPaper = Object.entries(localState).filter(([key]) =>
      key.startsWith(`${paper.id}:`)
    );

    api.getRecommendationFeedback(paper.id)
      .then((items) => {
        if (cancelled) return;

        const serverState = items.reduce<Record<string, 'relevant' | 'not_now'>>((acc, item) => {
          acc[`${item.source_paper_id}:${item.candidate_paper_id}`] = item.feedback;
          return acc;
        }, {});

        const mergedState = { ...serverState };

        for (const [key, value] of localEntriesForPaper) {
          if (!mergedState[key]) {
            mergedState[key] = value;
            const candidateId = key.split(':').slice(1).join(':');
            void api.upsertRecommendationFeedback({
              source_paper_id: paper.id,
              candidate_paper_id: candidateId,
              feedback: value,
            }).catch(() => {
              // Keep local fallback if sync fails.
            });
          }
        }

        setRecommendationFeedback(mergedState);
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendationFeedback(localState);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadLocalRecommendationFeedback, paper?.id, user]);

  const recordRecommendationFeedback = async (candidateId: string, value: 'relevant' | 'not_now') => {
    const key = `${paper.id}:${candidateId}`;
    const nextValue = recommendationFeedback[key] === value ? undefined : value;
    const nextState = { ...recommendationFeedback };

    if (nextValue) {
      nextState[key] = nextValue;
    } else {
      delete nextState[key];
    }

    setRecommendationFeedback(nextState);

    if (!user) {
      persistLocalRecommendationFeedback(nextState);
      return;
    }

    try {
      if (nextValue) {
        await api.upsertRecommendationFeedback({
          source_paper_id: paper.id,
          candidate_paper_id: candidateId,
          feedback: nextValue,
        });
      } else {
        await api.deleteRecommendationFeedback(paper.id, candidateId);
      }
      persistLocalRecommendationFeedback(nextState);
    } catch (err) {
      setRecommendationFeedback(recommendationFeedback);
      console.error('Recommendation feedback sync failed:', err);
    }
  };

  return (
    <div className="p-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 mr-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="hud-label text-[#D4AF37]/50">SELECTED PAPER</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.1)] to-transparent" />
          </div>
          <h2 className="text-base font-semibold leading-snug text-text-primary">
            {paper.title}
          </h2>
          {provenanceTrail.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {provenanceTrail.map((step, index) => (
                <React.Fragment key={`${step}-${index}`}>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${
                    index === provenanceTrail.length - 1
                      ? 'border-[rgba(212,175,55,0.22)] bg-[rgba(212,175,55,0.08)] text-[#D4AF37]'
                      : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-[#999999]/70'
                  }`}>
                    {step.length > 38 ? `${step.slice(0, 38)}...` : step}
                  </span>
                  {index < provenanceTrail.length - 1 && (
                    <span className="text-[10px] font-mono text-[#999999]/25">→</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.03)] border border-transparent hover:border-[rgba(255,255,255,0.08)] transition-all"
          >
            <X className="w-4 h-4 text-[#999999] hover:text-[#D4AF37]" />
          </button>
        </div>
      </div>

      {/* Visual Badges */}
      {(citationPercentile > 0.9 || paper.is_bridge || paper.is_open_access) && (
        <div className="mt-3 mb-4 flex flex-wrap gap-1.5">
          {citationPercentile > 0.9 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/25">
              TOP 10% CITED
            </span>
          )}
          {paper.is_bridge && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/25">
              BRIDGE NODE
            </span>
          )}
          {paper.is_open_access && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#2ECC71]/10 text-[#2ECC71] border border-[#2ECC71]/25">
              OPEN ACCESS
            </span>
          )}
        </div>
      )}

      <div className="hud-divider my-4" />

      <div className="mb-4 rounded-xl border border-[rgba(212,175,55,0.14)] bg-[linear-gradient(180deg,rgba(212,175,55,0.08),rgba(255,255,255,0.02))] p-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span className="hud-label text-[#D4AF37]/80">Recommended Next Step</span>
        </div>
        <p className="text-xs text-text-primary leading-relaxed">
          Grow this area if you want to pull in the closest references and citing papers around the current workspace.
        </p>
        {actionPreview.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {actionPreview.map((cue) => (
              <span
                key={cue}
                className="rounded-full border border-[rgba(212,175,55,0.18)] bg-[rgba(212,175,55,0.07)] px-2 py-0.5 text-[10px] font-mono text-[#D4AF37]/85"
              >
                {cue}
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        data-testid="expand-preview"
        className="mb-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <Network className="w-3.5 h-3.5 text-[#00E5FF]/80" />
          <span className="hud-label text-[#00E5FF]/75">Expand Preview</span>
        </div>
        <p className="text-[11px] leading-relaxed text-[#999999]/72">
          Expanding searches both directions around this paper, merges only unseen papers into the workspace, and preserves your current layout context.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.015)] px-2.5 py-2">
            <div className="hud-label mb-1">Already Linked</div>
            <div className="text-sm text-text-primary">{inGraphCounts.references + inGraphCounts.citedBy}</div>
          </div>
          <div className="rounded-lg border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.015)] px-2.5 py-2">
            <div className="hud-label mb-1">Similarity Neighbors</div>
            <div className="text-sm text-text-primary">{relationshipSummary?.similarEdges || 0}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-2 py-0.5 text-[10px] font-mono text-[#E5E5E5]">
            {inGraphCounts.references} references already here
          </span>
          <span className="rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-2 py-0.5 text-[10px] font-mono text-[#E5E5E5]">
            {inGraphCounts.citedBy} citing papers already here
          </span>
          {paper.is_bridge && (
            <span className="rounded-full border border-[rgba(212,175,55,0.18)] bg-[rgba(212,175,55,0.07)] px-2 py-0.5 text-[10px] font-mono text-[#D4AF37]/85">
              likely bridge candidate
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <div className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <ScanSearch className="w-3.5 h-3.5 text-[#D4AF37]/80" />
            <span className="hud-label text-[#D4AF37]/70">Primary Research Actions</span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#999999]/70">
            Grow the local literature neighborhood first, then promote this paper into a co-anchor only if it deserves to reshape the whole workspace.
          </p>
        </div>
        <button
          onClick={onExpand}
          disabled={isExpanding}
          className="hud-button flex items-center justify-center gap-2 w-full py-2.5 rounded-lg uppercase text-xs tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isExpanding ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              EXPANDING...
            </>
          ) : (
            <>
              <Network className="w-4 h-4" />
              GROW THIS AREA
            </>
          )}
        </button>
        <div className="px-1 text-[10px] font-mono text-[#999999]/45">
          Adds references and citing papers around this paper.
        </div>

      </div>

      {/* ── Authors ── */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="w-3.5 h-3.5 text-[#999999]/60" />
          <span className="hud-label">Authors</span>
        </div>
        <div className="space-y-1">
          {paper.authors.slice(0, 5).map((author, i) => (
            <div key={i} className="text-sm text-text-primary">
              {author.id ? (
                <a
                  href={`https://www.semanticscholar.org/author/${author.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#D4AF37] transition-colors underline decoration-[rgba(255,255,255,0.1)] hover:decoration-[#D4AF37]/40"
                >
                  {author.name}
                </a>
              ) : (
                author.name
              )}
              {author.affiliations?.[0] && (
                <span className="text-[10px] text-[#999999]/60 ml-1.5">
                  ({author.affiliations[0]})
                </span>
              )}
            </div>
          ))}
          {paper.authors.length > 5 && (
            <div className="text-[10px] font-mono text-[#999999]/50">
              +{paper.authors.length - 5} more authors
            </div>
          )}
        </div>
      </div>

      {/* ── Meta Grid ── */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="hud-panel-clean rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3 h-3 text-[#999999]/50" />
            <span className="hud-label">Year</span>
          </div>
          <div className="hud-value">{paper.year}</div>
        </div>
        <div className="hud-panel-clean rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Hash className="w-3 h-3 text-[#999999]/50" />
            <span className="hud-label">Citations</span>
          </div>
          <div className="hud-value">{paper.citation_count.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Venue ── */}
      {paper.venue && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="w-3.5 h-3.5 text-[#999999]/50" />
            <span className="hud-label">Venue</span>
          </div>
          <div className="text-sm text-text-primary">{paper.venue}</div>
        </div>
      )}

      {/* ── Abstract ── */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="hud-label">
            {paper.abstract ? 'Abstract' : 'TLDR'}
          </span>
        </div>
        <p className="text-sm text-[#999999]/80 leading-relaxed border-l-2 border-[rgba(255,255,255,0.06)] pl-3">
          {displayAbstract}
        </p>
        {isLongAbstract && (
          <button
            onClick={() => setShowFullAbstract(!showFullAbstract)}
            className="flex items-center gap-1 mt-1.5 text-[10px] font-mono text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors uppercase tracking-wider"
          >
            {showFullAbstract ? (
              <>
                Collapse <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Expand <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Fields of Study ── */}
      {paper.fields.length > 0 && (
        <div className="mb-4">
          <span className="hud-label">Fields of Study</span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {paper.fields.map((field) => (
              <span
                key={field}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium"
                style={{
                  backgroundColor: (FIELD_COLORS[field] || '#95A5A6') + '15',
                  color: FIELD_COLORS[field] || '#95A5A6',
                  border: `1px solid ${(FIELD_COLORS[field] || '#95A5A6') + '30'}`,
                }}
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Topics ── */}
      {paper.topics.length > 0 && (
        <div className="mb-4">
          <span className="hud-label">Topics</span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {paper.topics.slice(0, 8).map((topic) => (
              <span
                key={topic.id}
                className="px-2 py-0.5 rounded text-[10px] font-mono text-[#999999]/70 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]"
              >
                {topic.display_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Graph Relationships ── */}
      {relationshipSummary && (
        <>
          <div className="hud-divider my-4" />
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="hud-label text-[#D4AF37]/50">In This Workspace</span>
              <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.08)] to-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="hud-panel-clean rounded-lg p-2.5">
                <div className="hud-label mb-0.5">Cited by</div>
                <div className="hud-value text-sm">{relationshipSummary.incomingCitations}</div>
              </div>
              <div className="hud-panel-clean rounded-lg p-2.5">
                <div className="hud-label mb-0.5">Cites</div>
                <div className="hud-value text-sm">{relationshipSummary.outgoingCitations}</div>
              </div>
              <div className="hud-panel-clean rounded-lg p-2.5">
                <div className="hud-label mb-0.5">Similar</div>
                <div className="hud-value text-sm">{relationshipSummary.similarEdges}</div>
              </div>
              <div className="hud-panel-clean rounded-lg p-2.5">
                <div className="flex items-center gap-1 mb-0.5">
                  <Cpu className="w-2.5 h-2.5 text-[#999999]/40" />
                  <span className="hud-label">AI</span>
                </div>
                <div className="hud-value text-sm">{relationshipSummary.conceptualCount}</div>
              </div>
              {relationshipSummary.isBridge && (
                <div className="col-span-2 rounded-lg p-2.5 bg-[#D4AF37]/05 border border-[#D4AF37]/15">
                  <div className="text-[#D4AF37]/80 text-[10px] font-mono uppercase tracking-wider">Bridge Node</div>
                  <div className="text-[#D4AF37]/50 text-[10px] font-mono mt-0.5">Connects distinct clusters</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── In-Graph Connections ── */}
      {graphData && (
        <InGraphConnections paper={paper} graphData={graphData} />
      )}

      {recommendedPapers.length > 0 && (
        <>
          <div className="hud-divider my-4" />
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="hud-label text-[#D4AF37]/50">Suggested Next Papers</span>
              <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.08)] to-transparent" />
            </div>
            <p className="mb-2 text-[10px] font-mono text-[#999999]/35 leading-relaxed">
              Ranked from the current workspace. Mark strong fits to bias the next suggestions in this browser.
            </p>
            <div className="space-y-2">
              {recommendedPapers.map(({ paper: candidate, reasons }) => (
                <div
                  key={candidate.id}
                  className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-3 transition-all hover:border-[rgba(212,175,55,0.18)] hover:bg-[rgba(212,175,55,0.05)]"
                >
                  <button
                    onClick={() => {
                      selectPaper(candidate);
                      window.dispatchEvent(new CustomEvent('focusPaper', { detail: { paperId: candidate.id } }));
                    }}
                    className="w-full text-left"
                  >
                    <div className="line-clamp-2 text-sm text-text-primary">
                      {candidate.title}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-[#999999]/45">
                      {candidate.year} · {(candidate.citation_count || 0).toLocaleString()} citations
                    </div>
                  </button>
                  {reasons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {reasons.map((reason) => (
                        <span
                          key={`${candidate.id}-${reason}`}
                          className="rounded-full border border-[rgba(212,175,55,0.16)] bg-[rgba(212,175,55,0.07)] px-2 py-0.5 text-[10px] font-mono text-[#D4AF37]/85"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => recordRecommendationFeedback(candidate.id, 'relevant')}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-mono transition-colors ${
                        recommendationFeedback[`${paper.id}:${candidate.id}`] === 'relevant'
                          ? 'border border-[#2ECC71]/35 bg-[#2ECC71]/10 text-[#2ECC71]'
                          : 'border border-[rgba(255,255,255,0.05)] text-[#999999]/55 hover:border-[#2ECC71]/25 hover:text-[#2ECC71]'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      Relevant
                    </button>
                    <button
                      onClick={() => recordRecommendationFeedback(candidate.id, 'not_now')}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-mono transition-colors ${
                        recommendationFeedback[`${paper.id}:${candidate.id}`] === 'not_now'
                          ? 'border border-[#999999]/20 bg-[rgba(255,255,255,0.05)] text-[#999999]'
                          : 'border border-[rgba(255,255,255,0.05)] text-[#999999]/55 hover:border-[rgba(255,255,255,0.12)] hover:text-[#999999]'
                      }`}
                    >
                      <ThumbsDown className="w-3 h-3" />
                      Not now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Expanded From ── */}
      {parentPaper && (
        <>
          <div className="hud-divider my-4" />
          <div>
            <span className="hud-label text-[#999999]/50">Expanded From</span>
            <button
              onClick={() => {
                const store = useGraphStore.getState();
                store.selectPaper(parentPaper);
                window.dispatchEvent(new CustomEvent('focusPaper', { detail: { paperId: parentPaper.id } }));
              }}
              className="block mt-1.5 text-sm text-[#D4AF37]/80 hover:text-[#D4AF37] transition-colors text-left leading-snug"
            >
              {parentPaper.title.length > 80 ? parentPaper.title.substring(0, 80) + '...' : parentPaper.title}
            </button>
            <div className="text-[10px] text-[#999999]/40 mt-0.5 font-mono">
              {parentPaper.authors?.[0]?.name} {parentPaper.year}
            </div>
          </div>
        </>
      )}

      {/* ── External Actions ── */}
      <div className="hud-divider my-4" />
      <div className="flex flex-col gap-2">
        {/* External links */}
        {paper.oa_url && (
          <a
            href={paper.oa_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#2ECC71]/08 hover:bg-[#2ECC71]/15 text-[#2ECC71] rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all border border-[#2ECC71]/15 hover:border-[#2ECC71]/25"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Access PDF
          </a>
        )}
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-[10px] font-mono text-[#999999] transition-all border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.02)]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            DOI: {paper.doi}
          </a>
        )}

        {/* Export buttons */}
        <details className="group rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)] p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <RouteIcon className="w-3.5 h-3.5 text-[#999999]/60" />
            <span className="hud-label text-[#999999]/75">Advanced Tools</span>
            <div className="flex-1" />
            <ChevronDown className="w-3.5 h-3.5 text-[#999999]/40 transition-transform group-open:rotate-180" />
          </summary>

          <div className="mt-3 flex flex-col gap-2">
            <div className="hud-panel-clean rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <RouteIcon className="w-3 h-3 text-[#999999]/50" />
                <span className="hud-label">Citation Path Finder</span>
              </div>
              <p className="text-[9px] font-mono text-[#999999]/35 mb-2 leading-relaxed">
                Trace the citation path between two selected papers.
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    if (pathStart === paper.id) {
                      setPathStart(null);
                    } else {
                      setPathStart(paper.id);
                      setActivePath(null);
                    }
                  }}
                  className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all border ${
                    pathStart === paper.id
                      ? 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30 shadow-[0_0_8px_rgba(212,175,55,0.12)]'
                      : 'bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.03)] text-[#999999] border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)]'
                  }`}
                >
                  {pathStart === paper.id ? 'PATH START SET' : 'SET AS PATH START'}
                </button>
                <button
                  onClick={() => {
                    if (pathEnd === paper.id) {
                      setPathEnd(null);
                    } else {
                      setPathEnd(paper.id);
                      setActivePath(null);
                    }
                  }}
                  className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all border ${
                    pathEnd === paper.id
                      ? 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30 shadow-[0_0_8px_rgba(212,175,55,0.1)]'
                      : 'bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.03)] text-[#999999] border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)]'
                  }`}
                >
                  {pathEnd === paper.id ? 'PATH END SET' : 'SET AS PATH END'}
                </button>
                {pathStart && pathEnd && pathStart !== paper.id && pathEnd !== paper.id && (
                  <div className="text-[10px] text-[#999999]/40 text-center font-mono py-1">
                    Start + End selected. Open either paper to find the path.
                  </div>
                )}
                {pathStart && pathEnd && (pathStart === paper.id || pathEnd === paper.id) && pathStart !== pathEnd && (
                  <button
                    onClick={() => {
                      if (!graphData) return;
                      const path = findCitationPath(pathStart!, pathEnd!, graphData.edges);
                      setActivePath(path);
                    }}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/18 text-[#D4AF37] rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all border border-[#D4AF37]/20 hover:shadow-[0_0_12px_rgba(212,175,55,0.08)]"
                  >
                    <RouteIcon className="w-3 h-3" />
                    FIND PATH
                  </button>
                )}
                {activePath && (
                  <div className="mt-1">
                    {activePath.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono text-[#D4AF37]">
                            Path: {activePath.length} nodes
                          </span>
                          <button
                            onClick={() => { setActivePath(null); setPathStart(null); setPathEnd(null); }}
                            className="text-[9px] font-mono text-[#999999]/40 hover:text-[#999999] transition-colors"
                          >
                            clear
                          </button>
                        </div>
                        <div className="space-y-0.5">
                          {activePath.map((nodeId, idx) => {
                            const pathPaper = graphData?.nodes.find(n => n.id === nodeId);
                            const nextPaper = idx < activePath.length - 1
                              ? graphData?.nodes.find(n => n.id === activePath[idx + 1])
                              : null;
                            const yearGap = pathPaper?.year && nextPaper?.year
                              ? Math.abs(nextPaper.year - pathPaper.year)
                              : null;
                            return (
                              <div key={nodeId}>
                                <button
                                  onClick={() => {
                                    if (pathPaper) {
                                      const store = useGraphStore.getState();
                                      store.selectPaper(pathPaper);
                                    }
                                  }}
                                  className="w-full text-left px-2 py-1 rounded hover:bg-[rgba(212,175,55,0.06)] transition-colors group"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                      idx === 0 ? 'bg-[#2ECC71]' : idx === activePath.length - 1 ? 'bg-[#E74C3C]' : 'bg-[#D4AF37]'
                                    }`} />
                                    <span className="text-[10px] font-mono text-[#999999]/70 line-clamp-1 group-hover:text-[#D4AF37] transition-colors">
                                      {pathPaper?.title || nodeId}
                                    </span>
                                  </div>
                                  {pathPaper && (
                                    <div className="text-[9px] font-mono text-[#999999]/30 ml-3 mt-0.5">
                                      {pathPaper.year} · {(pathPaper.citation_count || 0).toLocaleString()} cit.
                                    </div>
                                  )}
                                </button>
                                {yearGap != null && idx < activePath.length - 1 && (
                                  <div className="text-[8px] font-mono text-[#999999]/20 text-center py-0.5">
                                    ↓ {yearGap} yr gap
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-center py-1">
                        <span className="text-red-400">No path found</span>
                        <button
                          onClick={() => { setActivePath(null); setPathStart(null); setPathEnd(null); }}
                          className="ml-2 text-[#999999]/40 hover:text-[#999999] transition-colors"
                        >
                          clear
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => downloadFile(toBibtex(paper), `${paper.id}.bib`, 'text/plain')}
                className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-lg text-[10px] font-mono uppercase tracking-wider text-[#999999] transition-all border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.02)]"
              >
                <Download className="w-3 h-3" />
                BibTeX
              </button>
              <button
                onClick={() => downloadFile(toRIS(paper), `${paper.id}.ris`, 'text/plain')}
                className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-lg text-[10px] font-mono uppercase tracking-wider text-[#999999] transition-all border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.02)]"
              >
                <Download className="w-3 h-3" />
                RIS
              </button>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function InGraphConnections({ paper, graphData }: { paper: Paper; graphData: NonNullable<ReturnType<typeof useGraphStore.getState>['graphData']> }) {
  const [showRefs, setShowRefs] = useState(false);
  const [showCitedBy, setShowCitedBy] = useState(false);

  const references = useMemo(() => {
    return graphData.edges
      .filter(e => e.type === 'citation' && e.source === paper.id)
      .map(e => graphData.nodes.find(n => n.id === e.target))
      .filter((n): n is Paper => n != null);
  }, [graphData, paper.id]);

  const citedBy = useMemo(() => {
    return graphData.edges
      .filter(e => e.type === 'citation' && e.target === paper.id)
      .map(e => graphData.nodes.find(n => n.id === e.source))
      .filter((n): n is Paper => n != null);
  }, [graphData, paper.id]);

  if (references.length === 0 && citedBy.length === 0) return null;

  return (
    <>
      <div className="hud-divider my-4" />
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="hud-label text-[#D4AF37]/50">In-Graph Connections</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.08)] to-transparent" />
        </div>

        {references.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setShowRefs(!showRefs)}
              className="flex items-center gap-1.5 w-full text-left mb-1"
            >
              <span className="hud-label">References in Graph</span>
              <span className="text-[9px] font-mono text-[#999999]/30">{references.length}</span>
              <div className="flex-1" />
              <ChevronDown className={`w-3 h-3 text-[#999999]/30 transition-transform ${showRefs ? 'rotate-180' : ''}`} />
            </button>
            {showRefs && (
              <div className="space-y-0.5 ml-1">
                {references.map(ref => (
                  <button
                    key={ref.id}
                    onClick={() => useGraphStore.getState().selectPaper(ref)}
                    className="w-full text-left px-2 py-1 rounded hover:bg-[rgba(255,255,255,0.02)] transition-colors group"
                  >
                    <div className="text-[10px] font-mono text-[#999999]/60 line-clamp-1 group-hover:text-[#D4AF37] transition-colors">
                      {ref.title}
                    </div>
                    <div className="text-[9px] font-mono text-[#999999]/25 mt-0.5">
                      {ref.year} · {(ref.citation_count || 0).toLocaleString()} cit.
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {citedBy.length > 0 && (
          <div>
            <button
              onClick={() => setShowCitedBy(!showCitedBy)}
              className="flex items-center gap-1.5 w-full text-left mb-1"
            >
              <span className="hud-label">Cited by in Graph</span>
              <span className="text-[9px] font-mono text-[#999999]/30">{citedBy.length}</span>
              <div className="flex-1" />
              <ChevronDown className={`w-3 h-3 text-[#999999]/30 transition-transform ${showCitedBy ? 'rotate-180' : ''}`} />
            </button>
            {showCitedBy && (
              <div className="space-y-0.5 ml-1">
                {citedBy.map(citer => (
                  <button
                    key={citer.id}
                    onClick={() => useGraphStore.getState().selectPaper(citer)}
                    className="w-full text-left px-2 py-1 rounded hover:bg-[rgba(255,255,255,0.02)] transition-colors group"
                  >
                    <div className="text-[10px] font-mono text-[#999999]/60 line-clamp-1 group-hover:text-[#D4AF37] transition-colors">
                      {citer.title}
                    </div>
                    <div className="text-[9px] font-mono text-[#999999]/25 mt-0.5">
                      {citer.year} · {(citer.citation_count || 0).toLocaleString()} cit.
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
