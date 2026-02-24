'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { api } from '@/lib/api';
import {
  toAcademicReportMarkdown,
  toMethodsSection,
  toResultsTables,
  toAPAReferenceList,
  downloadFile,
} from '@/lib/export';
import {
  BarChart3,
  Download,
  Copy,
  Check,
  ChevronDown,
  FileText,
  Table2,
  ImageIcon,
  BookOpen,
  AlertTriangle,
  Loader2,
  Network,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AcademicReport, AcademicReportTable, NodeCentrality, NetworkOverview } from '@/types';

// ─── Collapsible Section (local, same pattern as GapReportView) ──────────────

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const el = document.getElementById(`acad-section-${title.replace(/\s+/g, '-')}`);
      if (el) {
        await navigator.clipboard.writeText(el.innerText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    },
    [title]
  );

  return (
    <section className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 mb-2 w-full group"
      >
        <ChevronDown
          className={`w-3 h-3 text-[#D4AF37]/40 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
        />
        <span className="hud-label text-[#D4AF37]/50">{title}</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-transparent" />
        <span
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
          title="Copy section"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 text-[#999999]/30 hover:text-[#999999]/60" />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div id={`acad-section-${title.replace(/\s+/g, '-')}`}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── APA-formatted Table ─────────────────────────────────────────────────────

function APATable({ table }: { table: AcademicReportTable }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const lines = [table.headers.join('\t'), ...table.rows.map((row) => row.join('\t'))];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [table]);

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between mb-2">
        <div className="text-[10px] font-mono text-[#999999]/70 whitespace-pre-line">{table.title}</div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 p-1 hover:bg-[rgba(255,255,255,0.04)] rounded transition-colors"
          title="Copy table"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 text-[#999999]/30" />
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[9px] font-mono border-collapse">
          <thead>
            <tr className="border-t-2 border-b border-[#999999]/20">
              {table.headers.map((h, i) => (
                <th key={i} className="text-left py-1.5 px-2 text-[#999999]/60 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-b border-[rgba(255,255,255,0.02)]">
                {row.map((cell, j) => (
                  <td key={j} className="py-1 px-2 text-[#999999]/50">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#999999]/20">
              <td colSpan={table.headers.length} className="pt-2 text-[8px] text-[#999999]/30 italic">
                <em>Note.</em> {table.note}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Betweenness Centrality Bar Chart (CSS-only) ─────────────────────────────

function CentralityBarChart({
  centrality,
  clusters,
}: {
  centrality: NodeCentrality[];
  clusters: { id: number; color: string }[];
}) {
  const top15 = centrality.slice(0, 15);
  const maxBetweenness = Math.max(...top15.map((n) => n.betweenness), 0.001);
  const clusterColorMap = Object.fromEntries(clusters.map((c) => [c.id, c.color]));

  return (
    <div className="space-y-1">
      {top15.map((node, i) => (
        <div key={node.paper_id} className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-[#999999]/40 w-4 text-right flex-shrink-0">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="h-4 rounded-sm flex items-center px-1.5 min-w-[2px]"
              style={{
                width: `${(node.betweenness / maxBetweenness) * 100}%`,
                backgroundColor: clusterColorMap[node.cluster_id] || '#666',
                opacity: 0.7,
              }}
            >
              <span className="text-[7px] font-mono text-white/80 truncate">
                {node.title.slice(0, 40)}
              </span>
            </div>
          </div>
          <span className="text-[8px] font-mono text-[#999999]/30 w-10 text-right flex-shrink-0">
            {node.betweenness.toFixed(3)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function AcademicAnalysisPanel() {
  const {
    graphData,
    gaps,
    academicReport,
    academicReportLoading,
    networkOverview,
    setAcademicReport,
    setAcademicReportLoading,
    setNetworkOverview,
  } = useGraphStore();

  const [reportTab, setReportTab] = useState<'methods' | 'tables' | 'figures' | 'references'>('methods');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<{ fig1?: string; fig2?: string }>({});

  // Fetch network overview on mount when graph data exists
  useEffect(() => {
    if (!graphData || networkOverview) return;

    const graphContext = {
      papers: graphData.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        cluster_id: n.cluster_id,
        year: n.year,
        citation_count: n.citation_count,
      })),
      clusters: graphData.clusters.map((c) => ({
        id: c.id,
        label: c.label,
        paper_count: c.paper_count,
      })),
      edges: graphData.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        weight: e.weight,
      })),
    };

    api
      .getNetworkOverview(graphContext)
      .then((overview) => setNetworkOverview(overview))
      .catch(() => {
        // Silently fail -- overview is best-effort
      });
  }, [graphData, networkOverview, setNetworkOverview]);

  // Build graph context for generation
  const buildGraphContext = useCallback(() => {
    if (!graphData) return null;
    return {
      papers: graphData.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        year: n.year,
        cluster_id: n.cluster_id,
        cluster_label: n.cluster_label,
        citation_count: n.citation_count,
        authors: n.authors,
        venue: n.venue,
        doi: n.doi,
        abstract: n.abstract,
        tldr: n.tldr,
      })),
      clusters: graphData.clusters.map((c) => ({
        id: c.id,
        label: c.label,
        paper_count: c.paper_count,
        color: c.color,
      })),
      edges: graphData.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        weight: e.weight,
        intent: e.intent,
      })),
      total_papers: graphData.nodes.length,
    };
  }, [graphData]);

  const handleGenerate = useCallback(async () => {
    if (academicReportLoading || !graphData) return;
    setAcademicReportLoading(true);
    setErrorMsg(null);

    try {
      const graphContext = buildGraphContext();
      if (!graphContext) throw new Error('No graph data available');

      const gapIds = gaps.map((g) => g.gap_id);
      const report = await api.generateAcademicReport(graphContext, gapIds.length > 0 ? gapIds : undefined);
      setAcademicReport(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate academic report';
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 6000);
    } finally {
      setAcademicReportLoading(false);
    }
  }, [academicReportLoading, graphData, gaps, buildGraphContext, setAcademicReport, setAcademicReportLoading]);

  // ── Export handlers ──
  const handleCopyFull = useCallback(async () => {
    if (!academicReport) return;
    await navigator.clipboard.writeText(toAcademicReportMarkdown(academicReport));
  }, [academicReport]);

  const handleCopyMethods = useCallback(async () => {
    if (!academicReport) return;
    await navigator.clipboard.writeText(toMethodsSection(academicReport));
  }, [academicReport]);

  const handleCopyTables = useCallback(async () => {
    if (!academicReport) return;
    await navigator.clipboard.writeText(toResultsTables(academicReport));
  }, [academicReport]);

  const handleDownloadMd = useCallback(() => {
    if (!academicReport) return;
    const md = toAcademicReportMarkdown(academicReport);
    downloadFile(md, 'academic-report.md', 'text/markdown');
  }, [academicReport]);

  const handleDownloadBib = useCallback(() => {
    if (!academicReport) return;
    const refs = toAPAReferenceList(academicReport);
    downloadFile(refs, 'academic-references.txt', 'text/plain');
  }, [academicReport]);

  const handleCaptureView = useCallback(
    (figKey: 'fig1' | 'fig2') => {
      try {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/png');
          setCapturedImages((prev) => ({ ...prev, [figKey]: dataUrl }));
        }
      } catch {
        // Best-effort capture
      }
    },
    []
  );

  // ── Sorted centrality for bar chart ──
  const sortedCentrality = useMemo(() => {
    if (!academicReport?.network_metrics?.node_centrality) return [];
    return [...academicReport.network_metrics.node_centrality].sort((a, b) => b.betweenness - a.betweenness);
  }, [academicReport]);

  const clusterList = useMemo(() => {
    if (!graphData) return [];
    return graphData.clusters.map((c) => ({ id: c.id, color: c.color }));
  }, [graphData]);

  // ── Report sub-tabs ──
  const reportTabs = [
    { id: 'methods' as const, icon: FileText, label: 'Methods' },
    { id: 'tables' as const, icon: Table2, label: 'Tables' },
    { id: 'figures' as const, icon: ImageIcon, label: 'Figures' },
    { id: 'references' as const, icon: BookOpen, label: 'Refs' },
  ];

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-[#D4AF37]" />
        <span className="hud-label text-[#D4AF37]/60">ACADEMIC ANALYSIS</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-transparent" />
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg border border-red-700/30 bg-red-900/15"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <span className="text-[9px] font-mono text-red-300/80">{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Network Overview (always visible) ── */}
      {graphData && (
        <div className="hud-panel-clean rounded-lg p-3 mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Network className="w-3 h-3 text-[#D4AF37]/60" />
            <span className="hud-label text-[#D4AF37]/40">NETWORK OVERVIEW</span>
          </div>
          {networkOverview ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-[#999999]/40">Nodes</span>
                <span className="text-[9px] font-mono text-[#999999]/70 font-medium">
                  {networkOverview.node_count}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-[#999999]/40">Edges</span>
                <span className="text-[9px] font-mono text-[#999999]/70 font-medium">
                  {networkOverview.edge_count}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-[#999999]/40">Density</span>
                <span className="text-[9px] font-mono text-[#999999]/70 font-medium">
                  {networkOverview.density.toFixed(3)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-[#999999]/40">Clusters</span>
                <span className="text-[9px] font-mono text-[#999999]/70 font-medium">
                  {networkOverview.cluster_count}
                </span>
              </div>
              <div className="flex items-center justify-between col-span-2">
                <span className="text-[9px] font-mono text-[#999999]/40">Modularity (Q)</span>
                <span className="text-[9px] font-mono text-[#D4AF37]/70 font-medium">
                  {networkOverview.modularity.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="w-3 h-3 animate-spin text-[#999999]/30" />
              <span className="text-[9px] font-mono text-[#999999]/30">Loading overview...</span>
            </div>
          )}
        </div>
      )}

      {/* ── Generate Button ── */}
      <button
        onClick={handleGenerate}
        disabled={academicReportLoading || !graphData}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                   bg-[#D4AF37]/10 border border-[#D4AF37]/30
                   hover:bg-[#D4AF37]/20 hover:border-[#D4AF37]/50
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all text-[11px] font-mono font-semibold uppercase tracking-widest text-[#D4AF37]"
      >
        {academicReportLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Generating...
          </>
        ) : (
          <>
            <BarChart3 className="w-4 h-4" /> Generate Academic Report
          </>
        )}
      </button>

      {/* ── Report View ── */}
      {academicReport && (
        <div className="mt-4">
          {/* Feasibility warnings */}
          {academicReport.warnings.length > 0 && (
            <div className="mb-3 space-y-1">
              {academicReport.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.05)]"
                >
                  <AlertTriangle className="w-3 h-3 text-[#D4AF37] flex-shrink-0" />
                  <span className="text-[9px] font-mono text-[#D4AF37]/70">{w}</span>
                </div>
              ))}
            </div>
          )}

          {academicReport.feasibility !== 'full' && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg border border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.05)]">
              <AlertTriangle className="w-3.5 h-3.5 text-[#D4AF37] flex-shrink-0" />
              <span className="text-[9px] font-mono text-[#D4AF37]/80">
                {academicReport.feasibility === 'partial'
                  ? 'Partial report -- some tables may be limited due to network size'
                  : 'Insufficient data for full analysis'}
              </span>
            </div>
          )}

          <div className="hud-divider mb-3" />

          {/* Sub-tab navigation */}
          <div className="flex border-b border-[rgba(255,255,255,0.04)] mb-3">
            {reportTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReportTab(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-2 text-[9px] font-mono uppercase tracking-widest transition-colors ${
                  reportTab === tab.id
                    ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                    : 'text-[#999999]/40 hover:text-[#999999]'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Methods Tab ── */}
          {reportTab === 'methods' && (
            <div>
              <MethodsSections methodsText={academicReport.methods_section} />
            </div>
          )}

          {/* ── Tables Tab ── */}
          {reportTab === 'tables' && (
            <div>
              {(['table_1', 'table_2', 'table_3', 'table_4', 'table_5'] as const).map((key) => {
                const table = academicReport.tables[key];
                if (!table || !table.rows || table.rows.length === 0) return null;
                return <APATable key={key} table={table} />;
              })}
            </div>
          )}

          {/* ── Figures Tab ── */}
          {reportTab === 'figures' && (
            <div className="space-y-6">
              {/* Figure 1 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="hud-label text-[#D4AF37]/40">FIGURE 1</span>
                  <button
                    onClick={() => handleCaptureView('fig1')}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[8px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
                  >
                    <ImageIcon className="w-3 h-3" />
                    Capture Current View
                  </button>
                </div>
                {capturedImages.fig1 && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-[rgba(255,255,255,0.04)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={capturedImages.fig1} alt="Figure 1 capture" className="w-full h-auto opacity-80" />
                  </div>
                )}
                <p className="text-[9px] font-mono text-[#999999]/40 leading-relaxed italic">
                  {academicReport.figure_captions.figure_1}
                </p>
              </div>

              {/* Figure 2 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="hud-label text-[#D4AF37]/40">FIGURE 2</span>
                  <button
                    onClick={() => handleCaptureView('fig2')}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[8px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
                  >
                    <ImageIcon className="w-3 h-3" />
                    Capture Current View
                  </button>
                </div>
                {capturedImages.fig2 && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-[rgba(255,255,255,0.04)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={capturedImages.fig2} alt="Figure 2 capture" className="w-full h-auto opacity-80" />
                  </div>
                )}
                <p className="text-[9px] font-mono text-[#999999]/40 leading-relaxed italic">
                  {academicReport.figure_captions.figure_2}
                </p>
              </div>

              {/* Figure 3 -- Betweenness centrality bar chart */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="hud-label text-[#D4AF37]/40">FIGURE 3</span>
                </div>
                {sortedCentrality.length > 0 ? (
                  <CentralityBarChart centrality={sortedCentrality} clusters={clusterList} />
                ) : (
                  <p className="text-[9px] font-mono text-[#999999]/30">No centrality data available</p>
                )}
                <p className="text-[9px] font-mono text-[#999999]/40 leading-relaxed italic mt-2">
                  {academicReport.figure_captions.figure_3}
                </p>
              </div>
            </div>
          )}

          {/* ── References Tab ── */}
          {reportTab === 'references' && (
            <div>
              <CollapsibleSection title="METHODOLOGY REFERENCES" defaultOpen>
                <div className="space-y-2">
                  {academicReport.reference_list.methodology_refs.map((ref, i) => (
                    <p key={i} className="text-[9px] font-mono text-[#999999]/50 leading-relaxed pl-4 -indent-4">
                      {ref}
                    </p>
                  ))}
                </div>
              </CollapsibleSection>

              {academicReport.reference_list.analysis_refs.length > 0 && (
                <CollapsibleSection title="ANALYSIS REFERENCES" defaultOpen>
                  <div className="space-y-2">
                    {academicReport.reference_list.analysis_refs.map((ref, i) => (
                      <p key={i} className="text-[9px] font-mono text-[#999999]/50 leading-relaxed pl-4 -indent-4">
                        {ref.apa_citation}
                      </p>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {/* Copy all + Download */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={async () => {
                    if (!academicReport) return;
                    await navigator.clipboard.writeText(toAPAReferenceList(academicReport));
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
                >
                  <Copy className="w-3 h-3" />
                  Copy All
                </button>
                <button
                  onClick={handleDownloadBib}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
                >
                  <Download className="w-3 h-3" />
                  .txt
                </button>
              </div>
            </div>
          )}

          {/* ── Export Section ── */}
          <div className="hud-divider my-4" />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopyFull}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              <Copy className="w-3 h-3" /> Full Report
            </button>
            <button
              onClick={handleCopyMethods}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              <Copy className="w-3 h-3" /> Methods
            </button>
            <button
              onClick={handleCopyTables}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              <Copy className="w-3 h-3" /> Tables
            </button>
            <button
              onClick={handleDownloadMd}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              <Download className="w-3 h-3" /> .md
            </button>
            <button
              onClick={handleDownloadBib}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.1)] transition-all text-[9px] font-mono uppercase tracking-widest text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              <Download className="w-3 h-3" /> .bib
            </button>
          </div>
        </div>
      )}

      {/* Empty state when no graph */}
      {!graphData && (
        <div className="flex flex-col items-center justify-center py-8 text-center mt-4">
          <Network className="w-8 h-8 text-[rgba(255,255,255,0.04)] mb-3" />
          <p className="text-[10px] font-mono text-[#999999]/40 leading-relaxed max-w-[200px]">
            Load a citation network to run academic analysis.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Methods Subsections (split by ### headers) ──────────────────────────────

function MethodsSections({ methodsText }: { methodsText: string }) {
  const sections = useMemo(() => {
    const parts = methodsText.split(/^(###\s+.+)$/m);
    const result: { title: string; content: string }[] = [];

    // If no headers found, return the whole text as one section
    if (parts.length <= 1) {
      return [{ title: 'METHODS', content: methodsText }];
    }

    // First part before any header (if non-empty)
    if (parts[0].trim()) {
      result.push({ title: 'OVERVIEW', content: parts[0].trim() });
    }

    // Pair headers with content
    for (let i = 1; i < parts.length; i += 2) {
      const header = parts[i].replace(/^###\s+/, '').trim().toUpperCase();
      const content = (parts[i + 1] || '').trim();
      if (content) {
        result.push({ title: header, content });
      }
    }

    return result;
  }, [methodsText]);

  return (
    <div>
      {sections.map((section, i) => (
        <CollapsibleSection key={i} title={section.title} defaultOpen={i === 0}>
          <div className="text-[10px] font-mono text-[#999999]/60 leading-relaxed whitespace-pre-wrap pl-1">
            {section.content}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}
