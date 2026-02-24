'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { api } from '@/lib/api';
import { MessageCircle, Send, Loader2, Zap } from 'lucide-react';
import type { ChatAction } from '@/types';
import { findCitationPath } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  followups?: string[];
  actions?: ChatAction[];
}

function buildGraphContext(graphData: NonNullable<ReturnType<typeof useGraphStore.getState>['graphData']>) {
  const papers = graphData.nodes.map((n) => ({
    paper_id: n.id,
    title: n.title,
    authors: n.authors.map((a) => (typeof a === 'string' ? a : a.name)),
    year: n.year,
    abstract_snippet: n.abstract ? n.abstract.slice(0, 200) : (n.tldr || undefined),
    fields: n.fields,
    citation_count: n.citation_count,
  }));

  const clusters = graphData.clusters.map((c) => ({
    id: c.id,
    label: c.label,
    paper_count: c.paper_count,
  }));

  return {
    papers,
    clusters,
    total_papers: graphData.meta.total,
  };
}

function getInitialSuggestions(graphData: NonNullable<ReturnType<typeof useGraphStore.getState>['graphData']> | null): string[] {
  if (!graphData) {
    return [
      'What are the main research themes?',
      'Which papers are most influential?',
      'What gaps exist between clusters?',
    ];
  }
  const suggestions = ['What are the main research themes in this graph?'];
  if (graphData.clusters.length >= 2) {
    suggestions.push(`What connects "${graphData.clusters[0].label}" and "${graphData.clusters[1].label}"?`);
  } else {
    suggestions.push('Which papers are most influential and why?');
  }
  suggestions.push('What research gaps or open questions exist?');
  return suggestions;
}

function ActionButtons({ actions, onExecute }: { actions: ChatAction[]; onExecute: (action: ChatAction) => void }) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pl-1">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onExecute(action)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono bg-[#D4AF37]/08 hover:bg-[#D4AF37]/15 text-[#D4AF37]/80 hover:text-[#D4AF37] border border-[#D4AF37]/15 hover:border-[#D4AF37]/30 transition-all"
        >
          <Zap className="w-3 h-3" />
          {action.label || action.type.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  );
}

export default function SeedChatPanel() {
  const { graphData, setHighlightedPaperIds, selectPaper, setActiveTab, setEdgeVisMode, setPathStart, setPathEnd, setActivePath } = useGraphStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const initialSuggestions = getInitialSuggestions(graphData);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    if (!graphData) {
      setError('No graph loaded. Build a graph first to start chatting.');
      return;
    }

    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const graphContext = buildGraphContext(graphData);

      const result = await api.sendSeedChat(trimmed, graphContext, history);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.reply,
        followups: result.suggested_followups,
        actions: result.actions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get response';
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [graphData, messages, isLoading]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  const executeAction = useCallback((action: ChatAction) => {
    if (!graphData) return;

    switch (action.type) {
      case 'highlight_papers':
        if (action.paper_ids) {
          setHighlightedPaperIds(new Set(action.paper_ids));
        }
        break;
      case 'select_paper':
        if (action.paper_id) {
          const paper = graphData.nodes.find((n) => n.id === action.paper_id);
          if (paper) {
            selectPaper(paper);
            window.dispatchEvent(new CustomEvent('focusPaper', { detail: { paperId: paper.id } }));
          }
        }
        break;
      case 'show_cluster':
        if (action.cluster_id != null) {
          setActiveTab('clusters');
          const cluster = graphData.clusters.find((c) => c.id === action.cluster_id);
          if (cluster) {
            const clusterPaperIds = graphData.nodes
              .filter((n) => n.cluster_id === cluster.id)
              .map((n) => n.id);
            setHighlightedPaperIds(new Set(clusterPaperIds));
          }
        }
        break;
      case 'set_edge_mode':
        if (action.mode && ['similarity', 'temporal', 'crossCluster'].includes(action.mode)) {
          setEdgeVisMode(action.mode as 'similarity' | 'temporal' | 'crossCluster');
        }
        break;
      case 'find_path':
        if (action.start && action.end) {
          setPathStart(action.start);
          setPathEnd(action.end);
          const path = findCitationPath(action.start, action.end, graphData.edges);
          setActivePath(path);
        }
        break;
    }
  }, [graphData, setHighlightedPaperIds, selectPaper, setActiveTab, setEdgeVisMode, setPathStart, setPathEnd, setActivePath]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[rgba(10,10,10,0.5)]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#D4AF37]" />
          <span className="hud-label text-[#D4AF37]/60">RESEARCH ASSISTANT</span>
        </div>
        {graphData && (
          <p className="text-[10px] text-[#999999]/35 font-mono mt-1">
            {graphData.nodes.length} papers · {graphData.clusters.length} clusters loaded
          </p>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0"
      >
        {isEmpty && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 px-4">
            <MessageCircle className="w-8 h-8 text-[rgba(255,255,255,0.04)] mb-3" />
            <p className="text-[#999999]/40 text-[10px] font-mono mb-4">
              Ask anything about your paper graph
            </p>
            <div className="w-full space-y-1.5">
              {initialSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  disabled={!graphData}
                  className="w-full text-left text-[10px] px-3 py-2 hud-button-ghost rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>
            {!graphData && (
              <p className="text-[10px] text-[#999999]/25 font-mono mt-4">
                Load a graph to begin
              </p>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className="space-y-2">
            <div
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={
                  msg.role === 'user'
                    ? 'max-w-[85%] px-3 py-2 hud-panel-clean rounded-lg text-xs font-mono bg-[rgba(255,255,255,0.03)] text-white rounded-tr-sm'
                    : 'max-w-[95%] px-3 py-2 hud-panel-clean rounded-lg text-xs font-mono text-[#999999] rounded-tl-sm'
                }
              >
                {msg.role === 'assistant' && (
                  <div className="hud-label text-[#D4AF37]/40 mb-1">
                    ASSISTANT
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>

            {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
              <ActionButtons actions={msg.actions} onExecute={executeAction} />
            )}

            {msg.role === 'assistant' &&
              msg.followups &&
              idx === messages.length - 1 && (
                <div className="space-y-1 pl-1">
                  {msg.followups.map((f, fi) => (
                    <button
                      key={fi}
                      onClick={() => sendMessage(f)}
                      disabled={isLoading}
                      className="block w-full text-left text-[10px] px-2.5 py-1.5 hud-button-ghost rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      + {f}
                    </button>
                  ))}
                </div>
              )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 hud-panel-clean rounded-lg rounded-tl-sm">
              <div className="flex items-center gap-2 text-[#D4AF37]/50">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="hud-label">THINKING...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/30 text-red-300/80 text-[10px] font-mono">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3">
        <div className="hud-panel-clean rounded-lg p-2">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={graphData ? 'Ask about your graph...' : 'Load a graph first...'}
              disabled={!graphData || isLoading}
              rows={2}
              className="flex-1 resize-none bg-transparent border-none rounded-lg px-2 py-1.5 text-xs font-mono text-white placeholder-[#999999]/25 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            />
            <button
              type="submit"
              disabled={!graphData || isLoading || !input.trim()}
              className="hud-button flex-shrink-0 p-2 rounded-lg disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
        <p className="text-[9px] text-[#999999]/25 font-mono mt-1.5 text-center">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
