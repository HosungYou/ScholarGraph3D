'use client';

import {
  GitBranch,
  Waves,
  Hexagon,
  Type,
  RotateCcw,
  Maximize,
} from 'lucide-react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { cn } from '@/lib/utils';

export default function GraphControls() {
  const {
    showCitationEdges,
    showSimilarityEdges,
    showClusterHulls,
    showLabels,
    toggleCitationEdges,
    toggleSimilarityEdges,
    toggleClusterHulls,
    toggleLabels,
  } = useGraphStore();

  const controls = [
    {
      icon: GitBranch,
      label: 'Citation Edges',
      active: showCitationEdges,
      toggle: toggleCitationEdges,
    },
    {
      icon: Waves,
      label: 'Similarity Edges',
      active: showSimilarityEdges,
      toggle: toggleSimilarityEdges,
    },
    {
      icon: Hexagon,
      label: 'Cluster Hulls',
      active: showClusterHulls,
      toggle: toggleClusterHulls,
    },
    {
      icon: Type,
      label: 'Labels',
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
    <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-10">
      {controls.map((ctrl) => (
        <button
          key={ctrl.label}
          onClick={ctrl.toggle}
          title={ctrl.label}
          className={cn(
            'p-2 rounded-lg transition-all border',
            ctrl.active
              ? 'bg-[#00E5FF]/15 border-[#00E5FF]/30 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.15)]'
              : 'bg-[#0a0f1e]/80 border-[#1a2555] text-[#7B8CDE]/60 hover:text-[#7B8CDE] hover:border-[#00E5FF]/15'
          )}
        >
          <ctrl.icon className="w-4 h-4" />
        </button>
      ))}
      <div className="h-px bg-[#1a2555]/20 my-1" />
      <button
        onClick={() => {
          // Reset camera via global ref or store action
          const event = new CustomEvent('resetCamera');
          window.dispatchEvent(event);
        }}
        title="Reset Camera"
        className="p-2 rounded-lg bg-[#0a0f1e]/80 border border-[#1a2555] text-[#7B8CDE]/60 hover:text-[#7B8CDE] hover:border-[#00E5FF]/15 transition-all"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      <button
        onClick={handleFullscreen}
        title="Fullscreen"
        className="p-2 rounded-lg bg-[#0a0f1e]/80 border border-[#1a2555] text-[#7B8CDE]/60 hover:text-[#7B8CDE] hover:border-[#00E5FF]/15 transition-all"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
}
