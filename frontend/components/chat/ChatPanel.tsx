'use client';

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { api } from '@/lib/api';
import type { ChatMessage, ChatResponse } from '@/types';

// ─── Simple markdown renderer ────────────────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-900 rounded p-2 my-2 text-xs overflow-x-auto"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1 py-0.5 rounded text-xs">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-100">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n/g, '<br />');

  return html;
}

// ─── Citation marker component ───────────────────────────────────────

function CitationMarker({
  index,
  paperId,
  title,
  onClickCitation,
}: {
  index: number;
  paperId: string;
  title: string;
  onClickCitation: (paperId: string) => void;
}) {
  return (
    <button
      onClick={() => onClickCitation(paperId)}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 text-xs font-medium hover:bg-blue-600/50 transition-colors mx-0.5 align-super"
      title={title}
    >
      {index}
    </button>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────

function MessageBubble({
  message,
  onClickCitation,
}: {
  message: ChatMessage;
  onClickCitation: (paperId: string) => void;
}) {
  const isUser = message.role === 'user';

  // Process content to insert citation markers
  const processedContent = useMemo(() => {
    let content = message.content;
    if (message.citations && message.citations.length > 0) {
      // Replace [N] patterns with citation data attributes
      message.citations.forEach((cit) => {
        const marker = `[${cit.index}]`;
        const replacement = `<span data-citation-index="${cit.index}" data-paper-id="${cit.paper_id}" data-title="${cit.title.replace(/"/g, '&quot;')}" class="citation-marker"></span>`;
        content = content.replace(marker, replacement);
      });
    }
    return renderMarkdown(content);
  }, [message.content, message.citations]);

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2.5 ${
          isUser
            ? 'bg-blue-600/20 border border-blue-600/30 text-gray-100'
            : 'bg-gray-800 border border-gray-700/50 text-gray-200'
        }`}
      >
        {isUser ? (
          <div className="text-sm">{message.content}</div>
        ) : (
          <div className="text-sm leading-relaxed">
            <MessageContent
              html={processedContent}
              citations={message.citations || []}
              onClickCitation={onClickCitation}
            />
          </div>
        )}
        <div
          className={`text-xs mt-1.5 ${
            isUser ? 'text-blue-400/50' : 'text-gray-500'
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Message content with citation handling ──────────────────────────

function MessageContent({
  html,
  citations,
  onClickCitation,
}: {
  html: string;
  citations: { paper_id: string; title: string; index: number }[];
  onClickCitation: (paperId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Attach click handlers to citation markers
    const markers = containerRef.current.querySelectorAll('.citation-marker');
    markers.forEach((marker) => {
      const el = marker as HTMLElement;
      const index = el.dataset.citationIndex;
      const paperId = el.dataset.paperId;
      const title = el.dataset.title;

      if (index && paperId && title) {
        // Create a button element
        const btn = document.createElement('button');
        btn.className =
          'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 text-xs font-medium hover:bg-blue-600/50 transition-colors mx-0.5 align-super';
        btn.textContent = index;
        btn.title = title;
        btn.onclick = () => onClickCitation(paperId);
        el.replaceWith(btn);
      }
    });
  }, [html, citations, onClickCitation]);

  return (
    <div
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Streaming indicator ─────────────────────────────────────────────

function StreamingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-gray-800 border border-gray-700/50 rounded-lg px-3 py-2.5">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <div
            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"
            style={{ animationDelay: '0.2s' }}
          />
          <div
            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"
            style={{ animationDelay: '0.4s' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatPanel ──────────────────────────────────────────────────

export default function ChatPanel() {
  const {
    graphData,
    chatMessages,
    llmSettings,
    addChatMessage,
    clearChat,
    selectPaper,
    setHighlightedPaperIds,
  } = useGraphStore();

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [suggestedFollowups, setSuggestedFollowups] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingContent]);

  // Handle citation click -> highlight paper in 3D
  const handleCitationClick = useCallback(
    (paperId: string) => {
      if (!graphData) return;
      const paper = graphData.nodes.find((n) => n.id === paperId);
      if (paper) {
        selectPaper(paper);
        setHighlightedPaperIds(new Set([paperId]));
      }
    },
    [graphData, selectPaper, setHighlightedPaperIds]
  );

  // Send message
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !graphData || !llmSettings || isStreaming) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    addChatMessage(userMessage);
    setInput('');
    setSuggestedFollowups([]);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      // Try streaming first, fall back to non-streaming
      let fullContent = '';

      try {
        await api.streamChatMessage(
          trimmed,
          graphData,
          llmSettings,
          chatMessages,
          (chunk: string) => {
            fullContent += chunk;
            setStreamingContent(fullContent);
          }
        );

        // After streaming completes, add the full message
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
        };
        addChatMessage(assistantMessage);
      } catch {
        // Fallback to non-streaming
        const response: ChatResponse = await api.sendChatMessage(
          trimmed,
          graphData,
          llmSettings,
          chatMessages
        );

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: response.answer,
          citations: response.citations,
          highlighted_papers: response.highlighted_papers,
          timestamp: new Date().toISOString(),
        };

        addChatMessage(assistantMessage);
        setSuggestedFollowups(response.suggested_followups);

        // Highlight cited papers
        if (response.highlighted_papers.length > 0) {
          setHighlightedPaperIds(new Set(response.highlighted_papers));
        }
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${
          err instanceof Error ? err.message : 'Failed to get response'
        }`,
        timestamp: new Date().toISOString(),
      };
      addChatMessage(errorMessage);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [
    input,
    graphData,
    llmSettings,
    isStreaming,
    chatMessages,
    addChatMessage,
    setHighlightedPaperIds,
  ]);

  // Handle enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Handle follow-up click
  const handleFollowup = useCallback(
    (text: string) => {
      setInput(text);
      // Auto-focus input
      inputRef.current?.focus();
    },
    []
  );

  const hasLLM = !!llmSettings;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">Chat</span>
          {hasLLM && (
            <span className="rounded-full px-2 py-0.5 text-xs bg-green-900/30 text-green-400 border border-green-800/40">
              {llmSettings!.provider}
            </span>
          )}
        </div>
        {chatMessages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {chatMessages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-3xl mb-3 opacity-30">&#128172;</div>
            <p className="text-sm text-gray-400 mb-1">
              Ask about the research field, trends, or gaps
            </p>
            <p className="text-xs text-gray-500">
              {hasLLM
                ? 'AI will analyze your graph data to answer'
                : 'Configure LLM settings first'}
            </p>

            {/* Starter suggestions */}
            {hasLLM && graphData && (
              <div className="mt-4 space-y-1.5 w-full max-w-xs">
                {[
                  'What are the main research themes?',
                  'Which papers are most influential?',
                  'What gaps exist in this field?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleFollowup(suggestion)}
                    className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700/50 rounded-lg text-xs text-gray-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            onClickCitation={handleCitationClick}
          />
        ))}

        {/* Streaming content */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[85%] bg-gray-800 border border-gray-700/50 rounded-lg px-3 py-2.5">
              <div
                className="text-sm text-gray-200 leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(streamingContent),
                }}
              />
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && <StreamingIndicator />}

        {/* Suggested follow-ups */}
        {suggestedFollowups.length > 0 && !isStreaming && (
          <div className="mt-2 mb-2">
            <div className="text-xs text-gray-500 mb-1.5">
              Suggested follow-ups
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestedFollowups.map((text, i) => (
                <button
                  key={i}
                  onClick={() => handleFollowup(text)}
                  className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-750 border border-gray-700/50 rounded-full text-xs text-gray-300 transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-gray-700/50">
        {!hasLLM ? (
          <div className="text-center py-2">
            <p className="text-xs text-gray-500">
              Configure LLM settings to start chatting
            </p>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this research..."
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-600 resize-none max-h-24"
              style={{
                height: 'auto',
                minHeight: '38px',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height =
                  Math.min(target.scrollHeight, 96) + 'px';
              }}
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isStreaming ? '...' : '&#9654;'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
