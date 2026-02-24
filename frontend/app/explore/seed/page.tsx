'use client';

import React, { useEffect, useCallback, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { getSession } from '@/lib/supabase';
import { useGraphStore } from '@/hooks/useGraphStore';
import ScholarGraph3D, { type ScholarGraph3DRef } from '@/components/graph/ScholarGraph3D';
import PaperDetailPanel from '@/components/graph/PaperDetailPanel';
import ClusterPanel from '@/components/graph/ClusterPanel';
import GraphControls from '@/components/graph/GraphControls';
import GraphLegend from '@/components/graph/GraphLegend';
import RadarLoader from '@/components/cosmic/RadarLoader';
import SeedChatPanel from '@/components/graph/SeedChatPanel';
import GapSpotterPanel from '@/components/graph/GapSpotterPanel';
import GapReportView from '@/components/graph/GapReportView';
import AcademicAnalysisPanel from '@/components/graph/AcademicAnalysisPanel';
import type { Paper, CitationIntent, GraphData, StructuralGap } from '@/types';

/* ──────────────────────────────────────────────
   Error Boundary — catches Three.js dispose crashes
   without killing the entire page
   ────────────────────────────────────────────── */
class Graph3DErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[ScholarGraph3D] Recovered from render error:', error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-black">
          <div className="text-center max-w-md px-6">
            <div className="text-[#D4AF37] text-lg font-semibold mb-2">
              Visualization Error
            </div>
            <p className="text-[#999999] text-sm mb-4">
              The 3D engine encountered an error. This usually resolves on reload.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded text-[#D4AF37] text-sm hover:bg-[#D4AF37]/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  Search,
  ArrowLeft,
  Network,
  GitBranch,
  Layers,
  Share2,
  CheckCircle,
  MessageCircle,
  ScanSearch,
  ChevronLeft,
  ChevronRight,
  X,
  BarChart3,
} from 'lucide-react';

/* ──────────────────────────────────────────────
   Sidebar collapsed width & expanded width
   ────────────────────────────────────────────── */
const SIDEBAR_COLLAPSED = 48;
const SIDEBAR_DEFAULT = 300;
const DRAWER_WIDTH = 480;

function SeedExploreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paperId = searchParams.get('paper_id') || '';
  const depth = Number(searchParams.get('depth') || '1');

  const {
    graphData,
    selectedPaper,
    isLoading,
    setGraphData,
    selectPaper,
    setLoading,
    setError,
    setCitationIntents,
    activeTab,
    setActiveTab,
    setGaps,
    setFrontierIds,
    activeGapReport,
    academicReport,
  } = useGraphStore();

  const graphRef = useRef<ScholarGraph3DRef>(null);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandSuccess, setExpandSuccess] = useState<string | null>(null);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedGraphIdRef = useRef<string | null>(null);
  const [seedMeta, setSeedMeta] = useState<{
    seed_title?: string;
    seed_paper_id?: string;
    total?: number;
    citation_edges?: number;
    similarity_edges?: number;
  } | null>(null);

  /* ── Left sidebar collapse ── */
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('seed-left-collapsed') === 'true';
    }
    return false;
  });

  const toggleLeftCollapsed = useCallback(() => {
    setLeftCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('seed-left-collapsed', String(next));
      return next;
    });
  }, []);

  /* ── Resizable sidebar width ── */
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seed-sidebar-width');
      if (saved) {
        const w = parseInt(saved, 10);
        if (w >= 250 && w <= 600) return w;
      }
    }
    return SIDEBAR_DEFAULT;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => { sidebarWidthRef.current = sidebarWidth; }, [sidebarWidth]);

  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientX - resizeStartXRef.current;
      const newWidth = Math.min(600, Math.max(250, resizeStartWidthRef.current + delta));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('seed-sidebar-width', String(sidebarWidthRef.current));
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Auto-save helpers
  const showSavedIndicator = useCallback(() => {
    setSavedIndicator(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSavedIndicator(false), 2000);
  }, []);

  const autoSave = useCallback(async (data: GraphData, seedTitle?: string) => {
    try {
      const session = await getSession();
      if (!session?.access_token) return; // Skip auto-save when not authenticated
      const name = seedTitle
        ? `Seed: ${seedTitle.slice(0, 80)}`
        : `Seed: ${paperId}`;

      if (savedGraphIdRef.current) {
        await api.saveGraph({
          name,
          seed_query: paperId,
          graph_data: data,
        });
      } else {
        const saved = await api.saveGraph({
          name,
          seed_query: paperId,
          graph_data: data,
        });
        savedGraphIdRef.current = saved.id;
      }
      showSavedIndicator();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[AutoSave] Failed:', err);
      }
    }
  }, [paperId, showSavedIndicator]);

  const scheduleDebouncedSave = useCallback((data: GraphData, seedTitle?: string) => {
    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    autoSaveDebounceRef.current = setTimeout(() => {
      autoSave(data, seedTitle);
    }, 2000);
  }, [autoSave]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    };
  }, []);

  // Load saved graph if graph_id is present
  const graphId = searchParams.get('graph_id');

  // Fetch seed graph (or load saved graph)
  useEffect(() => {
    if (!paperId && !graphId) return;
    setLoading(true);
    setError(null);

    const fetchPromise = graphId
      ? api.loadGraph(graphId)
      : api.seedExplore(paperId, { depth: 1, max_papers: 80 });

    fetchPromise
      .then((data) => {
        setGraphData(data);
        const meta = data.meta as any;
        setSeedMeta(meta);

        const intents: CitationIntent[] = data.edges
          .filter(e => e.type === 'citation' && e.intent)
          .map(e => ({
            citing_id: e.source,
            cited_id: e.target,
            basic_intent: e.intent as CitationIntent['basic_intent'],
            is_influential: false,
          }));
        if (intents.length > 0) {
          setCitationIntents(intents);
        }

        const responseAny = data as any;
        if (responseAny.gaps && Array.isArray(responseAny.gaps)) {
          setGaps(responseAny.gaps);
        }
        if (responseAny.frontier_ids && Array.isArray(responseAny.frontier_ids)) {
          setFrontierIds(responseAny.frontier_ids);
        }

        autoSave(data, meta?.seed_title);
      })
      .catch((err) => {
        console.error('Seed explore failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to build seed graph');
      })
      .finally(() => setLoading(false));
  }, [paperId, graphId, setGraphData, setLoading, setError, setCitationIntents, setGaps, setFrontierIds, autoSave]);

  // Camera control events
  useEffect(() => {
    const handleResetCamera = () => graphRef.current?.resetCamera();
    const handleFocusCluster = (e: Event) => {
      const { clusterId } = (e as CustomEvent<{ clusterId: number }>).detail;
      graphRef.current?.focusOnCluster(clusterId);
    };
    window.addEventListener('resetCamera', handleResetCamera);
    window.addEventListener('focusCluster', handleFocusCluster);
    return () => {
      window.removeEventListener('resetCamera', handleResetCamera);
      window.removeEventListener('focusCluster', handleFocusCluster);
    };
  }, []);

  const handleExpandPaper = useCallback(
    async (paper: Paper) => {
      const s2Id = paper.s2_paper_id;
      const doiId = paper.doi ? `DOI:${paper.doi}` : '';

      if (!s2Id && !doiId) {
        setExpandError('This paper cannot be expanded (no identifier available)');
        setTimeout(() => setExpandError(null), 4000);
        return;
      }

      setIsExpanding(true);
      setExpandError(null);
      setExpandSuccess(null);

      try {
        let result;
        const expandId = s2Id || doiId;

        try {
          result = await api.expandPaperStable(expandId, graphData?.nodes || [], graphData?.edges || []);
        } catch (err) {
          if (expandId === s2Id && doiId) {
            result = await api.expandPaperStable(doiId, graphData?.nodes || [], graphData?.edges || []);
          } else {
            throw err;
          }
        }

        const count = result.nodes.length;

        if (count > 0) {
          const store = useGraphStore.getState();
          const newMap = new Map(store.expandedFromMap);
          result.nodes.forEach((n: Paper) => newMap.set(n.id, paper.id));
          store.setExpandedFromMap(newMap);

          const parentNode = graphData?.nodes.find(
            n => n.id === expandId ||
                 n.s2_paper_id === expandId ||
                 (n.doi && `DOI:${n.doi}` === expandId)
          );
          const ox = parentNode?.x ?? 0;
          const oy = parentNode?.y ?? 0;
          const oz = parentNode?.z ?? 0;

          const targets = new Map(
            result.nodes.map(n => [n.id, { x: n.x, y: n.y, z: n.z }])
          );

          const nodesAtOrigin = result.nodes.map(n => ({
            ...n,
            x: ox,
            y: oy,
            z: oz,
          }));
          const newNodeIds = result.nodes.map(n => n.id);
          useGraphStore.getState().addNodesStable(nodesAtOrigin, result.edges);

          setTimeout(() => {
            graphRef.current?.animateExpandNodes(
              parentNode?.id || paper.id,
              newNodeIds,
              targets
            );
          }, 50);

          const meta = result.meta;
          if (meta && (!meta.references_ok || !meta.citations_ok)) {
            const detail = meta.error_detail ? ` — ${meta.error_detail}` : '';
            setExpandSuccess(`${count} papers added (partial${detail})`);
          } else {
            setExpandSuccess(`${count} papers added`);
          }

          const currentGraphData = useGraphStore.getState().graphData;
          if (currentGraphData) {
            scheduleDebouncedSave(currentGraphData, seedMeta?.seed_title);
          }
        } else {
          setExpandSuccess('No new papers found');
        }
        setTimeout(() => setExpandSuccess(null), 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to expand';
        setExpandError(msg);
        setTimeout(() => setExpandError(null), 5000);
      } finally {
        setIsExpanding(false);
      }
    },
    [graphData, scheduleDebouncedSave, seedMeta]
  );

  // Double-click expand
  useEffect(() => {
    const handle = async (e: Event) => {
      const { paper } = (e as CustomEvent<{ paper: Paper }>).detail;
      await handleExpandPaper(paper);
    };
    window.addEventListener('expandPaper', handle);
    return () => window.removeEventListener('expandPaper', handle);
  }, [graphData, handleExpandPaper]);

  const handlePaperSelect = useCallback((paper: Paper | null) => {
    selectPaper(paper);
  }, [selectPaper]);

  const showPaperDetail = !!selectedPaper;

  /* ── Tab metadata for sidebar ── */
  const tabs = [
    { id: 'clusters' as const, icon: Layers, label: 'CLUSTERS' },
    { id: 'gaps' as const, icon: ScanSearch, label: 'GAPS' },
    { id: 'chat' as const, icon: MessageCircle, label: 'CHAT' },
    { id: 'academic' as const, icon: BarChart3, label: 'ACADEMIC' },
  ];

  return (
    <div className="h-screen flex flex-col bg-black">
      {/* ═══════════════════════════════════════════
          TOP BAR — Mission Control HUD
          ═══════════════════════════════════════════ */}
      <div className="flex-shrink-0 z-20 hud-panel-clean border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-4 px-4 py-2.5">
          {/* Logo */}
          <a
            href="/"
            className="text-sm font-bold text-[#D4AF37] flex-shrink-0 font-mono tracking-[0.2em] hover:text-[#D4AF37]/80 transition-colors"
          >
            SG3D
          </a>

          <div className="w-px h-5 bg-[rgba(255,255,255,0.06)]" />

          {/* Mode badge */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Network className="w-3.5 h-3.5 text-[#D4AF37]" />
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
            </div>
            <span className="hud-label text-[#D4AF37]">ORIGIN POINT</span>
          </div>

          {/* Seed title */}
          {seedMeta?.seed_title && (
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#999999]/60 truncate max-w-md font-mono">
                {seedMeta.seed_title}
              </p>
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <AnimatePresence>
              {savedIndicator && (
                <motion.div
                  key="saved-indicator"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-green-400 border border-green-700/30 bg-green-900/15"
                >
                  <CheckCircle className="w-3 h-3" />
                  SAVED
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={() => router.push('/dashboard')}
              className="hud-button-ghost flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] uppercase tracking-wider"
            >
              <Search className="w-3 h-3" />
              Graphs
            </button>
            <button
              onClick={() => router.push('/')}
              className="hud-button-ghost flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] uppercase tracking-wider"
            >
              <ArrowLeft className="w-3 h-3" />
              Home
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          MAIN CONTENT — Sidebar + Graph + Drawer
          ═══════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Left Sidebar — Collapsible ─── */}
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
                    setActiveTab(tab.id);
                    setLeftCollapsed(false);
                    localStorage.setItem('seed-left-collapsed', 'false');
                  }}
                  title={tab.label}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.15)]'
                      : 'text-[#999999]/40 hover:text-[#999999] hover:bg-[#111111]/50'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={toggleLeftCollapsed}
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
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                        activeTab === tab.id
                          ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                          : 'text-[#999999]/40 hover:text-[#999999]'
                      }`}
                    >
                      <tab.icon className="w-3 h-3" />
                      {tab.label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button
                    onClick={toggleLeftCollapsed}
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
                {activeTab === 'gaps' && (
                  activeGapReport ? <GapReportView /> : <GapSpotterPanel />
                )}
                {activeTab === 'chat' && <SeedChatPanel />}
                {activeTab === 'academic' && <AcademicAnalysisPanel />}
              </div>
            </>
          )}
          {/* Resize handle */}
          {!leftCollapsed && (
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize group z-20"
            >
              <div className="w-full h-full bg-transparent group-hover:bg-[rgba(212,175,55,0.3)] transition-colors" />
            </div>
          )}
        </motion.div>

        {/* ─── Center: 3D Graph ─── */}
        <div className="flex-1 relative min-w-0 overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <RadarLoader message="Building citation network..." />
                <p className="text-[10px] text-[#999999]/40 mt-3 font-mono">
                  Fetching references &amp; citations from Semantic Scholar
                </p>
              </div>
            </div>
          )}

          {!isLoading && !graphData && paperId && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[#999999] font-mono text-sm">No results found</p>
            </div>
          )}

          {!paperId && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md px-4">
                <Network className="w-12 h-12 text-[#D4AF37] mx-auto mb-4 opacity-60" />
                <div className="hud-label text-[#D4AF37]/30 mb-2">[ AWAITING ORIGIN POINT ]</div>
                <h2 className="text-xl font-semibold text-text-primary mb-2 font-mono">
                  ORIGIN POINT EXPLORATION
                </h2>
                <p className="text-[#999999]/60 text-sm mb-6 font-mono">
                  Start from a single paper and explore its citation network
                </p>
                <p className="text-[#999999]/40 text-xs font-mono">
                  Enter a DOI or Semantic Scholar ID on the home page to begin
                </p>
              </div>
            </div>
          )}

          {graphData && (
            <Graph3DErrorBoundary>
              <ScholarGraph3D ref={graphRef} />
            </Graph3DErrorBoundary>
          )}
          <GraphControls />
          <GraphLegend />

          {/* ─── Bottom Status Bar ─── */}
          {graphData && seedMeta && (
            <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
              <div className="inline-flex items-center gap-3 px-3 py-2 hud-panel-clean rounded-lg text-[10px] font-mono text-[#999999] pointer-events-auto">
                <div className="flex items-center gap-1.5">
                  <Network className="w-3 h-3 text-[#D4AF37]" />
                  <span className="text-text-primary font-medium">{graphData.nodes.length}</span>
                  <span className="text-[#999999]/50">papers</span>
                </div>
                <div className="w-px h-3 bg-[rgba(255,255,255,0.06)]" />
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-3 h-3" />
                  <span className="text-text-primary font-medium">
                    {graphData.edges.filter(e => e.type === 'citation').length}
                  </span>
                  <span className="text-[#999999]/50">citations</span>
                </div>
                <div className="w-px h-3 bg-[rgba(255,255,255,0.06)]" />
                <div className="flex items-center gap-1.5">
                  <Share2 className="w-3 h-3 text-[#D4AF37]/60" />
                  <span className="text-text-primary font-medium">
                    {graphData.edges.filter(e => e.type === 'similarity').length}
                  </span>
                  <span className="text-[#999999]/50">similar</span>
                </div>
                <div className="w-px h-3 bg-[rgba(255,255,255,0.06)]" />
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3" />
                  <span className="text-text-primary font-medium">{graphData.clusters.length}</span>
                  <span className="text-[#999999]/50">clusters</span>
                </div>
                <div className="w-px h-3 bg-[rgba(255,255,255,0.06)]" />
                <span className="text-[#999999]/30 italic">dbl-click to expand</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Right Panel — Push Layout ─── */}
        <AnimatePresence>
          {showPaperDetail && (
            <motion.div
              key="paper-drawer"
              initial={{ width: 0 }}
              animate={{ width: DRAWER_WIDTH }}
              exit={{ width: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="flex-shrink-0 border-l border-[rgba(255,255,255,0.06)] bg-[rgba(10,10,10,0.95)] backdrop-blur-xl overflow-hidden"
            >
              <div style={{ width: DRAWER_WIDTH }} className="h-full overflow-y-auto">
                <PaperDetailPanel
                  paper={selectedPaper}
                  onClose={() => handlePaperSelect(null)}
                  onExpand={() => handleExpandPaper(selectedPaper)}
                  isExpanding={isExpanding}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════
          TOASTS
          ═══════════════════════════════════════════ */}
      <AnimatePresence>
        {expandError && (
          <motion.div
            key="toast-error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 z-50 bg-red-900/90 border border-red-700/40 text-red-200 px-4 py-3 rounded-lg text-sm max-w-sm shadow-xl font-mono"
          >
            {expandError}
          </motion.div>
        )}
        {expandSuccess && (
          <motion.div
            key="toast-success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 z-50 bg-green-900/90 border border-green-700/40 text-green-200 px-4 py-3 rounded-lg text-sm max-w-sm shadow-xl font-mono"
          >
            {expandSuccess}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SeedExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-black">
          <div className="w-12 h-12 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SeedExploreContent />
    </Suspense>
  );
}
