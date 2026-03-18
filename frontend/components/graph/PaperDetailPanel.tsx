'use client';

import React, { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Network,
  Loader2,
} from 'lucide-react';
import type { Paper } from '@/types';
import { FIELD_COLORS } from '@/types';

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

      {/* ── EXPAND NETWORK — single primary CTA ── */}
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
      <div className="px-1 mt-1.5 text-[10px] font-mono text-[#999999]/45">
        Adds references and citing papers around this paper.
      </div>
    </div>
  );
}
