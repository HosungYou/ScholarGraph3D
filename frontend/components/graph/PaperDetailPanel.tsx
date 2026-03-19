'use client';

import React, { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import type { Paper } from '@/types';
import { FIELD_COLORS } from '@/types';
import { useGraphStore } from '@/hooks/useGraphStore';
import { findCitationPath } from '@/lib/utils';

interface PaperDetailPanelProps {
  paper: Paper;
  onClose: () => void;
  onExpand: (direction?: 'refs' | 'cites') => void;
  isExpanding?: boolean;
}

export default function PaperDetailPanel({
  paper,
  onClose,
  onExpand,
  isExpanding = false,
}: PaperDetailPanelProps) {
  const [showFullAbstract, setShowFullAbstract] = useState(false);
  const [citationPath, setCitationPath] = useState<string[] | null | 'not-found'>(null);

  const graphData = useGraphStore((s) => s.graphData);
  const nodeCount = graphData?.nodes.length ?? 0;
  const seedId = graphData?.meta?.seed_paper_id as string | undefined;

  function handleFindPath() {
    if (!graphData || !seedId) return;
    const path = findCitationPath(seedId, paper.id, graphData.edges);
    setCitationPath(path ?? 'not-found');
  }

  const abstractText = paper.abstract || paper.tldr || 'No abstract available.';
  const isLongAbstract = abstractText.length > 300;
  const displayAbstract =
    isLongAbstract && !showFullAbstract
      ? abstractText.substring(0, 300) + '...'
      : abstractText;

  const authorsDisplay = paper.authors.slice(0, 3);
  const extraAuthors = paper.authors.length - 3;

  return (
    <div className="p-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-3">
        <h2 className="flex-1 mr-3 text-base font-semibold leading-snug text-text-primary">
          {paper.title}
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.03)] border border-transparent hover:border-[rgba(255,255,255,0.08)] transition-all flex-shrink-0"
        >
          <X className="w-4 h-4 text-[#999999] hover:text-[#D4AF37]" />
        </button>
      </div>

      {/* ── Authors ── */}
      <div className="text-sm text-[#999999]/80 mb-2">
        {authorsDisplay.map((a) => a.name).join(', ')}
        {extraAuthors > 0 && ` et al.`}
      </div>

      {/* ── Year / Venue / Citations (one line) ── */}
      <div className="flex items-center gap-2 text-xs font-mono text-[#999999]/60 mb-4">
        <span>{paper.year}</span>
        {paper.venue && (
          <>
            <span className="text-[#999999]/25">|</span>
            <span className="truncate max-w-[160px]">{paper.venue}</span>
          </>
        )}
        <span className="text-[#999999]/25">|</span>
        <span>{paper.citation_count.toLocaleString()} citations</span>
      </div>

      {/* ── Abstract / TLDR (collapsed by default) ── */}
      <details className="mb-4 group">
        <summary className="flex items-center gap-1.5 cursor-pointer list-none text-[10px] font-mono text-[#999999]/60 uppercase tracking-wider hover:text-[#999999] transition-colors">
          {paper.abstract ? 'Abstract' : 'TLDR'}
          <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2">
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
                  Read more <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>
      </details>

      {/* ── Fields of Study ── */}
      {paper.fields.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1.5">
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

      <div className="hud-divider my-4" />

      {/* ── EXPAND — directional buttons ── */}
      <div className="flex gap-2">
        <button
          onClick={() => onExpand('refs')}
          disabled={isExpanding}
          className="hud-button flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg uppercase text-[10px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isExpanding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <span>&larr;</span>
              <span>REFS ({paper.reference_count ?? '?'})</span>
            </>
          )}
        </button>
        <button
          onClick={() => onExpand('cites')}
          disabled={isExpanding}
          className="hud-button flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg uppercase text-[10px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isExpanding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <span>CITES ({paper.citation_count ?? '?'})</span>
              <span>&rarr;</span>
            </>
          )}
        </button>
      </div>
      <div className="px-1 mt-1.5 text-[10px] font-mono text-[#999999]/45">
        Expand references (what this paper cites) or citations (who cites this paper).
      </div>

      {/* ── Citation Path Finder (minimal) ── */}
      {nodeCount >= 20 && seedId && seedId !== paper.id && (
        <>
          <div className="hud-divider my-4" />
          <div>
            <button
              onClick={handleFindPath}
              className="text-[10px] font-mono text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors uppercase tracking-wider"
            >
              Find citation path from seed
            </button>
            {citationPath === 'not-found' && (
              <p className="mt-2 text-[10px] font-mono text-[#999999]/50">No citation path found.</p>
            )}
            {Array.isArray(citationPath) && (
              <div className="mt-2 flex flex-col gap-1">
                {citationPath.map((id, i) => {
                  const node = graphData!.nodes.find((n) => n.id === id);
                  const label = node
                    ? `${node.authors[0]?.name?.split(' ').pop() ?? '?'} ${node.year}`
                    : id;
                  return (
                    <div key={id} className="flex items-center gap-1 text-[10px] font-mono text-[#999999]/70">
                      {i > 0 && <span className="text-[#D4AF37]/40">→</span>}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
