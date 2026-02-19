'use client';

import {
  GitBranch,
  Waves,
  Hexagon,
  Type,
  RotateCcw,
  Maximize,
  Sun,
  SunDim,
  Zap,
  Target,
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
    showBloom,
    showGhostEdges,
    showGapOverlay,
    toggleBloom,
    toggleGhostEdges,
    toggleGapOverlay,
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
    {
      icon: showBloom ? SunDim : Sun,
      label: 'Bloom Effect',
      active: showBloom,
      toggle: toggleBloom,
    },
    {
      icon: Zap,
      label: 'Ghost Edges',
      active: showGhostEdges,
      toggle: toggleGhostEdges,
    },
    {
      icon: Target,
      label: 'Gap Overlay',
      active: showGapOverlay,
      toggle: toggleGapOverlay,
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
              ? 'glass-strong border-accent/30 text-accent'
              : 'glass border-border/20 text-text-secondary/50 hover:text-text-secondary'
          )}
        >
          <ctrl.icon className="w-4 h-4" />
        </button>
      ))}
      <div className="h-px bg-border/20 my-1" />
      <button
        onClick={() => {
          // Reset camera via global ref or store action
          const event = new CustomEvent('resetCamera');
          window.dispatchEvent(event);
        }}
        title="Reset Camera"
        className="p-2 rounded-lg glass border border-border/20 text-text-secondary/50 hover:text-text-secondary transition-all"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      <button
        onClick={handleFullscreen}
        title="Fullscreen"
        className="p-2 rounded-lg glass border border-border/20 text-text-secondary/50 hover:text-text-secondary transition-all"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
}
