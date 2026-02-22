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
    .replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold text-[#E8EAF6]/90 mt-5 mb-2 font-mono uppercase tracking-wider">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-[#E8EAF6] mt-6 mb-3 font-mono uppercase tracking-wider">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-[#E8EAF6] mt-8 mb-3 pb-2 border-b border-[#1a2555] font-mono uppercase tracking-widest">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-[#E8EAF6] mt-6 mb-4 font-mono uppercase tracking-widest">$1</h1>')
    // bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#E8EAF6]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code class="bg-[#111833] text-cosmic-glow px-1 py-0.5 rounded text-sm font-mono">$1</code>')
    // blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-cosmic-glow/40 pl-3 text-[#7B8CDE] italic my-2">$1</blockquote>')
    // unordered list
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-[#7B8CDE] my-0.5">$1</li>')
    // ordered list
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-[#7B8CDE] my-0.5">$1</li>')
    // horizontal rule
    .replace(/^---$/gm, '<hr class="border-[#1a2555] my-4" />')
    // paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="text-[#7B8CDE] leading-relaxed my-2">')
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
    <div className="fixed inset-0 z-50 flex bg-[#050510]/80 backdrop-blur-sm">
      {/* Main panel */}
      <div className="flex flex-1 max-w-6xl mx-auto my-4 hud-panel rounded-xl border border-[#1a2555] overflow-hidden shadow-2xl">
        {/* TOC Sidebar */}
        {litReview && headings.length > 0 && (
          <div className="w-56 flex-shrink-0 border-r border-[#1a2555] overflow-y-auto p-4">
            <h4 className="text-xs font-mono font-semibold text-cosmic-glow/60 uppercase tracking-widest mb-3">
              Contents
            </h4>
            <nav className="space-y-1">
              {headings.map((h, i) => (
                <button
                  key={i}
                  onClick={() => scrollToHeading(h.id)}
                  className={`block w-full text-left text-xs font-mono transition-colors hover:text-cosmic-glow ${
                    h.level === 1
                      ? 'text-[#E8EAF6] font-medium'
                      : h.level === 2
                        ? 'text-[#7B8CDE]/80 pl-3'
                        : 'text-[#7B8CDE]/50 pl-6'
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2555] flex-shrink-0">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-cosmic-glow/60" />
              <h2 className="text-sm font-mono uppercase tracking-widest text-[#E8EAF6]">
                Literature Review
              </h2>
              {litReview && (
                <div className="flex items-center gap-3 ml-3 text-[10px] font-mono text-[#7B8CDE]/50">
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
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono text-[#7B8CDE] bg-[#0a0f1e] hover:bg-[#111833] border border-[#1a2555] transition-colors"
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
                    className="hud-button flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider disabled:opacity-40"
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
                className="p-1.5 rounded-md text-[#7B8CDE]/50 hover:text-cosmic-glow hover:bg-[#111833] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={contentRef} className="flex-1 overflow-y-auto">
            {/* Error */}
            {error && (
              <div className="mx-6 mt-4 flex items-center gap-2 text-xs font-mono text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/30">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Generation in progress */}
            {isGenerating && (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="relative mb-6">
                  <Loader2 className="w-10 h-10 text-cosmic-glow animate-spin" />
                  <BookOpen className="w-4 h-4 text-cosmic-glow/60 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-sm font-mono text-[#E8EAF6]/90 font-medium mb-2 uppercase tracking-wider">
                  Generating Literature Review
                </p>
                <p className="text-xs font-mono text-[#7B8CDE]/50 transition-all">
                  {PROGRESS_MESSAGES[progressIdx]}
                </p>
                <div className="mt-6 flex gap-1">
                  {PROGRESS_MESSAGES.map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i <= progressIdx ? 'bg-cosmic-glow' : 'bg-[#1a2555]'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state: ready to generate */}
            {!isGenerating && !litReview && (
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <BookOpen className="w-12 h-12 text-[#1a2555] mb-4" />
                <h3 className="text-lg font-mono font-semibold text-[#7B8CDE] mb-2 uppercase tracking-wider">
                  Generate an AI-Powered Literature Review
                </h3>
                <p className="text-sm font-mono text-[#7B8CDE]/50 text-center max-w-md mb-6">
                  Analyze your graph to produce a structured literature review
                  with thematic sections, trend analysis, and formatted citations.
                </p>

                {noLLM && (
                  <p className="text-xs font-mono text-amber-400 bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-800/30 mb-4">
                    Configure an LLM provider first (click the LLM button in the toolbar)
                  </p>
                )}

                {noGraph && (
                  <p className="text-xs font-mono text-amber-400 bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-800/30 mb-4">
                    Search for papers first to populate the graph
                  </p>
                )}

                {/* Options */}
                <div className="w-full max-w-sm mb-4">
                  <button
                    onClick={() => setShowOptions(!showOptions)}
                    className="flex items-center gap-1.5 text-xs font-mono text-[#7B8CDE]/50 hover:text-[#7B8CDE] transition-colors mb-2"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Options
                    <ChevronRight
                      className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {showOptions && (
                    <div className="bg-[#0a0f1e] rounded-lg p-3 space-y-2 border border-[#1a2555]">
                      <label className="flex items-center gap-2 text-xs font-mono text-[#7B8CDE] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeTrends}
                          onChange={(e) => setIncludeTrends(e.target.checked)}
                          className="rounded border-[#1a2555] bg-[#050510] text-cosmic-glow focus:ring-cosmic-glow/40 focus:ring-offset-0"
                        />
                        Include trend analysis
                      </label>
                      <label className="flex items-center gap-2 text-xs font-mono text-[#7B8CDE] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeGaps}
                          onChange={(e) => setIncludeGaps(e.target.checked)}
                          className="rounded border-[#1a2555] bg-[#050510] text-cosmic-glow focus:ring-cosmic-glow/40 focus:ring-offset-0"
                        />
                        Include research gaps
                      </label>
                      <div>
                        <label className="block text-xs font-mono text-[#7B8CDE]/50 mb-1 uppercase tracking-wider">
                          Citation style
                        </label>
                        <select
                          value={citationStyle}
                          onChange={(e) => setCitationStyle(e.target.value)}
                          className="w-full bg-[#050510] border border-[#1a2555] rounded-md px-2.5 py-1.5 text-xs font-mono text-[#E8EAF6] focus:outline-none focus:border-cosmic-glow/40"
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
                  className="hud-button flex items-center gap-2 px-5 py-2.5 uppercase font-mono tracking-wider text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Search className="w-4 h-4" />
                  GENERATE LITERATURE REVIEW
                </button>
              </div>
            )}

            {/* Review content */}
            {!isGenerating && litReview && (
              <div className="px-8 py-6 max-w-3xl mx-auto">
                {/* Title */}
                <h1
                  className="text-2xl font-bold text-[#E8EAF6] mb-6 pb-3 border-b border-[#1a2555] font-mono uppercase tracking-widest"
                >
                  {litReview.title}
                </h1>

                {/* Rendered review */}
                <div
                  className="prose-review"
                  dangerouslySetInnerHTML={{
                    __html: `<p class="text-[#7B8CDE] leading-relaxed my-2 font-mono">${reviewHtml}</p>`,
                  }}
                />

                {/* Regenerate button */}
                <div className="mt-10 pt-6 border-t border-[#1a2555] flex justify-center">
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0a0f1e] hover:bg-[#111833] text-[#7B8CDE] text-xs font-mono uppercase tracking-wider rounded-lg border border-[#1a2555] transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" />
                    REGENERATE
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
