'use client';

import { useState } from 'react';
import {
  GitBranch,
  Waves,
  Hexagon,
  Type,
  RotateCcw,
  Maximize,
  SlidersHorizontal,
  LocateFixed,
  ChevronDown,
} from 'lucide-react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { cn } from '@/lib/utils';

export default function GraphControls() {
  const [expanded, setExpanded] = useState(false);

  const {
    showCitationEdges,
    showSimilarityEdges,
    showClusterHulls,
    showLabels,
    toggleCitationEdges,
    toggleSimilarityEdges,
    toggleClusterHulls,
    toggleLabels,
    selectedPaper,
    setPanelSelectionId,
  } = useGraphStore();

  const controls = [
    {
      icon: GitBranch,
      label: 'Citation Links',
      active: showCitationEdges,
      toggle: toggleCitationEdges,
    },
    {
      icon: Waves,
      label: 'Related Papers',
      active: showSimilarityEdges,
      toggle: toggleSimilarityEdges,
    },
    {
      icon: Hexagon,
      label: 'Topic Regions',
      active: showClusterHulls,
      toggle: toggleClusterHulls,
    },
    {
      icon: Type,
      label: 'Paper Titles',
      active: showLabels,
      toggle: toggleLabels,
    },
  ];

  const handleFullscreen = () => {
    const el = document.querySelector('.force-graph-container')?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  };

  return (
    <div className="absolute top-4 right-4 z-10 max-w-[320px] rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,8,0.9)] shadow-[0_12px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl">
      {/* Header — always visible, click to toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4AF37]/75" />
        <span className="flex-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]/70">
          Display
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-[#999999]/50 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div className="border-t border-[rgba(255,255,255,0.05)] px-3 pb-3 pt-2.5">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {controls.map((ctrl) => (
              <button
                key={ctrl.label}
                onClick={ctrl.toggle}
                title={ctrl.label}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide transition-all',
                  ctrl.active
                    ? 'bg-[rgba(212,175,55,0.1)] border-[rgba(212,175,55,0.2)] text-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.12)]'
                    : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)] text-[#999999]/65 hover:text-[#E5E5E5] hover:border-[rgba(255,255,255,0.09)]'
                )}
              >
                <ctrl.icon className="w-3.5 h-3.5" />
                {ctrl.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={() => {
                if (!selectedPaper) return;
                setPanelSelectionId(selectedPaper.id);
              }}
              disabled={!selectedPaper}
              title={selectedPaper ? 'Center Selected Paper' : 'Select a paper to center it'}
              className="flex-1 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] px-2.5 py-2 text-[10px] font-mono uppercase tracking-wide text-[#999999]/70 transition-all hover:border-[rgba(255,255,255,0.08)] hover:text-[#E5E5E5] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1.5">
                <LocateFixed className="w-3.5 h-3.5" />
                Center Paper
              </span>
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('resetCamera');
                window.dispatchEvent(event);
              }}
              title="Reset Camera"
              className="flex-1 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] px-2.5 py-2 text-[10px] font-mono uppercase tracking-wide text-[#999999]/70 transition-all hover:border-[rgba(255,255,255,0.08)] hover:text-[#E5E5E5]"
            >
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Reset View
              </span>
            </button>
          </div>

          <button
            onClick={handleFullscreen}
            title="Fullscreen"
            className="mt-2 w-full rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] px-2.5 py-2 text-[10px] font-mono uppercase tracking-wide text-[#999999]/70 transition-all hover:border-[rgba(255,255,255,0.08)] hover:text-[#E5E5E5]"
          >
            <span className="inline-flex items-center gap-1.5">
              <Maximize className="w-3.5 h-3.5" />
              Fullscreen
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
