'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { STAR_COLOR_MAP } from './cosmic/cosmicConstants';

const TOP_FIELDS = ['Computer Science', 'Medicine', 'Biology', 'Physics', 'Economics'];

export default function GraphLegend() {
  const [collapsed, setCollapsed] = useState(true);

  const fieldEntries = TOP_FIELDS
    .filter(f => STAR_COLOR_MAP[f])
    .map(f => [f, STAR_COLOR_MAP[f].core] as [string, string]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-16 left-4 z-10 flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,8,0.88)] px-3 py-2 text-left font-mono text-[10px] text-[#999999] shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:text-text-primary"
      >
        <ChevronUp className="w-3 h-3 text-[#D4AF37]/70" />
        <span className="uppercase tracking-[0.16em] text-[#D4AF37]/70">Visual Key</span>
      </button>
    );
  }

  return (
    <div className="absolute bottom-16 left-4 hud-panel rounded-lg px-3 py-2.5 text-[10px] font-mono text-[#999999] z-10 max-w-[220px] border border-[#1A1A1A] bg-black/80 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono uppercase tracking-widest text-[10px] text-[#D4AF37]/60">VISUAL KEY</span>
        <button
          onClick={() => setCollapsed(true)}
          className="hover:text-text-primary transition-colors"
          aria-label="Collapse legend"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Field colors (top 5) */}
      <div className="mb-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {fieldEntries.map(([field, color]) => (
            <div key={field} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}90` }}
              />
              <span className="truncate">
                {field.replace(' Science', '').replace('Computer', 'CS')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Edge types */}
      <div className="mb-1.5 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-gradient-to-r from-[#D4AF37]/80 to-transparent flex-shrink-0 rounded-full" />
          <span>Citation</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0 border-t border-dashed border-emerald-400/60 flex-shrink-0" />
          <span>Similarity</span>
        </div>
      </div>

      {/* Cluster */}
      <div className="text-[#999999]/60">
        Shaded region = topic area
      </div>
    </div>
  );
}
