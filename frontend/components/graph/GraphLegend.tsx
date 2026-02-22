'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { STAR_COLOR_MAP } from './cosmic/cosmicConstants';

export default function GraphLegend() {
  const [collapsed, setCollapsed] = useState(false);
  const { showEnhancedIntents } = useGraphStore();

  const LEGEND_FIELDS = [
    'Computer Science',
    'Medicine',
    'Biology',
    'Physics',
    'Economics',
    'Engineering',
    'Business',
    'Chemistry',
    'Psychology',
    'Environmental Science',
  ];
  const fieldEntries = LEGEND_FIELDS
    .filter(f => STAR_COLOR_MAP[f])
    .map(f => [f, STAR_COLOR_MAP[f].core] as [string, string]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-16 left-4 hud-panel rounded-lg px-2 py-1 text-[10px] font-mono text-[#7B8CDE] hover:text-text-primary transition-colors z-10 flex items-center gap-1"
      >
        <ChevronUp className="w-3 h-3" /> STAR CHART
      </button>
    );
  }

  return (
    <div className="absolute bottom-16 left-4 hud-panel rounded-lg px-3 py-2.5 text-[10px] font-mono text-[#7B8CDE] z-10 max-w-[220px] border border-[#1a2555]/30 bg-[#050510]/80 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono uppercase tracking-widest text-[10px] text-[#00E5FF]/60">STAR CHART</span>
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
            <div className="w-2 h-2 rounded-full bg-[#7B8CDE]/40" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#7B8CDE]/40" />
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
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}90, 0 0 12px ${color}40` }}
              />
              <span className="truncate">
                {field
                  .replace(' Science', '')
                  .replace(' Sciences', '')
                  .replace('Environmental', 'Environ.')
                  .replace('Computer', 'CS')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Edge types */}
      <div className="mb-1.5 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-gradient-to-r from-[#00E5FF]/80 to-transparent flex-shrink-0 rounded-full" />
          <span>Citation</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0 border-t border-dashed border-emerald-400/60 flex-shrink-0" />
          <span>Similarity</span>
        </div>
      </div>

      {/* Citation Intent Colors */}
      <div className="mb-1.5 pt-1.5 border-t border-[#1a2555]/20">
        <div className="text-[10px] font-mono uppercase tracking-widest text-text-primary/60 mb-1">
          Edge Intents
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#95A5A6' }} />
            <span>Background</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#9B59B6' }} />
            <span>Methodology</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#4A90D9' }} />
            <span>Result/Comparison</span>
          </div>
        </div>

        {showEnhancedIntents && (
          <div className="mt-1 pt-1 border-t border-[#1a2555]/10">
            <div className="text-[10px] text-[#7B8CDE]/50 mb-0.5">Enhanced</div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#2ECC71' }} />
                <span>Supports</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#E74C3C' }} />
                <span>Contradicts</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#3498DB' }} />
                <span>Extends</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#E67E22' }} />
                <span>Applies</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-0 border-t-2 flex-shrink-0" style={{ borderColor: '#1ABC9C' }} />
                <span>Compares</span>
              </div>
            </div>
          </div>
        )}
        <div className="text-[10px] text-[#7B8CDE]/40 mt-1 italic">
          Hover edges for details
        </div>
      </div>

      {/* Cluster */}
      <div className="text-[#7B8CDE]/60">
        Nebula cloud = topic cluster
      </div>
    </div>
  );
}
