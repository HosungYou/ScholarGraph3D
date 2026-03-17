'use client';

import { useState } from 'react';
import {
  GitBranch,
  Waves,
  Hexagon,
  Type,
  RotateCcw,
  Maximize,
  Circle,
  Network,
  Map,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  LocateFixed,
} from 'lucide-react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { cn } from '@/lib/utils';

const NODE_SIZE_OPTIONS = [
  { value: 'citations' as const, label: 'Citations' },
  { value: 'pagerank' as const, label: 'Influence' },
  { value: 'betweenness' as const, label: 'Bridge role' },
];

const LAYOUT_OPTIONS = [
  { value: 'semantic' as const, label: 'Theme Map', icon: Map, tooltip: 'Place papers by thematic similarity' },
  { value: 'network' as const, label: 'Citation Map', icon: Network, tooltip: 'Place papers by citation structure' },
];

export default function GraphControls() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const {
    showCitationEdges,
    showSimilarityEdges,
    showClusterHulls,
    showLabels,
    toggleCitationEdges,
    toggleSimilarityEdges,
    toggleClusterHulls,
    toggleLabels,
    nodeSizeMode,
    setNodeSizeMode,
    layoutMode,
    setLayoutMode,
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
    <div className="absolute top-4 right-4 z-10 max-w-[320px] rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,8,0.9)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2">
        <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4AF37]/75" />
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]/70">
          Workspace View
        </span>
      </div>

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

      <div className="mb-3 rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.015)] p-2.5">
        <button
          onClick={() => setAdvancedOpen((current) => !current)}
          className="flex w-full items-center gap-2 text-left"
        >
            <Circle className="w-3 h-3 text-[#999999]/55" />
            <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#999999]/55">
            Display Options
            </span>
          <span className="ml-auto text-[9px] font-mono text-[#999999]/45">
            {layoutMode} / {nodeSizeMode}
          </span>
          {advancedOpen ? (
            <ChevronUp className="w-3 h-3 text-[#999999]/45" />
          ) : (
            <ChevronDown className="w-3 h-3 text-[#999999]/45" />
          )}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Circle className="w-3 h-3 text-[#999999]/55" />
                <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#999999]/55">
                  Paper Size
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {NODE_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setNodeSizeMode(opt.value)}
                    className={cn(
                      'rounded-lg border px-2 py-1.5 text-[10px] font-mono transition-colors',
                      nodeSizeMode === opt.value
                        ? 'border-[rgba(212,175,55,0.22)] bg-[rgba(212,175,55,0.1)] text-[#D4AF37]'
                        : 'border-[rgba(255,255,255,0.05)] text-[#999999]/70 hover:text-[#E5E5E5] hover:border-[rgba(255,255,255,0.08)]'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Map className="w-3 h-3 text-[#999999]/55" />
                <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#999999]/55">
                  Layout
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLayoutMode(opt.value)}
                    title={opt.tooltip}
                    className={cn(
                      'rounded-lg border px-2 py-1.5 text-left transition-colors',
                      layoutMode === opt.value
                        ? 'border-[rgba(0,229,255,0.22)] bg-[rgba(0,229,255,0.1)] text-[#00E5FF]'
                        : 'border-[rgba(255,255,255,0.05)] text-[#999999]/70 hover:text-[#E5E5E5] hover:border-[rgba(255,255,255,0.08)]'
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <opt.icon className="w-3 h-3" />
                      {opt.label}
                    </div>
                    <div className="mt-1 text-[8px] text-[#999999]/45">
                      {opt.tooltip}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
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

      {advancedOpen && (
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
      )}
    </div>
  );
}
