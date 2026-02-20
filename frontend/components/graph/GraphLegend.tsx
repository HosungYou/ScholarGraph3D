'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FIELD_COLORS } from '@/types';

export default function GraphLegend() {
  const [collapsed, setCollapsed] = useState(false);

  const fieldEntries = Object.entries(FIELD_COLORS).filter(([k]) => k !== 'Other');

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-16 left-4 glass rounded-lg px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors z-10 flex items-center gap-1"
      >
        <ChevronUp className="w-3 h-3" /> Legend
      </button>
    );
  }

  return (
    <div className="absolute bottom-16 left-4 glass rounded-lg px-3 py-2.5 text-xs text-text-secondary z-10 max-w-[220px] border border-border/30 bg-gray-900/80 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-text-primary/80">Legend</span>
        <button
          onClick={() => setCollapsed(true)}
          className="hover:text-text-primary transition-colors"
          aria-label="Collapse legend"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Node size */}
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-text-secondary/40" />
            <div className="w-3.5 h-3.5 rounded-full bg-text-secondary/40" />
          </div>
          <span>Size = citation count</span>
        </div>
      </div>

      {/* Field colors */}
      <div className="mb-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {fieldEntries.map(([field, color]) => (
            <div key={field} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="truncate">
                {field
                  .replace(' Sciences', '')
                  .replace('Arts & ', '')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Edge types */}
      <div className="mb-1.5 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0 border-t border-blue-400/60 flex-shrink-0" />
          <span>Citation</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0 border-t border-dashed border-emerald-400/60 flex-shrink-0" />
          <span>Similarity</span>
        </div>
      </div>

      {/* Cluster */}
      <div className="text-text-secondary/60">
        Hull = topic cluster
      </div>
    </div>
  );
}
