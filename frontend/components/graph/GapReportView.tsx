'use client';

import { useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { ArrowLeft, Download, FileText, BookOpen } from 'lucide-react';
import type { GapReport, GapScoreBreakdown, GapKeyPaper, GapReportQuestion, GapReportSection } from '@/types';
import { toGapReportMarkdown, toGapReportBibtex, downloadFile } from '@/lib/export';

export default function GapReportView() {
  const { activeGapReport, setActiveGapReport, selectPaper, setPanelSelectionId, graphData } = useGraphStore();

  const handleBack = useCallback(() => {
    setActiveGapReport(null);
  }, [setActiveGapReport]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!activeGapReport) return;
    const md = toGapReportMarkdown(activeGapReport);
    const filename = `gap-report-${activeGapReport.gap_id.slice(0, 8)}.md`;
    downloadFile(md, filename, 'text/markdown');
  }, [activeGapReport]);

  const handleDownloadBibtex = useCallback(() => {
    if (!activeGapReport) return;
    const bib = toGapReportBibtex(activeGapReport);
    const filename = `gap-report-${activeGapReport.gap_id.slice(0, 8)}.bib`;
    downloadFile(bib, filename, 'application/x-bibtex');
  }, [activeGapReport]);

  const handlePaperClick = useCallback((paperId: string) => {
    if (!graphData) return;
    const paper = graphData.nodes.find(n => n.id === paperId);
    if (paper) {
      selectPaper(paper);
      setPanelSelectionId(paper.id);
    }
  }, [graphData, selectPaper, setPanelSelectionId]);

  if (!activeGapReport) return null;

  const report = activeGapReport;

  return (
    <div className="p-4">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[#999999]/50 hover:text-[#D4AF37] transition-colors mb-4"
      >
        <ArrowLeft className="w-3 h-3" />
        Back to Gaps
      </button>

      {/* Title */}
      <div className="hud-divider mb-3" />
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-4 h-4 text-[#D4AF37]" />
        <span className="hud-label text-[#D4AF37]/60">GAP ANALYSIS REPORT</span>
      </div>
      <h2 className="text-[11px] font-mono text-[#999999]/80 leading-snug mb-1">
        {report.title}
      </h2>
      <p className="text-[9px] font-mono text-[#999999]/30 mb-3">
        Generated {new Date(report.generated_at).toLocaleString()}
      </p>
      <div className="hud-divider mb-4" />

      {/* 3D Graph Snapshot */}
      {report.snapshot_data_url && (
        <div className="mb-4 rounded-lg overflow-hidden border border-[rgba(255,255,255,0.04)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={report.snapshot_data_url}
            alt="Gap visualization snapshot"
            className="w-full h-auto opacity-80"
          />
        </div>
      )}

      {/* Executive Summary */}
      <section className="mb-4">
        <SectionHeader title="EXECUTIVE SUMMARY" />
        <p className="text-[10px] font-mono text-[#999999]/70 leading-relaxed border-l-2 border-[rgba(212,175,55,0.15)] pl-3">
          {report.executive_summary}
        </p>
      </section>

      {/* Gap Score */}
      <section className="mb-4">
        <SectionHeader title="GAP SCORE" />
        <GapScoreDisplay metrics={report.raw_metrics} />
      </section>

      {/* Cluster papers */}
      {report.cited_papers.length > 0 && (
        <section className="mb-4">
          <SectionHeader title="KEY PAPERS" />
          <div className="space-y-1">
            {report.cited_papers.map((paper) => (
              <PaperItem key={paper.paper_id} paper={paper} onClick={() => handlePaperClick(paper.paper_id)} />
            ))}
          </div>
        </section>
      )}

      {/* Report sections */}
      {report.sections.map((section) => (
        <section key={section.id} className="mb-4">
          <SectionHeader title={section.title.toUpperCase()} />
          <div className="text-[10px] font-mono text-[#999999]/60 leading-relaxed whitespace-pre-wrap pl-1">
            {section.content}
          </div>
        </section>
      ))}

      {/* Research Questions */}
      {report.research_questions.length > 0 && (
        <section className="mb-4">
          <SectionHeader title="RESEARCH QUESTIONS" />
          <div className="space-y-3">
            {report.research_questions.map((rq, i) => (
              <ResearchQuestionItem key={i} index={i + 1} question={rq} />
            ))}
          </div>
        </section>
      )}

      {/* Significance */}
      {report.significance_statement && (
        <section className="mb-4">
          <SectionHeader title="SIGNIFICANCE" />
          <p className="text-[10px] font-mono text-[#999999]/60 leading-relaxed pl-1">
            {report.significance_statement}
          </p>
        </section>
      )}

      {/* Limitations */}
      {report.limitations && (
        <section className="mb-4">
          <SectionHeader title="LIMITATIONS" />
          <p className="text-[10px] font-mono text-[#999999]/40 leading-relaxed pl-1">
            {report.limitations}
          </p>
        </section>
      )}

      <div className="hud-divider mb-4" />

      {/* Download buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleDownloadMarkdown}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
        >
          <Download className="w-3 h-3" />
          Markdown
        </button>
        <button
          onClick={handleDownloadBibtex}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
        >
          <BookOpen className="w-3 h-3" />
          BibTeX
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="hud-label text-[#D4AF37]/50">{title}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-transparent" />
    </div>
  );
}

function GapScoreDisplay({ metrics }: { metrics: GapScoreBreakdown }) {
  const dimensions: { key: keyof GapScoreBreakdown; label: string }[] = [
    { key: 'composite', label: 'composite' },
    { key: 'structural', label: 'structural' },
    { key: 'semantic', label: 'semantic' },
    { key: 'temporal', label: 'temporal' },
    { key: 'intent', label: 'intent' },
    { key: 'directional', label: 'directional' },
  ];

  return (
    <div className="hud-panel-clean rounded-lg p-3 space-y-1.5">
      {dimensions.map(({ key, label }) => {
        const val = metrics[key] ?? 0;
        const pct = Math.round(val * 100);
        const isComposite = key === 'composite';
        return (
          <div key={key} className="flex items-center gap-2">
            <span className={`text-[9px] font-mono w-16 text-right ${isComposite ? 'text-[#D4AF37]/70 font-semibold' : 'text-[#999999]/40'}`}>
              {label}
            </span>
            <div className="flex-1 h-1 bg-[rgba(255,255,255,0.02)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isComposite
                    ? '#D4AF37'
                    : val > 0.7 ? '#D4AF37' : val > 0.4 ? '#666666' : '#333333',
                  boxShadow: isComposite ? '0 0 8px rgba(212,175,55,0.3)' : undefined,
                }}
              />
            </div>
            <span className={`text-[9px] font-mono w-8 ${isComposite ? 'text-[#D4AF37]/70 font-semibold' : 'text-[#999999]/30'}`}>
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PaperItem({ paper, onClick }: { paper: GapKeyPaper; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 rounded hover:bg-[rgba(255,255,255,0.04)] transition-colors"
    >
      <p className="text-[10px] font-mono text-[#999999]/60 leading-snug line-clamp-2 hover:text-[#D4AF37]/80 transition-colors">
        {paper.title}
      </p>
      <div className="flex items-center gap-2 text-[8px] font-mono text-[#999999]/25 mt-0.5">
        <span>{(paper.citation_count || 0).toLocaleString()} cit.</span>
        {paper.tldr && (
          <span className="truncate max-w-[180px]">{paper.tldr}</span>
        )}
      </div>
    </button>
  );
}

function ResearchQuestionItem({ index, question }: { index: number; question: GapReportQuestion }) {
  return (
    <div className="pl-2 border-l-2 border-[rgba(212,175,55,0.15)]">
      <p className="text-[10px] font-mono text-[#999999]/70 leading-snug mb-1">
        <span className="text-[#D4AF37]/50 mr-1">{index}.</span>
        {question.question}
      </p>
      {question.justification && (
        <p className="text-[9px] font-mono text-[#999999]/40 leading-snug mb-0.5">
          <span className="text-[#999999]/25">Justification:</span> {question.justification}
        </p>
      )}
      {question.methodology_hint && (
        <p className="text-[9px] font-mono text-[#999999]/40 leading-snug">
          <span className="text-[#999999]/25">Methodology:</span> {question.methodology_hint}
        </p>
      )}
    </div>
  );
}
