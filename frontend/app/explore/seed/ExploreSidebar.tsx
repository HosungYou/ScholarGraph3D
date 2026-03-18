'use client';

import { motion } from 'framer-motion';
import { Layers, ScanSearch, ChevronLeft, ChevronRight } from 'lucide-react';
import ClusterPanel from '@/components/graph/ClusterPanel';
import GapSpotterPanel from '@/components/graph/GapSpotterPanel';

const SIDEBAR_COLLAPSED = 48;

type TabId = 'clusters' | 'gaps';

interface ExploreSidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  leftCollapsed: boolean;
  onToggleCollapsed: () => void;
  sidebarWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
  gaps: unknown[];
}

const tabs: { id: TabId; icon: React.ElementType; label: string }[] = [
  { id: 'clusters', icon: Layers, label: 'DISCOVER' },
  { id: 'gaps', icon: ScanSearch, label: 'GAPS' },
];

export default function ExploreSidebar({
  activeTab,
  onTabChange,
  leftCollapsed,
  onToggleCollapsed,
  sidebarWidth,
  onResizeStart,
  gaps,
}: ExploreSidebarProps) {
  return (
    <motion.div
      animate={{ width: leftCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="flex-shrink-0 border-r border-[rgba(255,255,255,0.04)] bg-[rgba(10,10,10,0.95)] flex flex-col relative z-10"
    >
      {leftCollapsed ? (
        /* ── Collapsed: icon-only vertical tabs ── */
        <div className="flex flex-col items-center pt-2 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                onTabChange(tab.id);
                onToggleCollapsed();
              }}
              title={tab.label}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all relative ${
                activeTab === tab.id
                  ? 'bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.15)]'
                  : 'text-[#999999]/40 hover:text-[#999999] hover:bg-[#111111]/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.id === 'gaps' && gaps.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center text-[7px] font-mono font-bold rounded-full bg-[#D4AF37] text-black">
                  {gaps.length}
                </span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onToggleCollapsed}
            className="w-9 h-9 flex items-center justify-center text-[#999999]/30 hover:text-[#999999] transition-colors mb-2"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* ── Expanded: full tabs + content ── */
        <>
          {/* Tab header */}
          <div className="flex-shrink-0 border-b border-[rgba(255,255,255,0.04)]">
            <div className="flex">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                    activeTab === tab.id
                      ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                      : 'text-[#999999]/40 hover:text-[#999999]'
                  }`}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                  {tab.id === 'gaps' && gaps.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[8px] font-mono font-bold rounded-full bg-[rgba(212,175,55,0.15)] text-[#D4AF37] border border-[rgba(212,175,55,0.3)]">
                      {gaps.length}
                    </span>
                  )}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={onToggleCollapsed}
                className="px-2 flex items-center text-[#999999]/30 hover:text-[#999999] transition-colors"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'clusters' && <ClusterPanel />}
            {activeTab === 'gaps' && <GapSpotterPanel />}
          </div>
        </>
      )}
      {/* Resize handle */}
      {!leftCollapsed && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize group z-20"
        >
          <div className="w-full h-full bg-transparent group-hover:bg-[rgba(212,175,55,0.3)] transition-colors" />
        </div>
      )}
    </motion.div>
  );
}
