import type { Paper } from '@/types';

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

