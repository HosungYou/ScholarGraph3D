'use client';

import { useEffect, useCallback, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useGraphStore } from '@/hooks/useGraphStore';
import ScholarGraph3D from '@/components/graph/ScholarGraph3D';
import PaperDetailPanel from '@/components/graph/PaperDetailPanel';
import ClusterPanel from '@/components/graph/ClusterPanel';
import SearchBar from '@/components/graph/SearchBar';
import GraphControls from '@/components/graph/GraphControls';
import TrendPanel from '@/components/analysis/TrendPanel';
import GapPanel from '@/components/analysis/GapPanel';
import ChatPanel from '@/components/chat/ChatPanel';
import LLMSettingsModal, {
  loadLLMSettings,
} from '@/components/settings/LLMSettingsModal';
import type { Paper } from '@/types';

type LeftTab = 'clusters' | 'trends' | 'gaps';

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
    setGraphData,
    selectPaper,
    setLoading,
    setError,
    setLLMSettings,
  } = useGraphStore();

  // Local UI state
  const [leftTab, setLeftTab] = useState<LeftTab>('clusters');
  const [showChat, setShowChat] = useState(false);
  const [showLLMModal, setShowLLMModal] = useState(false);

  // Load LLM settings from localStorage on mount
  useEffect(() => {
    const saved = loadLLMSettings();
    if (saved) {
      setLLMSettings(saved);
    }
  }, [setLLMSettings]);

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
    }
  }, [data, setGraphData]);

  useEffect(() => {
    if (queryError) {
      setError(
        queryError instanceof Error ? queryError.message : 'Search failed'
      );
    }
  }, [queryError, setError]);

  const handleExpandPaper = useCallback(
    async (paper: Paper) => {
      try {
        const result = await api.expandPaper(paper.id);
        useGraphStore.getState().addNodes(result.nodes, result.edges);
      } catch (err) {
        console.error('Failed to expand paper:', err);
      }
    },
    []
  );

  // Right panel: show paper detail OR chat
  const showPaperDetail = selectedPaper && !showChat;
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
        {/* Left panel: tabbed sidebar */}
        <div className="w-72 flex-shrink-0 border-r border-border/30 glass flex flex-col">
          {/* Tab buttons */}
          <div className="flex border-b border-border/30 flex-shrink-0">
            {(
              [
                { key: 'clusters', label: 'Clusters' },
                { key: 'trends', label: 'Trends' },
                { key: 'gaps', label: 'Gaps' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setLeftTab(tab.key)}
                className={`flex-1 px-3 py-2.5 text-xs font-medium transition-all relative ${
                  leftTab === tab.key
                    ? 'text-gray-100'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab.label}
                {leftTab === tab.key && (
                  <motion.div
                    layoutId="leftTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {leftTab === 'clusters' && <ClusterPanel />}
            {leftTab === 'trends' && <TrendPanel />}
            {leftTab === 'gaps' && <GapPanel />}
          </div>
        </div>

        {/* Center: 3D Graph */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-text-secondary">
                  Searching papers...
                </p>
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
              <div className="text-center">
                <p className="text-text-secondary text-lg mb-2">
                  Enter a search query to explore
                </p>
                <p className="text-text-secondary/60 text-sm">
                  Try &ldquo;graph neural networks&rdquo; or
                  &ldquo;large language models&rdquo;
                </p>
              </div>
            </div>
          )}

          {graphData && <ScholarGraph3D />}

          {/* Floating controls */}
          <GraphControls />

          {/* Meta info */}
          {graphData && (
            <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-2 text-xs text-text-secondary">
              {graphData.meta.total} papers | {graphData.edges.length} edges |{' '}
              {graphData.clusters.length} clusters
            </div>
          )}
        </div>

        {/* Right panel: paper detail OR chat */}
        <AnimatePresence mode="wait">
          {showPaperDetail && (
            <motion.div
              key="paper-detail"
              initial={{ x: 380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 380, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="w-96 flex-shrink-0 border-l border-border/30 glass overflow-y-auto"
            >
              <PaperDetailPanel
                paper={selectedPaper}
                onClose={() => selectPaper(null)}
                onExpand={() => handleExpandPaper(selectedPaper)}
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
              className="w-96 flex-shrink-0 border-l border-border/30 glass flex flex-col"
            >
              <ChatPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* LLM Settings Modal */}
      <LLMSettingsModal
        isOpen={showLLMModal}
        onClose={() => setShowLLMModal(false)}
      />
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
