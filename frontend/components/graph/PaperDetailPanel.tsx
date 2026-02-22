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
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Paper } from '@/types';
import { FIELD_COLORS } from '@/types';
import { useGraphStore } from '@/hooks/useGraphStore';

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
  const { graphData, conceptualEdges, expandedFromMap } = useGraphStore();

  // Compute relationship summary
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
    const conceptualCount = conceptualEdges.filter(
      (e) => e.source === paper.id || e.target === paper.id
    ).length;
    return { incomingCitations, outgoingCitations, similarEdges, isBridge, conceptualCount };
  }, [graphData, paper, conceptualEdges]);

  // Find expansion parent paper
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
    <div className="p-5 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 mr-3">
          <span className="text-[9px] font-mono uppercase tracking-widest text-[#00E5FF]/40 block mb-1">
            OBJECT SCAN
          </span>
          <h2 className="text-base font-semibold leading-snug text-text-primary">
            {paper.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#111833] transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4 text-[#7B8CDE] hover:text-[#00E5FF]" />
        </button>
      </div>

      <div className="mb-4" />

      {/* Authors */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-1.5 text-[#7B8CDE]">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium uppercase tracking-wide">
            Authors
          </span>
        </div>
        <div className="space-y-1">
          {paper.authors.slice(0, 5).map((author, i) => (
            <div key={i} className="text-sm text-text-primary">
              {author.name}
              {author.affiliations?.[0] && (
                <span className="text-xs text-[#7B8CDE] ml-1">
                  ({author.affiliations[0]})
                </span>
              )}
            </div>
          ))}
          {paper.authors.length > 5 && (
            <div className="text-xs text-[#7B8CDE]">
              +{paper.authors.length - 5} more authors
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-2 font-mono text-xs">
          <div className="flex items-center gap-1.5 text-[#7B8CDE] mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Year</span>
          </div>
          <div className="text-sm font-medium text-text-primary">{paper.year}</div>
        </div>
        <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-2 font-mono text-xs">
          <div className="flex items-center gap-1.5 text-[#7B8CDE] mb-1">
            <Hash className="w-3.5 h-3.5" />
            <span>Citations</span>
          </div>
          <div className="text-sm font-medium text-text-primary">
            {paper.citation_count.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Venue */}
      {paper.venue && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1 text-[#7B8CDE]">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Venue
            </span>
          </div>
          <div className="text-sm text-text-primary">{paper.venue}</div>
        </div>
      )}

      {/* Abstract */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-1.5 text-[#7B8CDE]">
          <span className="text-xs font-medium uppercase tracking-wide">
            {paper.abstract ? 'Abstract' : 'TLDR'}
          </span>
        </div>
        <p className="text-sm text-[#7B8CDE] leading-relaxed border-l border-[#1a2555]/50 pl-3">
          {displayAbstract}
        </p>
        {isLongAbstract && (
          <button
            onClick={() => setShowFullAbstract(!showFullAbstract)}
            className="flex items-center gap-1 mt-1 text-xs text-[#00E5FF] hover:text-[#00E5FF]/80 transition-colors"
          >
            {showFullAbstract ? (
              <>
                Show less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Fields */}
      {paper.fields.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-[#7B8CDE] mb-1.5">
            Fields of Study
          </div>
          <div className="flex flex-wrap gap-1.5">
            {paper.fields.map((field) => (
              <span
                key={field}
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor:
                    (FIELD_COLORS[field] || '#95A5A6') + '20',
                  color: FIELD_COLORS[field] || '#95A5A6',
                  border: `1px solid ${(FIELD_COLORS[field] || '#95A5A6') + '40'}`,
                }}
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Visual Badges — v1.1.0 */}
      {(citationPercentile > 0.9 || paper.is_bridge || paper.is_open_access) && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {citationPercentile > 0.9 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30">
              Top 10% Cited
            </span>
          )}
          {paper.is_bridge && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#a29bfe]/15 text-[#a29bfe] border border-[#a29bfe]/30">
              Bridge Node
            </span>
          )}
          {paper.is_open_access && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#2ECC71]/15 text-[#2ECC71] border border-[#2ECC71]/30">
              Open Access
            </span>
          )}
        </div>
      )}

      {/* Topics */}
      {paper.topics.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-[#7B8CDE] mb-1.5">
            Topics
          </div>
          <div className="flex flex-wrap gap-1.5">
            {paper.topics.slice(0, 8).map((topic) => (
              <span
                key={topic.id}
                className="px-2 py-0.5 rounded text-xs bg-[#0a0f1e] text-[#7B8CDE] border border-[#1a2555]/30"
              >
                {topic.display_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Relationship context */}
      {relationshipSummary && (
        <div className="border-t border-[#1a2555]/20 pt-3 mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7B8CDE]/60 mb-2 font-mono">
            Graph Relationships
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-2">
              <div className="text-[#7B8CDE]/60">Cited by (in graph)</div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.incomingCitations} papers
              </div>
            </div>
            <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-2">
              <div className="text-[#7B8CDE]/60">Cites (in graph)</div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.outgoingCitations} papers
              </div>
            </div>
            <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-2">
              <div className="text-[#7B8CDE]/60">Similar papers</div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.similarEdges} connected
              </div>
            </div>
            <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-2">
              <div className="flex items-center gap-1 text-[#7B8CDE]/60">
                <Cpu className="w-3 h-3" />
                <span>AI relationships</span>
              </div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.conceptualCount} analyzed
              </div>
            </div>
            {relationshipSummary.isBridge && (
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2">
                <div className="text-yellow-400/80 text-xs">◈ Bridge Node</div>
                <div className="text-yellow-300/70 text-xs">Connects clusters</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded from — v1.1.0 */}
      {parentPaper && (
        <div className="border-t border-[#1a2555]/20 pt-3 mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7B8CDE]/60 mb-1.5 font-mono">
            Expanded From
          </h4>
          <button
            onClick={() => {
              const store = useGraphStore.getState();
              store.selectPaper(parentPaper);
              window.dispatchEvent(new CustomEvent('focusPaper', { detail: { paperId: parentPaper.id } }));
            }}
            className="text-sm text-[#00E5FF] hover:text-[#00E5FF]/80 transition-colors text-left"
          >
            {parentPaper.title.length > 80 ? parentPaper.title.substring(0, 80) + '...' : parentPaper.title}
          </button>
          <div className="text-xs text-[#7B8CDE]/50 mt-0.5">
            {parentPaper.authors?.[0]?.name} {parentPaper.year}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-6">
        <button
          onClick={onExpand}
          disabled={isExpanding}
          className="hud-button flex items-center justify-center gap-2 w-full uppercase font-mono tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
        {paper.oa_url && (
          <a
            href={paper.oa_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent-green/10 hover:bg-accent-green/20 text-accent-green rounded-lg text-sm font-medium transition-colors border border-accent-green/20"
          >
            <ExternalLink className="w-4 h-4" />
            Open Access PDF
          </a>
        )}
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#0a0f1e] hover:bg-[#111833] text-[#7B8CDE] rounded-lg text-sm transition-colors border border-[#1a2555]/30"
          >
            <ExternalLink className="w-4 h-4" />
            DOI: {paper.doi}
          </a>
        )}
      </div>
    </div>
  );
}
