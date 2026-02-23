'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Paper } from '@/types';
import { FIELD_COLORS } from '@/types';
import { useGraphStore } from '@/hooks/useGraphStore';
import { findCitationPath } from '@/lib/utils';
import { toBibtex, toRIS, downloadFile } from '@/lib/export';

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
  const {
    graphData,
    expandedFromMap,
    pathStart,
    pathEnd,
    activePath,
    setPathStart,
    setPathEnd,
    setActivePath,
  } = useGraphStore();

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

  const citationPercentile = React.useMemo(() => {
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

  return (
    <div className="p-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 mr-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="hud-label text-[#00E5FF]/50">OBJECT SCAN</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[rgba(0,229,255,0.2)] to-transparent" />
          </div>
          <h2 className="text-base font-semibold leading-snug text-text-primary">
            {paper.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[rgba(0,229,255,0.06)] border border-transparent hover:border-[rgba(0,229,255,0.15)] transition-all flex-shrink-0"
        >
          <X className="w-4 h-4 text-[#7B8CDE] hover:text-[#00E5FF]" />
        </button>
      </div>

      {/* Visual Badges */}
      {(citationPercentile > 0.9 || paper.is_bridge || paper.is_open_access) && (
        <div className="mt-3 mb-4 flex flex-wrap gap-1.5">
          {citationPercentile > 0.9 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/25">
              TOP 10% CITED
            </span>
          )}
          {paper.is_bridge && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#a29bfe]/10 text-[#a29bfe] border border-[#a29bfe]/25">
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

      {/* ── Authors ── */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="w-3.5 h-3.5 text-[#7B8CDE]/60" />
          <span className="hud-label">Authors</span>
        </div>
        <div className="space-y-1">
          {paper.authors.slice(0, 5).map((author, i) => (
            <div key={i} className="text-sm text-text-primary">
              {author.name}
              {author.affiliations?.[0] && (
                <span className="text-[10px] text-[#7B8CDE]/60 ml-1.5">
                  ({author.affiliations[0]})
                </span>
              )}
            </div>
          ))}
          {paper.authors.length > 5 && (
            <div className="text-[10px] font-mono text-[#7B8CDE]/50">
              +{paper.authors.length - 5} more authors
            </div>
          )}
        </div>
      </div>

      {/* ── Meta Grid ── */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="hud-panel-clean rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3 h-3 text-[#7B8CDE]/50" />
            <span className="hud-label">Year</span>
          </div>
          <div className="hud-value">{paper.year}</div>
        </div>
        <div className="hud-panel-clean rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Hash className="w-3 h-3 text-[#7B8CDE]/50" />
            <span className="hud-label">Citations</span>
          </div>
          <div className="hud-value">{paper.citation_count.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Venue ── */}
      {paper.venue && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="w-3.5 h-3.5 text-[#7B8CDE]/50" />
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
        <p className="text-sm text-[#7B8CDE]/80 leading-relaxed border-l-2 border-[rgba(0,229,255,0.1)] pl-3">
          {displayAbstract}
        </p>
        {isLongAbstract && (
          <button
            onClick={() => setShowFullAbstract(!showFullAbstract)}
            className="flex items-center gap-1 mt-1.5 text-[10px] font-mono text-[#00E5FF]/70 hover:text-[#00E5FF] transition-colors uppercase tracking-wider"
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
                className="px-2 py-0.5 rounded text-[10px] font-mono text-[#7B8CDE]/70 bg-[rgba(0,229,255,0.03)] border border-[rgba(0,229,255,0.08)]"
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
              <span className="hud-label text-[#00E5FF]/50">Graph Relationships</span>
              <div className="flex-1 h-px bg-gradient-to-r from-[rgba(0,229,255,0.15)] to-transparent" />
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
                  <Cpu className="w-2.5 h-2.5 text-[#7B8CDE]/40" />
                  <span className="hud-label">AI</span>
                </div>
                <div className="hud-value text-sm">{relationshipSummary.conceptualCount}</div>
              </div>
              {relationshipSummary.isBridge && (
                <div className="col-span-2 rounded-lg p-2.5 bg-[#FFD700]/05 border border-[#FFD700]/15">
                  <div className="text-[#FFD700]/80 text-[10px] font-mono uppercase tracking-wider">Bridge Node</div>
                  <div className="text-[#FFD700]/50 text-[10px] font-mono mt-0.5">Connects distinct clusters</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Expanded From ── */}
      {parentPaper && (
        <>
          <div className="hud-divider my-4" />
          <div>
            <span className="hud-label text-[#7B8CDE]/50">Expanded From</span>
            <button
              onClick={() => {
                const store = useGraphStore.getState();
                store.selectPaper(parentPaper);
                window.dispatchEvent(new CustomEvent('focusPaper', { detail: { paperId: parentPaper.id } }));
              }}
              className="block mt-1.5 text-sm text-[#00E5FF]/80 hover:text-[#00E5FF] transition-colors text-left leading-snug"
            >
              {parentPaper.title.length > 80 ? parentPaper.title.substring(0, 80) + '...' : parentPaper.title}
            </button>
            <div className="text-[10px] text-[#7B8CDE]/40 mt-0.5 font-mono">
              {parentPaper.authors?.[0]?.name} {parentPaper.year}
            </div>
          </div>
        </>
      )}

      {/* ── Actions ── */}
      <div className="hud-divider my-4" />
      <div className="flex flex-col gap-2">
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
              EXPAND NETWORK
            </>
          )}
        </button>

        {/* Citation Path Finder */}
        <div className="hud-panel-clean rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <RouteIcon className="w-3 h-3 text-[#7B8CDE]/50" />
            <span className="hud-label">Citation Path Finder</span>
          </div>
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
                  ? 'bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/30 shadow-[0_0_8px_rgba(0,229,255,0.1)]'
                  : 'bg-[rgba(0,229,255,0.03)] hover:bg-[rgba(0,229,255,0.06)] text-[#7B8CDE] border-[rgba(0,229,255,0.08)] hover:border-[rgba(0,229,255,0.15)]'
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
                  ? 'bg-[#FFD700]/15 text-[#FFD700] border-[#FFD700]/30 shadow-[0_0_8px_rgba(255,215,0,0.1)]'
                  : 'bg-[rgba(0,229,255,0.03)] hover:bg-[rgba(0,229,255,0.06)] text-[#7B8CDE] border-[rgba(0,229,255,0.08)] hover:border-[rgba(0,229,255,0.15)]'
              }`}
            >
              {pathEnd === paper.id ? 'PATH END SET' : 'SET AS PATH END'}
            </button>
            {pathStart && pathEnd && pathStart !== paper.id && pathEnd !== paper.id && (
              <div className="text-[10px] text-[#7B8CDE]/40 text-center font-mono py-1">
                Start + End selected — open either paper to find path
              </div>
            )}
            {pathStart && pathEnd && (pathStart === paper.id || pathEnd === paper.id) && pathStart !== pathEnd && (
              <button
                onClick={() => {
                  if (!graphData) return;
                  const path = findCitationPath(pathStart!, pathEnd!, graphData.edges);
                  setActivePath(path);
                }}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-[#FFD700]/10 hover:bg-[#FFD700]/18 text-[#FFD700] rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all border border-[#FFD700]/20 hover:shadow-[0_0_12px_rgba(255,215,0,0.08)]"
              >
                <RouteIcon className="w-3 h-3" />
                FIND PATH
              </button>
            )}
            {activePath && (
              <div className="text-[10px] font-mono text-center py-1">
                {activePath.length > 0 ? (
                  <span className="text-[#FFD700]">Path: {activePath.length} nodes</span>
                ) : (
                  <span className="text-red-400">No path found</span>
                )}
                <button
                  onClick={() => { setActivePath(null); setPathStart(null); setPathEnd(null); }}
                  className="ml-2 text-[#7B8CDE]/40 hover:text-[#7B8CDE] transition-colors"
                >
                  clear
                </button>
              </div>
            )}
          </div>
        </div>

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
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-[10px] font-mono text-[#7B8CDE] transition-all border border-[rgba(0,229,255,0.08)] hover:border-[rgba(0,229,255,0.15)] hover:bg-[rgba(0,229,255,0.03)]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            DOI: {paper.doi}
          </a>
        )}

        {/* Export buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => downloadFile(toBibtex(paper), `${paper.id}.bib`, 'text/plain')}
            className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-lg text-[10px] font-mono uppercase tracking-wider text-[#7B8CDE] transition-all border border-[rgba(0,229,255,0.08)] hover:border-[rgba(0,229,255,0.15)] hover:bg-[rgba(0,229,255,0.03)]"
          >
            <Download className="w-3 h-3" />
            BibTeX
          </button>
          <button
            onClick={() => downloadFile(toRIS(paper), `${paper.id}.ris`, 'text/plain')}
            className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-lg text-[10px] font-mono uppercase tracking-wider text-[#7B8CDE] transition-all border border-[rgba(0,229,255,0.08)] hover:border-[rgba(0,229,255,0.15)] hover:bg-[rgba(0,229,255,0.03)]"
          >
            <Download className="w-3 h-3" />
            RIS
          </button>
        </div>
      </div>
    </div>
  );
}
