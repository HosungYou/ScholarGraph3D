'use client';

import { useEffect, useCallback, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useGraphStore } from '@/hooks/useGraphStore';
import ScholarGraph3D, { type ScholarGraph3DRef } from '@/components/graph/ScholarGraph3D';
import PaperDetailPanel from '@/components/graph/PaperDetailPanel';
import ClusterPanel from '@/components/graph/ClusterPanel';
import GraphControls from '@/components/graph/GraphControls';
import type { Paper, CitationIntent } from '@/types';
import { Search, ArrowLeft, Loader2, Network, GitBranch, Layers, Share2 } from 'lucide-react';

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
  } = useGraphStore();

  const graphRef = useRef<ScholarGraph3DRef>(null);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandSuccess, setExpandSuccess] = useState<string | null>(null);
  const [seedMeta, setSeedMeta] = useState<{
    seed_title?: string;
    seed_paper_id?: string;
    total?: number;
    citation_edges?: number;
    similarity_edges?: number;
  } | null>(null);

  // Panel resize — left
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seed-left-panel-width');
      return saved ? Math.min(500, Math.max(240, Number(saved))) : 360;
    }
    return 360;
  });
  const leftResizeRef = useRef(false);
  const handleLeftPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    leftResizeRef.current = true;
    const startX = e.clientX;
    const startWidth = leftPanelWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!leftResizeRef.current) return;
      const newWidth = Math.min(500, Math.max(240, startWidth + (ev.clientX - startX)));
      setLeftPanelWidth(newWidth);
      localStorage.setItem('seed-left-panel-width', String(newWidth));
    };
    const onMouseUp = () => {
      leftResizeRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [leftPanelWidth]);

  // Panel resize — right
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seed-right-panel-width');
      return saved ? Math.min(700, Math.max(320, Number(saved))) : 520;
    }
    return 520;
  });
  const rightResizeRef = useRef(false);
  const handleRightPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    rightResizeRef.current = true;
    const startX = e.clientX;
    const startWidth = rightPanelWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!rightResizeRef.current) return;
      const newWidth = Math.min(700, Math.max(320, startWidth - (ev.clientX - startX)));
      setRightPanelWidth(newWidth);
      localStorage.setItem('seed-right-panel-width', String(newWidth));
    };
    const onMouseUp = () => {
      rightResizeRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [rightPanelWidth]);

  // Fetch seed graph
  useEffect(() => {
    if (!paperId) return;
    setLoading(true);
    setError(null);

    api.seedExplore(paperId, { depth, max_papers: 80 })
      .then((data) => {
        setGraphData(data);
        setSeedMeta(data.meta as any);

        // Extract citation intents from edges for ScholarGraph3D coloring
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
      })
      .catch((err) => {
        console.error('Seed explore failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to build seed graph');
      })
      .finally(() => setLoading(false));
  }, [paperId, depth, setGraphData, setLoading, setError]);

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

  // Double-click expand
  useEffect(() => {
    const handle = async (e: Event) => {
      const { paper } = (e as CustomEvent<{ paper: Paper }>).detail;
      await handleExpandPaper(paper);
    };
    window.addEventListener('expandPaper', handle);
    return () => window.removeEventListener('expandPaper', handle);
  }, [graphData]);

  const handleExpandPaper = useCallback(
    async (paper: Paper) => {
      const expandId = paper.s2_paper_id || (paper.doi ? `DOI:${paper.doi}` : '');
      if (!expandId) {
        setExpandError('Cannot expand: no Semantic Scholar ID');
        setTimeout(() => setExpandError(null), 4000);
        return;
      }
      setIsExpanding(true);
      try {
        const result = await api.expandPaperStable(expandId, graphData?.nodes || [], graphData?.edges || []);
        const count = result.nodes.length;

        if (count > 0) {
          // Get parent node position for expand animation
          const parentNode = graphData?.nodes.find(
            n => n.s2_paper_id === expandId ||
                 (n.doi && `DOI:${n.doi}` === expandId) ||
                 n.id === paper.id
          );
          const ox = parentNode?.x ?? 0;
          const oy = parentNode?.y ?? 0;
          const oz = parentNode?.z ?? 0;

          // Save final target positions
          const targets = new Map(
            result.nodes.map(n => [n.id, { x: n.x, y: n.y, z: n.z }])
          );

          // Add nodes at parent position, then animate via ForceGraph3D internals
          const nodesAtOrigin = result.nodes.map(n => ({
            ...n,
            x: ox,
            y: oy,
            z: oz,
          }));
          const newNodeIds = result.nodes.map(n => n.id);
          useGraphStore.getState().addNodesStable(nodesAtOrigin, result.edges);

          // Wait one tick for ForceGraph3D to ingest new nodes, then animate
          setTimeout(() => {
            graphRef.current?.animateExpandNodes(
              parentNode?.id || paper.id,
              newNodeIds,
              targets
            );
          }, 50);

          setExpandSuccess(`${count} papers added`);
        } else {
          setExpandSuccess('No new papers found');
        }
        setTimeout(() => setExpandSuccess(null), 3000);
      } catch (err) {
        setExpandError(err instanceof Error ? err.message : 'Failed to expand');
        setTimeout(() => setExpandError(null), 4000);
      } finally {
        setIsExpanding(false);
      }
    },
    [graphData]
  );

  const handlePaperSelect = useCallback((paper: Paper | null) => {
    selectPaper(paper);
  }, [selectPaper]);

  const showPaperDetail = !!selectedPaper;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-border/50 glass-strong z-20">
        <div className="flex items-center gap-4 px-4 py-3">
          <a href="/" className="text-lg font-bold text-accent flex-shrink-0">
            SG3D
          </a>
          <span className="text-text-secondary/40">|</span>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Network className="w-4 h-4 text-purple-400" />
            <span className="font-medium text-text-primary">Seed Paper Mode</span>
          </div>

          {seedMeta?.seed_title && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-secondary truncate max-w-md">
                {seedMeta.seed_title}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <button
              onClick={() => router.push('/explore')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-gray-700"
            >
              <Search className="w-3.5 h-3.5" />
              Keyword Search
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-gray-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Home
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left panel: clusters */}
        <div
          style={{ width: leftPanelWidth }}
          className="flex-shrink-0 border-r border-border/30 glass flex flex-col relative"
        >
          <div className="p-3 border-b border-border/30">
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Clusters
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ClusterPanel />
          </div>
          {/* Resize handle */}
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors z-10"
            onMouseDown={handleLeftPanelResizeStart}
          />
        </div>

        {/* Center: 3D Graph */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-purple-400 mx-auto mb-4" />
                <p className="text-sm text-text-secondary mb-1">Building citation network...</p>
                <p className="text-xs text-text-secondary/50">Fetching references & citations from Semantic Scholar</p>
              </div>
            </div>
          )}

          {!isLoading && !graphData && paperId && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-text-secondary">No results found</p>
            </div>
          )}

          {!paperId && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md px-4">
                <Network className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Seed Paper Exploration
                </h2>
                <p className="text-text-secondary/70 text-sm mb-6">
                  Start from a single paper and explore its citation network
                </p>
                <p className="text-text-secondary/50 text-xs">
                  Enter a DOI or Semantic Scholar ID on the home page to begin
                </p>
              </div>
            </div>
          )}

          {graphData && <ScholarGraph3D ref={graphRef} />}
          <GraphControls />

          {/* Seed paper info bar */}
          {graphData && seedMeta && (
            <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-2 text-xs text-text-secondary space-y-0.5">
              <div className="flex items-center gap-2">
                <Network className="w-3.5 h-3.5 text-purple-400" />
                <span>{graphData.nodes.length} papers</span>
                <span className="text-text-secondary/30">|</span>
                <GitBranch className="w-3.5 h-3.5" />
                <span>{graphData.edges.filter(e => e.type === 'citation').length} citations</span>
                <span className="text-text-secondary/30">|</span>
                <Share2 className="w-3.5 h-3.5 text-blue-400" />
                <span>{graphData.edges.filter(e => e.type === 'similarity').length} similar</span>
                <span className="text-text-secondary/30">|</span>
                <Layers className="w-3.5 h-3.5" />
                <span>{graphData.clusters.length} clusters</span>
              </div>
              <div className="text-[10px] text-text-secondary/50">
                Double-click a node to expand its citations
              </div>
            </div>
          )}
        </div>

        {/* Right panel: paper detail */}
        <AnimatePresence mode="popLayout">
          {showPaperDetail && (
            <motion.div
              key="paper-detail"
              initial={{ x: 380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 380, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              style={{ width: rightPanelWidth }}
              className="flex-shrink-0 border-l border-border/30 glass overflow-y-auto relative"
            >
              <div
                className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors z-10"
                onMouseDown={handleRightPanelResizeStart}
              />
              <PaperDetailPanel
                paper={selectedPaper}
                onClose={() => handlePaperSelect(null)}
                onExpand={() => handleExpandPaper(selectedPaper)}
                isExpanding={isExpanding}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Toasts */}
      {expandError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-900/90 border border-red-700/50 text-red-200 px-4 py-3 rounded-lg text-sm max-w-sm shadow-xl">
          {expandError}
        </div>
      )}
      {expandSuccess && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-900/90 border border-green-700/50 text-green-200 px-4 py-3 rounded-lg text-sm max-w-sm shadow-xl">
          {expandSuccess}
        </div>
      )}
    </div>
  );
}

export default function SeedExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SeedExploreContent />
    </Suspense>
  );
}
