'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Copy,
  Check,
  X,
  Loader2,
  BookOpen,
  BarChart3,
  Search,
  Clock,
  ChevronRight,
  AlertCircle,
  Settings2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useGraphStore } from '@/hooks/useGraphStore';

const PROGRESS_MESSAGES = [
  'Analyzing clusters...',
  'Identifying key themes...',
  'Writing sections...',
  'Formatting citations...',
  'Finalizing review...',
];

/** Very basic Markdown to HTML for rendering review content. */
function markdownToHtml(md: string): string {
  return md
    // headings
    .replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold text-gray-200 mt-5 mb-2">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-gray-100 mt-6 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-gray-100 mt-8 mb-3 pb-2 border-b border-gray-700">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-gray-50 mt-6 mb-4">$1</h1>')
    // bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-blue-300 px-1 py-0.5 rounded text-sm">$1</code>')
    // blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-blue-500 pl-3 text-gray-400 italic my-2">$1</blockquote>')
    // unordered list
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-300 my-0.5">$1</li>')
    // ordered list
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-gray-300 my-0.5">$1</li>')
    // horizontal rule
    .replace(/^---$/gm, '<hr class="border-gray-700 my-4" />')
    // paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="text-gray-300 leading-relaxed my-2">')
    // single newline within text (preserve)
    .replace(/\n/g, '<br />');
}

/** Extract headings from markdown for TOC. */
function extractHeadings(md: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const regex = /^(#{1,3}) (.+)$/gm;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const level = match[1].length;
    const text = match[2];
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    headings.push({ level, text, id });
  }
  return headings;
}

interface LitReviewPanelProps {
  onClose: () => void;
}

export default function LitReviewPanel({ onClose }: LitReviewPanelProps) {
  const { graphData, llmSettings, litReview, setLitReview } = useGraphStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressIdx, setProgressIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Options
  const [includeTrends, setIncludeTrends] = useState(true);
  const [includeGaps, setIncludeGaps] = useState(true);
  const [citationStyle, setCitationStyle] = useState('APA');

  const contentRef = useRef<HTMLDivElement>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // TOC from lit review markdown
  const headings = useMemo(() => {
    if (!litReview?.markdown) return [];
    return extractHeadings(litReview.markdown);
  }, [litReview]);

  // Rendered HTML
  const reviewHtml = useMemo(() => {
    if (!litReview?.markdown) return '';
    return markdownToHtml(litReview.markdown);
  }, [litReview]);

  // Progress animation during generation
  useEffect(() => {
    if (isGenerating) {
      setProgressIdx(0);
      progressInterval.current = setInterval(() => {
        setProgressIdx((prev) =>
          prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev
        );
      }, 4000);
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!graphData || !llmSettings) return;

    setIsGenerating(true);
    setError(null);
    try {
      const review = await api.generateLitReview(graphData, llmSettings, {
        includeTrends,
        includeGaps,
        citationStyle,
      });
      setLitReview(review);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate literature review'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPdf = async () => {
    if (!litReview?.markdown) return;
    setIsExporting(true);
    try {
      const blob = await api.exportLitReviewPdf(litReview.markdown);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${litReview.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}_review.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to export PDF'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!litReview?.markdown) return;
    try {
      await navigator.clipboard.writeText(litReview.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = litReview.markdown;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const scrollToHeading = (id: string) => {
    if (!contentRef.current) return;
    const el = contentRef.current.querySelector(`[data-heading-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const noLLM = !llmSettings;
  const noGraph = !graphData || graphData.nodes.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm">
      {/* Main panel */}
      <div className="flex flex-1 max-w-6xl mx-auto my-4 bg-gray-900 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
        {/* TOC Sidebar */}
        {litReview && headings.length > 0 && (
          <div className="w-56 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Contents
            </h4>
            <nav className="space-y-1">
              {headings.map((h, i) => (
                <button
                  key={i}
                  onClick={() => scrollToHeading(h.id)}
                  className={`block w-full text-left text-xs transition-colors hover:text-blue-400 ${
                    h.level === 1
                      ? 'text-gray-200 font-medium'
                      : h.level === 2
                        ? 'text-gray-400 pl-3'
                        : 'text-gray-500 pl-6'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <ChevronRight className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{h.text}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-gray-100">
                Literature Review
              </h2>
              {litReview && (
                <div className="flex items-center gap-3 ml-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {litReview.metadata.paper_count} papers
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" />
                    {litReview.metadata.cluster_count} clusters
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {litReview.metadata.generation_time.toFixed(1)}s
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {litReview && (
                <>
                  <button
                    onClick={handleCopyMarkdown}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors"
                    title="Copy Markdown"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? 'Copied' : 'Copy MD'}
                  </button>
                  <button
                    onClick={handleExportPdf}
                    disabled={isExporting}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    title="Download PDF"
                  >
                    {isExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    PDF
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={contentRef} className="flex-1 overflow-y-auto">
            {/* Error */}
            {error && (
              <div className="mx-6 mt-4 flex items-center gap-2 text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/30">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Generation in progress */}
            {isGenerating && (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="relative mb-6">
                  <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                  <BookOpen className="w-4 h-4 text-blue-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-sm text-gray-300 font-medium mb-2">
                  Generating Literature Review
                </p>
                <p className="text-xs text-gray-500 transition-all">
                  {PROGRESS_MESSAGES[progressIdx]}
                </p>
                <div className="mt-6 flex gap-1">
                  {PROGRESS_MESSAGES.map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i <= progressIdx ? 'bg-blue-500' : 'bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state: ready to generate */}
            {!isGenerating && !litReview && (
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <BookOpen className="w-12 h-12 text-gray-600 mb-4" />
                <h3 className="text-lg font-semibold text-gray-300 mb-2">
                  Generate an AI-Powered Literature Review
                </h3>
                <p className="text-sm text-gray-500 text-center max-w-md mb-6">
                  Analyze your graph to produce a structured literature review
                  with thematic sections, trend analysis, and formatted citations.
                </p>

                {noLLM && (
                  <p className="text-xs text-amber-400 bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-800/30 mb-4">
                    Configure an LLM provider first (click the LLM button in the toolbar)
                  </p>
                )}

                {noGraph && (
                  <p className="text-xs text-amber-400 bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-800/30 mb-4">
                    Search for papers first to populate the graph
                  </p>
                )}

                {/* Options */}
                <div className="w-full max-w-sm mb-4">
                  <button
                    onClick={() => setShowOptions(!showOptions)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors mb-2"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Options
                    <ChevronRight
                      className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {showOptions && (
                    <div className="bg-gray-800 rounded-lg p-3 space-y-2 border border-gray-700">
                      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeTrends}
                          onChange={(e) => setIncludeTrends(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        Include trend analysis
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeGaps}
                          onChange={(e) => setIncludeGaps(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        Include research gaps
                      </label>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Citation style
                        </label>
                        <select
                          value={citationStyle}
                          onChange={(e) => setCitationStyle(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                        >
                          <option value="APA">APA</option>
                          <option value="MLA">MLA</option>
                          <option value="Chicago">Chicago</option>
                          <option value="IEEE">IEEE</option>
                          <option value="Harvard">Harvard</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={noLLM || noGraph}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Generate Literature Review
                </button>
              </div>
            )}

            {/* Review content */}
            {!isGenerating && litReview && (
              <div className="px-8 py-6 max-w-3xl mx-auto">
                {/* Title */}
                <h1
                  className="text-2xl font-bold text-gray-50 mb-6 pb-3 border-b border-gray-700"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {litReview.title}
                </h1>

                {/* Rendered review */}
                <div
                  className="prose-review"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                  dangerouslySetInnerHTML={{
                    __html: `<p class="text-gray-300 leading-relaxed my-2">${reviewHtml}</p>`,
                  }}
                />

                {/* Regenerate button */}
                <div className="mt-10 pt-6 border-t border-gray-700 flex justify-center">
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
