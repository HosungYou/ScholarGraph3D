'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { api } from '@/lib/api';
import { MessageCircle, Send, Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  followups?: string[];
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

export default function SeedChatPanel() {
  const { graphData } = useGraphStore();
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

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[rgba(4,8,18,0.5)]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[rgba(0,229,255,0.08)]">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#00E5FF]" />
          <span className="hud-label text-[#00E5FF]/60">RESEARCH ASSISTANT</span>
        </div>
        {graphData && (
          <p className="text-[10px] text-[#7B8CDE]/35 font-mono mt-1">
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
            <MessageCircle className="w-8 h-8 text-[rgba(0,229,255,0.08)] mb-3" />
            <p className="text-[#7B8CDE]/40 text-[10px] font-mono mb-4">
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
              <p className="text-[10px] text-[#7B8CDE]/25 font-mono mt-4">
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
                    ? 'max-w-[85%] px-3 py-2 hud-panel-clean rounded-lg text-xs font-mono bg-[rgba(0,229,255,0.06)] text-[#E8EAF6] rounded-tr-sm'
                    : 'max-w-[95%] px-3 py-2 hud-panel-clean rounded-lg text-xs font-mono text-[#a29bfe]/90 rounded-tl-sm'
                }
              >
                {msg.role === 'assistant' && (
                  <div className="hud-label text-[#00E5FF]/40 mb-1">
                    ASSISTANT
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>

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
              <div className="flex items-center gap-2 text-[#00E5FF]/50">
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
              className="flex-1 resize-none bg-transparent border-none rounded-lg px-2 py-1.5 text-xs font-mono text-[#E8EAF6] placeholder-[#7B8CDE]/25 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
        <p className="text-[9px] text-[#7B8CDE]/25 font-mono mt-1.5 text-center">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
