'use client';

import { useEffect, useCallback, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useGraphStore } from '@/hooks/useGraphStore';
import ScholarGraph3D, { type ScholarGraph3DRef } from '@/components/graph/ScholarGraph3D';
import PaperDetailPanel from '@/components/graph/PaperDetailPanel';
import ClusterPanel from '@/components/graph/ClusterPanel';
import SearchBar from '@/components/graph/SearchBar';
import GraphControls from '@/components/graph/GraphControls';
import GraphLegend from '@/components/graph/GraphLegend';
import ChatPanel from '@/components/chat/ChatPanel';
import LLMSettingsModal, {
  loadLLMSettings,
} from '@/components/settings/LLMSettingsModal';
import CitationContextModal from '@/components/graph/CitationContextModal';
import type { Paper } from '@/types';

function ExploreContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const yearMin = searchParams.get('year_min')
    ? Number(searchParams.get('year_min'))
    : undefined;
  const yearMax = searchParams.get('year_max')
    ? Number(searchParams.get('year_max'))
    : undefined;
  const field = searchParams.get('field') || undefined;

  const {
    graphData,
    selectedPaper,
    isLoading,
    llmSettings,
    showEnhancedIntents,
    setGraphData,
    selectPaper,
    setLoading,
    setError,
    setLLMSettings,
  } = useGraphStore();

  // Graph ref for camera control
  const graphRef = useRef<ScholarGraph3DRef>(null);

  // Local UI state
  const [showChat, setShowChat] = useState(false);
  const [showLLMModal, setShowLLMModal] = useState(false);
  const [citationModalData, setCitationModalData] = useState<{
    sourceId: string;
    targetId: string;
    type: string;
    intent?: string;
    weight?: number;
  } | null>(null);
  const [searchProgress, setSearchProgress] = useState<{
    stage: string;
    progress: number;
    message: string;
  } | null>(null);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandSuccess, setExpandSuccess] = useState<string | null>(null);

  // Panel resize state
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 320;
    return parseInt(localStorage.getItem('sg3d-left-panel-width') || '320');
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 440;
    return parseInt(localStorage.getItem('sg3d-right-panel-width') || '440');
  });
  const leftResizeRef = useRef<boolean>(false);
  const rightResizeRef = useRef<boolean>(false);

  // Left panel resize
  const handleLeftPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    leftResizeRef.current = true;
    const startX = e.clientX;
    const startWidth = leftPanelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!leftResizeRef.current) return;
      const newWidth = Math.min(640, Math.max(180, startWidth + ev.clientX - startX));
      setLeftPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      leftResizeRef.current = false;
      setLeftPanelWidth((w) => {
        localStorage.setItem('sg3d-left-panel-width', String(w));
        return w;
      });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [leftPanelWidth]);

  // Right panel resize
  const handleRightPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    rightResizeRef.current = true;
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!rightResizeRef.current) return;
      const newWidth = Math.min(700, Math.max(280, startWidth - (ev.clientX - startX)));
      setRightPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      rightResizeRef.current = false;
      setRightPanelWidth((w) => {
        localStorage.setItem('sg3d-right-panel-width', String(w));
        return w;
      });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [rightPanelWidth]);

  // Load LLM settings from localStorage on mount
  useEffect(() => {
    const saved = loadLLMSettings();
    if (saved) {
      setLLMSettings(saved);
    }
  }, [setLLMSettings]);

  // Wire up camera control custom events from GraphControls + ClusterPanel
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

  // Handle double-click expand from ScholarGraph3D
  useEffect(() => {
    const handle = async (e: Event) => {
      const { paper } = (e as CustomEvent<{ paper: Paper }>).detail;
      try {
        // Try s2_paper_id first, then DOI, then title-based lookup
        const expandId = paper.s2_paper_id || (paper.doi ? `DOI:${paper.doi}` : '');
        if (!expandId) {
          setExpandError('Cannot expand: no Semantic Scholar ID or DOI available');
          setTimeout(() => setExpandError(null), 4000);
          return;
        }
        const result = await api.expandPaperStable(expandId, graphData?.nodes || [], graphData?.edges || []);
        useGraphStore.getState().addNodesStable(result.nodes, result.edges);
      } catch (err) {
        console.error('Failed to expand paper:', err);
        setExpandError(err instanceof Error ? err.message : 'Failed to expand paper');
        setTimeout(() => setExpandError(null), 4000);
      }
    };
    window.addEventListener('expandPaper', handle);
    return () => window.removeEventListener('expandPaper', handle);
  }, [graphData]);

  // Listen for citation edge clicks from ScholarGraph3D
  useEffect(() => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCitationModalData(detail);
    };
    window.addEventListener('citationEdgeClick', handle);
    return () => window.removeEventListener('citationEdgeClick', handle);
  }, []);

  const { data, isLoading: queryLoading, error: queryError } = useQuery({
    queryKey: ['search', query, yearMin, yearMax, field],
    queryFn: () =>
      api.search(query, {
        year_min: yearMin,
        year_max: yearMax,
        field,
      }),
    enabled: !!query,
  });

  useEffect(() => {
    setLoading(queryLoading);
  }, [queryLoading, setLoading]);

  useEffect(() => {
    if (data) {
      setGraphData(data);
      // Log search for personalization (fire-and-forget)
      if (query) {
        api.logSearch(query, 'keyword', data.nodes.length, {
          ...(yearMin && { year_min: yearMin }),
          ...(yearMax && { year_max: yearMax }),
          ...(field && { field }),
        });
      }
    }
  }, [data, setGraphData, query, yearMin, yearMax, field]);

  useEffect(() => {
    if (queryError) {
      setError(
        queryError instanceof Error ? queryError.message : 'Search failed'
      );
    }
  }, [queryError, setError]);

  // SSE search progress stream
  useEffect(() => {
    if (!query || !queryLoading) {
      setSearchProgress(null);
      return;
    }

    const params = new URLSearchParams({ q: query });
    if (yearMin) params.set('year_min', String(yearMin));
    if (yearMax) params.set('year_max', String(yearMax));

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const es = new EventSource(`${API_BASE}/api/search/stream?${params}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setSearchProgress(data);
        if (data.stage === 'complete') {
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      setSearchProgress(null);
    };

    return () => {
      es.close();
      setSearchProgress(null);
    };
  }, [query, queryLoading, yearMin, yearMax]);

  // Handle DOI-based navigation from landing page
  const doi = searchParams.get('doi');
  useEffect(() => {
    if (!doi) return;
    api.getPaperByDOI(doi).then((result) => {
      if (result.redirect_query) {
        const params = new URLSearchParams();
        params.set('q', result.redirect_query);
        window.location.replace(`/explore?${params.toString()}`);
      }
    }).catch((err) => {
      console.error('DOI lookup failed:', err);
      setError('Could not find paper for this DOI');
      setTimeout(() => setError(null), 4000);
    });
  }, [doi]);

  const handleExpandPaper = useCallback(
    async (paper: Paper) => {
      const expandId = paper.s2_paper_id || (paper.doi ? `DOI:${paper.doi}` : '');
      if (!expandId) {
        setExpandError('Cannot expand: no Semantic Scholar ID or DOI available');
        setTimeout(() => setExpandError(null), 4000);
        return;
      }
      setIsExpanding(true);
      setExpandError(null);
      setExpandSuccess(null);
      try {
        const result = await api.expandPaperStable(expandId, graphData?.nodes || [], graphData?.edges || []);
        useGraphStore.getState().addNodesStable(result.nodes, result.edges);
        api.logInteraction({ paper_id: paper.id, action: 'expand_citations' });
        const addedCount = result.nodes.length;
        if (addedCount > 0) {
          setExpandSuccess(`${addedCount} papers added`);
          setTimeout(() => setExpandSuccess(null), 3000);
        } else {
          setExpandSuccess('No new papers found');
          setTimeout(() => setExpandSuccess(null), 3000);
        }
      } catch (err) {
        console.error('Failed to expand paper:', err);
        const msg = err instanceof Error ? err.message : 'Failed to expand paper citations';
        if (msg.includes('No Semantic Scholar')) {
          setExpandError('Cannot expand: paper not found in Semantic Scholar');
        } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Network')) {
          setExpandError('Network error: please check your connection and try again');
        } else {
          setExpandError(msg);
        }
        setTimeout(() => setExpandError(null), 5000);
      } finally {
        setIsExpanding(false);
      }
    },
    [setExpandError, graphData]
  );

  const handlePaperSelect = useCallback((paper: Paper | null) => {
    selectPaper(paper);
    if (paper) {
      api.logInteraction({ paper_id: paper.id, action: 'view' });
      // Auto-load citation intents for selected paper
      if (paper.s2_paper_id) {
        const enhanced = showEnhancedIntents;
        const llm = useGraphStore.getState().llmSettings;
        api.getCitationIntents(paper.s2_paper_id, enhanced, llm || undefined)
          .then((intents) => {
            useGraphStore.getState().setCitationIntents(intents);
          })
          .catch((err) => {
            console.warn('Failed to load citation intents:', err);
          });
      }
    }
  }, [selectPaper, showEnhancedIntents]);

  // Right panel: both can show simultaneously as independent columns
  const showPaperDetail = !!selectedPaper;
  const showChatPanel = showChat;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar with search */}
      <div className="flex-shrink-0 border-b border-border/50 glass-strong z-20">
        <div className="flex items-center gap-4 px-4 py-3">
          <a href="/" className="text-lg font-bold text-accent flex-shrink-0">
            SG3D
          </a>
          <SearchBar />

          {/* AI Analysis toolbar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Chat toggle */}
            <button
              onClick={() => setShowChat(!showChat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showChat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-gray-700'
              }`}
              title="Toggle AI Chat"
            >
              &#128172; Chat
            </button>

            {/* LLM Settings */}
            <button
              onClick={() => setShowLLMModal(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                llmSettings
                  ? 'bg-green-900/20 text-green-400 border-green-800/40 hover:bg-green-900/30'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200 hover:bg-gray-700'
              }`}
              title="LLM Settings"
            >
              &#9881; {llmSettings ? llmSettings.provider : 'LLM'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left panel: clusters */}
        <div style={{ width: leftPanelWidth }} className="flex-shrink-0 border-r border-border/30 glass flex flex-col relative">
          <div className="flex-1 overflow-y-auto">
            <ClusterPanel />
          </div>

          {/* Left panel drag handle */}
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors z-10"
            onMouseDown={handleLeftPanelResizeStart}
          />
        </div>

        {/* Center: 3D Graph */}
        <div className="flex-1 flex flex-col relative">
          <div className="relative flex-1">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
              <div className="text-center max-w-sm w-full px-8">
                <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                {searchProgress ? (
                  <>
                    <p className="text-sm text-text-secondary mb-3">{searchProgress.message}</p>
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div
                        className="bg-accent h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${searchProgress.progress * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-secondary/50 mt-2">{Math.round(searchProgress.progress * 100)}%</p>
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">Searching papers...</p>
                )}
              </div>
            </div>
          )}

          {!isLoading && !graphData && query && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-text-secondary">
                No results found for &ldquo;{query}&rdquo;
              </p>
            </div>
          )}

          {!query && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-lg px-4">
                <div className="text-4xl mb-4">🔭</div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Explore Academic Literature in 3D
                </h2>
                <p className="text-text-secondary/70 text-sm mb-6">
                  Search papers → 3D graph appears → click nodes to explore
                </p>
                <p className="text-text-secondary/50 text-xs mb-4">
                  Nodes = papers · Distance = semantic similarity · Clusters = research topics
                </p>
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {[
                    'transformer architecture',
                    'AI adoption healthcare',
                    'climate change impacts',
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set('q', example);
                        window.location.href = `/explore?${params.toString()}`;
                      }}
                      className="px-4 py-2 bg-surface/80 hover:bg-surface border border-border/40 rounded-full text-sm text-text-secondary hover:text-text-primary transition-all"
                    >
                      {example}
                    </button>
                  ))}
                </div>
                <p className="text-text-secondary/40 text-xs">
                  💡 Tip: Use the 🤖 AI Search mode with a Groq API key for natural language queries
                </p>
              </div>
            </div>
          )}

          {graphData && <ScholarGraph3D ref={graphRef} />}

          {/* Floating controls */}
          <GraphControls />

          {/* Meta info */}
          {graphData && (
            <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-2 text-xs text-text-secondary">
              {graphData.meta.total} papers | {graphData.edges.filter(e => e.type === 'citation').length} citation | {graphData.edges.filter(e => e.type === 'similarity').length} similarity | {graphData.clusters.length} clusters
            </div>
          )}

          {/* Legend */}
          {graphData && <GraphLegend />}

          </div>
        </div>

        {/* Right panel: paper detail and chat as independent columns */}
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
              {/* Right panel drag handle */}
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

          {showChatPanel && (
            <motion.div
              key="chat-panel"
              initial={{ x: 380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 380, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              style={{ width: rightPanelWidth }}
              className="flex-shrink-0 border-l border-border/30 glass flex flex-col relative"
            >
              {/* Right panel drag handle */}
              <div
                className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors z-10"
                onMouseDown={handleRightPanelResizeStart}
              />
              <ChatPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Citation Context Modal */}
      {citationModalData && (
        <CitationContextModal
          sourceId={citationModalData.sourceId}
          targetId={citationModalData.targetId}
          type={citationModalData.type}
          intent={citationModalData.intent}
          weight={citationModalData.weight}
          onClose={() => setCitationModalData(null)}
          onViewSourcePaper={(id) => {
            const paper = graphData?.nodes.find((n) => n.id === id);
            if (paper) handlePaperSelect(paper);
            setCitationModalData(null);
          }}
          onViewTargetPaper={(id) => {
            const paper = graphData?.nodes.find((n) => n.id === id);
            if (paper) handlePaperSelect(paper);
            setCitationModalData(null);
          }}
        />
      )}

      {/* LLM Settings Modal */}
      <LLMSettingsModal
        isOpen={showLLMModal}
        onClose={() => setShowLLMModal(false)}
      />

      {/* Expand error toast */}
      {expandError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-900/90 border border-red-700/50 text-red-200 px-4 py-3 rounded-lg text-sm max-w-sm shadow-xl">
          ⚠️ {expandError}
        </div>
      )}

      {/* Expand success toast */}
      {expandSuccess && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-900/90 border border-green-700/50 text-green-200 px-4 py-3 rounded-lg text-sm max-w-sm shadow-xl">
          {expandSuccess}
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ExploreContent />
    </Suspense>
  );
}
