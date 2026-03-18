'use client';

import React, { useEffect, useCallback, useState, useRef, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { getSession } from '@/lib/supabase';
import { useGraphStore } from '@/hooks/useGraphStore';
import ScholarGraph3D, { type ScholarGraph3DRef } from '@/components/graph/ScholarGraph3D';
import PaperDetailPanel from '@/components/graph/PaperDetailPanel';
import ExploreSidebar from './ExploreSidebar';
import GraphControls from '@/components/graph/GraphControls';
import GraphLegend from '@/components/graph/GraphLegend';
import RadarLoader from '@/components/cosmic/RadarLoader';
import type { Paper, CitationIntent, GraphData } from '@/types';

/* ──────────────────────────────────────────────
   Error Boundary — catches Three.js dispose crashes
   without killing the entire page
   ────────────────────────────────────────────── */
class Graph3DErrorBoundary extends React.Component<
  { children: React.ReactNode; onRecover?: () => void; recoveryNonce?: number },
  { hasError: boolean }
> {
  private recoveryRequested = false;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[ScholarGraph3D] Recovered from render error:', error.message);
    if (this.props.onRecover && !this.recoveryRequested) {
      this.recoveryRequested = true;
      setTimeout(() => this.props.onRecover?.(), 120);
    }
  }
  componentDidUpdate(prevProps: Readonly<{ children: React.ReactNode; onRecover?: () => void; recoveryNonce?: number }>) {
    if (prevProps.recoveryNonce !== this.props.recoveryNonce && this.state.hasError) {
      this.recoveryRequested = false;
      this.setState({ hasError: false });
    }
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
              Retry 3D View
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
  CheckCircle,
  ScanSearch,
  X,
} from 'lucide-react';

/* ──────────────────────────────────────────────
   Sidebar collapsed width & expanded width
   ────────────────────────────────────────────── */
const SIDEBAR_DEFAULT = 300;
const DRAWER_WIDTH = 480;
const COMPACT_DRAWER_BREAKPOINT = 1380;

type ExpandDiffSummary = {
  mode: 'expand';
  paperTitle: string;
  addedCount: number;
  referencesCount: number;
  citationsCount: number;
  newClusters: number;
  bridgeCandidates: number;
  partial: boolean;
  errorDetail?: string;
};

function SeedExploreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paperId = searchParams.get('paper_id') || '';
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

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
    gaps,
    setGaps,
    setFrontierIds,
  } = useGraphStore();

  const graphRef = useRef<ScholarGraph3DRef>(null);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandSuccess, setExpandSuccess] = useState<string | null>(null);
  const [expandSummary, setExpandSummary] = useState<ExpandDiffSummary | null>(null);
  const [graphRenderNonce, setGraphRenderNonce] = useState(0);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [gapToastVisible, setGapToastVisible] = useState(false);
  const [gapToastDismissed, setGapToastDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('gap-toast-dismissed') === 'true';
    }
    return false;
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        await api.updateGraph(savedGraphIdRef.current, {
          name,
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

  const scheduleClearExpandFeedback = useCallback((delay = 5000) => {
    if (expandFeedbackTimerRef.current) clearTimeout(expandFeedbackTimerRef.current);
    expandFeedbackTimerRef.current = setTimeout(() => {
      setExpandSuccess(null);
      setExpandSummary(null);
    }, delay);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
      if (expandFeedbackTimerRef.current) clearTimeout(expandFeedbackTimerRef.current);
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

  // Gap Discovery Toast
  useEffect(() => {
    if (gaps.length > 0 && graphData && !gapToastDismissed && !isLoading) {
      const timer = setTimeout(() => setGapToastVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [gaps.length, graphData, gapToastDismissed, isLoading]);

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
      setExpandSummary(null);

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
        const existingClusterIds = new Set((graphData?.clusters || []).map((cluster) => cluster.id));

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
          const summary: ExpandDiffSummary = {
            mode: 'expand',
            paperTitle: paper.title,
            addedCount: count,
            referencesCount: meta?.refs_count ?? result.nodes.filter((node) => node.direction === 'reference').length,
            citationsCount: meta?.cites_count ?? result.nodes.filter((node) => node.direction === 'citation').length,
            newClusters: new Set(
              result.nodes
                .map((node) => node.cluster_id)
                .filter((clusterId) => clusterId !== -1 && !existingClusterIds.has(clusterId))
            ).size,
            bridgeCandidates: result.nodes.filter((node) => node.is_bridge).length,
            partial: Boolean(meta && (!meta.references_ok || !meta.citations_ok)),
            errorDetail: meta?.error_detail,
          };
          setExpandSummary(summary);

          if (meta && (!meta.references_ok || !meta.citations_ok)) {
            const detail = meta.error_detail ? ` — ${meta.error_detail}` : '';
            setExpandSuccess(`${count} papers added (partial${detail})`);
          } else {
            setExpandSuccess(`Expanded "${paper.title.length > 44 ? `${paper.title.slice(0, 44)}...` : paper.title}"`);
          }

          const currentGraphData = useGraphStore.getState().graphData;
          if (currentGraphData) {
            scheduleDebouncedSave(currentGraphData, seedMeta?.seed_title);
          }
        } else {
          setExpandSuccess('No new papers found');
        }
        scheduleClearExpandFeedback();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to expand';
        setExpandSummary(null);
        setExpandError(msg);
        setTimeout(() => setExpandError(null), 5000);
      } finally {
        setIsExpanding(false);
      }
    },
    [graphData, scheduleClearExpandFeedback, scheduleDebouncedSave, seedMeta]
  );

  // Double-click expand
  useEffect(() => {
    const handle = async (e: Event) => {
      const { paper } = (e as CustomEvent<{ paper: Paper }>).detail;
      await handleExpandPaper(paper);
    };
    window.addEventListener('expandPaper', handle);
    return () => window.removeEventListener('expandPaper', handle);
  }, [handleExpandPaper]);

  const handlePaperSelect = useCallback((paper: Paper | null) => {
    selectPaper(paper);
  }, [selectPaper]);

  const showPaperDetail = !!selectedPaper;
  const isCompactDrawer = viewportWidth < COMPACT_DRAWER_BREAKPOINT;
  const activeDrawerWidth = isCompactDrawer
    ? Math.min(420, Math.max(320, viewportWidth - 24))
    : DRAWER_WIDTH;

  /* ── Responsive auto-collapse: narrow viewports ── */
  useEffect(() => {
    if (showPaperDetail && typeof window !== 'undefined' && window.innerWidth < 1200) {
      setLeftCollapsed(true);
    }
  }, [showPaperDetail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const seedPaper = useMemo(() => {
    if (!graphData) return null;
    const seedId = graphData.meta?.seed_paper_id;
    return seedId ? graphData.nodes.find((node) => node.id === seedId) || null : null;
  }, [graphData]);

  const openSidebarTab = useCallback((tabId: 'clusters' | 'gaps') => {
    setActiveTab(tabId);
    if (leftCollapsed) {
      setLeftCollapsed(false);
      localStorage.setItem('seed-left-collapsed', 'false');
    }
  }, [leftCollapsed, setActiveTab]);

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
            <span className="hud-label text-[#D4AF37]">SEED WORKSPACE</span>
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
              Library
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

        {(expandError || expandSuccess || expandSummary || (gapToastVisible && !gapToastDismissed && gaps.length > 0)) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(255,255,255,0.04)] px-4 py-2">
            {expandSummary && (
              <div
                data-testid="expand-summary"
                className="inline-flex flex-wrap items-center gap-2 rounded-full border border-green-700/30 bg-green-900/15 px-3 py-1 text-[10px] font-mono text-green-200"
              >
                <CheckCircle className="w-3 h-3 text-green-300" />
                <span className="text-green-100">
                  Expand complete
                </span>
                <span className="rounded-full border border-green-700/20 bg-black/20 px-2 py-0.5">
                  +{expandSummary.addedCount} papers
                </span>
                <span className="rounded-full border border-green-700/20 bg-black/20 px-2 py-0.5">
                  {expandSummary.referencesCount} refs
                </span>
                <span className="rounded-full border border-green-700/20 bg-black/20 px-2 py-0.5">
                  {expandSummary.citationsCount} citing
                </span>
                {expandSummary.newClusters > 0 && (
                  <span className="rounded-full border border-green-700/20 bg-black/20 px-2 py-0.5">
                    {expandSummary.newClusters} new cluster{expandSummary.newClusters > 1 ? 's' : ''}
                  </span>
                )}
                {expandSummary.bridgeCandidates > 0 && (
                  <span className="rounded-full border border-green-700/20 bg-black/20 px-2 py-0.5">
                    {expandSummary.bridgeCandidates} bridge candidate{expandSummary.bridgeCandidates > 1 ? 's' : ''}
                  </span>
                )}
                {expandSummary.partial && (
                  <span className="rounded-full border border-amber-500/20 bg-amber-900/15 px-2 py-0.5 text-amber-200">
                    Partial fetch
                  </span>
                )}
                {expandSummary.errorDetail && (
                  <span className="text-green-100/65">
                    {expandSummary.errorDetail}
                  </span>
                )}
              </div>
            )}
            {expandSuccess && !expandSummary && (
              <div className="inline-flex items-center gap-2 rounded-full border border-green-700/30 bg-green-900/15 px-3 py-1 text-[10px] font-mono text-green-300">
                <CheckCircle className="w-3 h-3" />
                <span>{expandSuccess}</span>
              </div>
            )}
            {expandError && (
              <div className="inline-flex items-center gap-2 rounded-full border border-red-700/30 bg-red-900/15 px-3 py-1 text-[10px] font-mono text-red-200">
                <X className="w-3 h-3" />
                <span>{expandError}</span>
              </div>
            )}
            {gapToastVisible && !gapToastDismissed && gaps.length > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(212,175,55,0.28)] bg-[rgba(212,175,55,0.08)] px-3 py-1 text-[10px] font-mono text-[#D4AF37]">
                <ScanSearch className="w-3 h-3" />
                <span>{gaps.length} research gap{gaps.length !== 1 ? 's' : ''} discovered</span>
                <button
                  onClick={() => {
                    setActiveTab('gaps');
                    if (leftCollapsed) {
                      setLeftCollapsed(false);
                      localStorage.setItem('seed-left-collapsed', 'false');
                    }
                    setGapToastDismissed(true);
                    setGapToastVisible(false);
                    sessionStorage.setItem('gap-toast-dismissed', 'true');
                  }}
                  className="rounded-full border border-[rgba(212,175,55,0.24)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#D4AF37] transition-colors hover:bg-[rgba(212,175,55,0.12)]"
                >
                  View Gaps
                </button>
                <button
                  onClick={() => {
                    setGapToastDismissed(true);
                    setGapToastVisible(false);
                    sessionStorage.setItem('gap-toast-dismissed', 'true');
                  }}
                  className="text-[#D4AF37]/60 transition-colors hover:text-[#D4AF37]"
                  title="Dismiss gap notice"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════
          MAIN CONTENT — Sidebar + Graph + Drawer
          ═══════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Left Sidebar — Collapsible ─── */}
        <ExploreSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          leftCollapsed={leftCollapsed}
          onToggleCollapsed={toggleLeftCollapsed}
          sidebarWidth={sidebarWidth}
          onResizeStart={handleResizeStart}
          gaps={gaps}
        />

        {/* ─── Center: 3D Graph ─── */}
        <div className="flex-1 relative overflow-hidden" style={{ minWidth: '400px' }}>
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
                <div className="hud-label text-[#D4AF37]/30 mb-2">[ WAITING FOR A SEED PAPER ]</div>
                <h2 className="text-xl font-semibold text-text-primary mb-2 font-mono">
                  START A RESEARCH WORKSPACE
                </h2>
                <p className="text-[#999999]/60 text-sm mb-6 font-mono">
                  Start from one paper, then branch into discovery, reading, or report generation
                </p>
                <p className="text-[#999999]/40 text-xs font-mono">
                  Use topic search first, or paste a DOI if you already know the paper
                </p>
              </div>
            </div>
          )}

          {graphData && (
            <Graph3DErrorBoundary
              recoveryNonce={graphRenderNonce}
              onRecover={() => setGraphRenderNonce((current) => current + 1)}
            >
              <ScholarGraph3D key={`graph-${graphRenderNonce}`} ref={graphRef} />
            </Graph3DErrorBoundary>
          )}

          <GraphControls />
          <GraphLegend />

          {/* ─── Bottom Status Bar ─── */}
          {graphData && seedMeta && (
            <div data-testid="graph-status-strip" className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
              <div className="pointer-events-auto inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,8,0.9)] px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <Network className="w-3 h-3 text-[#D4AF37]" />
                <span className="text-[10px] font-mono text-text-primary font-medium">{graphData.nodes.length}</span>
                <span className="text-[10px] font-mono text-[#999999]/50">papers across</span>
                <span className="text-[10px] font-mono text-text-primary font-medium">{graphData.clusters.length}</span>
                <span className="text-[10px] font-mono text-[#999999]/50">topics</span>
              </div>
            </div>
          )}

        </div>

        {/* ─── Right Panel — Push Layout ─── */}
        <AnimatePresence>
          {showPaperDetail && (
            <motion.div
              key="paper-drawer"
              initial={{ width: 0, opacity: isCompactDrawer ? 0 : 1, x: isCompactDrawer ? 24 : 0 }}
              animate={{ width: activeDrawerWidth, opacity: 1, x: 0 }}
              exit={{ width: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className={`overflow-hidden border-l border-[rgba(255,255,255,0.06)] bg-[rgba(10,10,10,0.95)] backdrop-blur-xl ${
                isCompactDrawer
                  ? 'absolute right-0 top-0 bottom-0 z-30 shadow-[-18px_0_40px_rgba(0,0,0,0.35)]'
                  : 'flex-shrink-0'
              }`}
            >
              <div style={{ width: activeDrawerWidth }} className="h-full overflow-y-auto">
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
