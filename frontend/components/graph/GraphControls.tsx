'use client';

import {
  GitBranch,
  Waves,
  Hexagon,
  Type,
  RotateCcw,
  Maximize,
  Circle,
} from 'lucide-react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { cn } from '@/lib/utils';

const NODE_SIZE_OPTIONS = [
  { value: 'citations' as const, label: 'Citations' },
  { value: 'pagerank' as const, label: 'PageRank' },
  { value: 'betweenness' as const, label: 'Betweenness' },
];

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
    nodeSizeMode,
    setNodeSizeMode,
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
    <div className="absolute top-4 right-4 flex flex-col gap-1 z-10">
      {controls.map((ctrl) => (
        <button
          key={ctrl.label}
          onClick={ctrl.toggle}
          title={ctrl.label}
          className={cn(
            'p-2 rounded-lg transition-all border',
            ctrl.active
              ? 'bg-[rgba(212,175,55,0.1)] border-[rgba(212,175,55,0.2)] text-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.12)]'
              : 'bg-[rgba(10,10,10,0.8)] border-[rgba(255,255,255,0.03)] text-[#999999]/40 hover:text-[#999999] hover:border-[rgba(255,255,255,0.06)]'
          )}
        >
          <ctrl.icon className="w-4 h-4" />
        </button>
      ))}
      <div className="h-px bg-[rgba(255,255,255,0.03)] my-0.5" />
      {/* Node Size Mode Dropdown */}
      <div className="relative group">
        <button
          title="Node Size"
          className="p-2 rounded-lg bg-[rgba(10,10,10,0.8)] border border-[rgba(255,255,255,0.03)] text-[#999999]/40 hover:text-[#999999] hover:border-[rgba(255,255,255,0.06)] transition-all"
        >
          <Circle className="w-4 h-4" />
        </button>
        <div className="absolute right-10 top-0 hidden group-hover:block">
          <div className="bg-[rgba(10,10,10,0.95)] border border-[rgba(255,255,255,0.08)] rounded-lg p-1 min-w-[120px] shadow-xl">
            <div className="text-[9px] font-mono text-[#999999]/40 px-2 py-1 uppercase tracking-wider">
              Node Size
            </div>
            {NODE_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setNodeSizeMode(opt.value)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-[10px] font-mono transition-colors',
                  nodeSizeMode === opt.value
                    ? 'text-[#D4AF37] bg-[rgba(212,175,55,0.1)]'
                    : 'text-[#999999]/60 hover:text-[#999999] hover:bg-[rgba(255,255,255,0.03)]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="h-px bg-[rgba(255,255,255,0.03)] my-0.5" />
      <button
        onClick={() => {
          const event = new CustomEvent('resetCamera');
          window.dispatchEvent(event);
        }}
        title="Reset Camera"
        className="p-2 rounded-lg bg-[rgba(10,10,10,0.8)] border border-[rgba(255,255,255,0.03)] text-[#999999]/40 hover:text-[#999999] hover:border-[rgba(255,255,255,0.06)] transition-all"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      <button
        onClick={handleFullscreen}
        title="Fullscreen"
        className="p-2 rounded-lg bg-[rgba(10,10,10,0.8)] border border-[rgba(255,255,255,0.03)] text-[#999999]/40 hover:text-[#999999] hover:border-[rgba(255,255,255,0.06)] transition-all"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
}
