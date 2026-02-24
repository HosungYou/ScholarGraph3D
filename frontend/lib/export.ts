import type { Paper, GapReport, AcademicReport } from '@/types';

export function toBibtex(paper: Paper): string {
  const authorStr = paper.authors.map(a => a.name).join(' and ');
  const key = `${paper.authors[0]?.name?.split(' ').pop() || 'unknown'}${paper.year || 'nd'}`;
  return `@article{${key},
  title = {${paper.title}},
  author = {${authorStr}},
  year = {${paper.year || ''}},
  journal = {${paper.venue || ''}},
  doi = {${paper.doi || ''}}
}`;
}

export function toRIS(paper: Paper): string {
  const lines = [
    'TY  - JOUR',
    `TI  - ${paper.title}`,
    ...paper.authors.map(a => `AU  - ${a.name}`),
    `PY  - ${paper.year || ''}`,
    `JO  - ${paper.venue || ''}`,
    `DO  - ${paper.doi || ''}`,
    'ER  - ',
  ];
  return lines.join('\n');
}

export function toBibtexBatch(papers: Paper[]): string {
  return papers.map(toBibtex).join('\n\n');
}

export function toRISBatch(papers: Paper[]): string {
  return papers.map(toRIS).join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Gap Report Export ──────────────────────────────────────────────

export function toGapReportMarkdown(report: GapReport): string {
  const lines: string[] = [];

  lines.push(`# ${report.title}`);
  lines.push(`*Generated: ${new Date(report.generated_at).toLocaleDateString()}*`);
  lines.push('');

  if (report.snapshot_data_url) {
    lines.push(`![Gap Visualization](${report.snapshot_data_url})`);
    lines.push('');
  }

  lines.push('## Executive Summary');
  lines.push(report.executive_summary);
  lines.push('');

  // Gap scores
  lines.push('## Gap Scores');
  if (report.raw_metrics) {
    const m = report.raw_metrics;
    lines.push(`| Dimension | Score |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Structural | ${(m.structural * 100).toFixed(0)}% |`);
    lines.push(`| Relatedness | ${((m as any).relatedness * 100).toFixed(0)}% |`);
    lines.push(`| Temporal | ${(m.temporal * 100).toFixed(0)}% |`);
    lines.push(`| Intent | ${(m.intent * 100).toFixed(0)}% |`);
    lines.push(`| Directional | ${(m.directional * 100).toFixed(0)}% |`);
    lines.push(`| **Composite** | **${(m.composite * 100).toFixed(0)}%** |`);
  }
  lines.push('');

  // Sections
  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push(section.content);
    lines.push('');
  }

  // Research questions
  if (report.research_questions.length > 0) {
    lines.push('## Research Questions');
    report.research_questions.forEach((rq, i) => {
      lines.push(`### ${i + 1}. ${rq.question}`);
      lines.push(`**Justification:** ${rq.justification}`);
      lines.push(`**Methodology:** ${rq.methodology_hint}`);
      lines.push('');
    });
  }

  if (report.significance_statement) {
    lines.push('## Significance');
    lines.push(report.significance_statement);
    lines.push('');
  }

  if (report.limitations) {
    lines.push('## Limitations');
    lines.push(report.limitations);
    lines.push('');
  }

  // References
  if (report.cited_papers.length > 0) {
    lines.push('## References');
    report.cited_papers.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.title} (S2: ${p.paper_id})`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function toGapReportBibtex(report: GapReport): string {
  return report.bibtex;
}

// ─── Academic Report Export ──────────────────────────────────────────

export function toAcademicReportMarkdown(report: AcademicReport): string {
  const lines: string[] = [];

  lines.push('# Citation Network Analysis Report');
  lines.push(`*Generated: ${new Date(report.generated_at).toLocaleDateString()}*`);
  lines.push('');

  // Methods
  lines.push('## Methods');
  lines.push('');
  lines.push(report.methods_section);
  lines.push('');

  // Tables
  lines.push('## Results');
  lines.push('');

  for (const key of ['table_1', 'table_2', 'table_3', 'table_4', 'table_5'] as const) {
    const table = report.tables[key];
    if (!table) continue;
    lines.push(table.title);
    lines.push('');
    // Markdown table
    lines.push('| ' + table.headers.join(' | ') + ' |');
    lines.push('| ' + table.headers.map(() => '---').join(' | ') + ' |');
    for (const row of table.rows) {
      lines.push('| ' + row.join(' | ') + ' |');
    }
    lines.push('');
    if (table.note) {
      lines.push(`*Note.* ${table.note}`);
      lines.push('');
    }
  }

  // Figure captions
  lines.push('## Figure Captions');
  lines.push('');
  lines.push(report.figure_captions.figure_1);
  lines.push('');
  lines.push(report.figure_captions.figure_2);
  lines.push('');
  lines.push(report.figure_captions.figure_3);
  lines.push('');

  // References
  lines.push('## References');
  lines.push('');
  for (const ref of report.reference_list.methodology_refs) {
    lines.push(ref);
    lines.push('');
  }

  return lines.join('\n');
}

export function toMethodsSection(report: AcademicReport): string {
  return report.methods_section;
}

export function toResultsTables(report: AcademicReport): string {
  const lines: string[] = [];
  for (const key of ['table_1', 'table_2', 'table_3', 'table_4', 'table_5'] as const) {
    const table = report.tables[key];
    if (!table) continue;
    lines.push(table.title);
    lines.push('');
    lines.push('| ' + table.headers.join(' | ') + ' |');
    lines.push('| ' + table.headers.map(() => '---').join(' | ') + ' |');
    for (const row of table.rows) {
      lines.push('| ' + row.join(' | ') + ' |');
    }
    lines.push('');
    if (table.note) {
      lines.push(`*Note.* ${table.note}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function toAPAReferenceList(report: AcademicReport): string {
  const lines = [...report.reference_list.methodology_refs];
  for (const ref of report.reference_list.analysis_refs) {
    lines.push(ref.apa_citation);
  }
  return lines.join('\n\n');
}
