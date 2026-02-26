import { toBibtex, toRIS, toBibtexBatch, toRISBatch } from '@/lib/export';
import type { Paper } from '@/types';

const makePaper = (overrides: Partial<Paper> = {}): Paper => ({
  id: 'paper-1',
  title: 'Attention Is All You Need',
  authors: [
    { name: 'Ashish Vaswani' },
    { name: 'Noam Shazeer' },
    { name: 'Niki Parmar' },
  ],
  year: 2017,
  venue: 'NeurIPS',
  doi: '10.5555/3295222.3295349',
  citation_count: 50000,
  fields: ['Computer Science'],
  topics: [],
  x: 0,
  y: 0,
  z: 0,
  cluster_id: 1,
  cluster_label: 'Deep Learning',
  is_open_access: false,
  ...overrides,
});

describe('toBibtex', () => {
  it('generates correct BibTeX format for a full paper', () => {
    const paper = makePaper();
    const result = toBibtex(paper);

    expect(result).toContain('@article{');
    expect(result).toContain('Vaswani2017');
    expect(result).toContain('title = {Attention Is All You Need}');
    expect(result).toContain('author = {Ashish Vaswani and Noam Shazeer and Niki Parmar}');
    expect(result).toContain('year = {2017}');
    expect(result).toContain('journal = {NeurIPS}');
    expect(result).toContain('doi = {10.5555/3295222.3295349}');
  });

  it('uses last name of first author as citation key prefix', () => {
    const paper = makePaper({ authors: [{ name: 'Geoffrey Hinton' }], year: 2006 });
    const result = toBibtex(paper);
    expect(result).toContain('@article{Hinton2006');
  });

  it('uses "unknown" key prefix when authors list is empty', () => {
    const paper = makePaper({ authors: [] });
    const result = toBibtex(paper);
    expect(result).toContain('@article{unknown');
  });

  it('handles missing year gracefully', () => {
    const paper = makePaper({ year: undefined as unknown as number });
    const result = toBibtex(paper);
    expect(result).toContain('year = {}');
  });

  it('handles missing venue gracefully', () => {
    const paper = makePaper({ venue: undefined });
    const result = toBibtex(paper);
    expect(result).toContain('journal = {}');
  });

  it('handles missing doi gracefully', () => {
    const paper = makePaper({ doi: undefined });
    const result = toBibtex(paper);
    expect(result).toContain('doi = {}');
  });

  it('handles single author correctly', () => {
    const paper = makePaper({ authors: [{ name: 'Yann LeCun' }] });
    const result = toBibtex(paper);
    expect(result).toContain('author = {Yann LeCun}');
  });
});

describe('toRIS', () => {
  it('generates correct RIS format for a full paper', () => {
    const paper = makePaper();
    const result = toRIS(paper);
    const lines = result.split('\n');

    expect(lines[0]).toBe('TY  - JOUR');
    expect(lines).toContain('TI  - Attention Is All You Need');
    expect(lines).toContain('AU  - Ashish Vaswani');
    expect(lines).toContain('AU  - Noam Shazeer');
    expect(lines).toContain('AU  - Niki Parmar');
    expect(lines).toContain('PY  - 2017');
    expect(lines).toContain('JO  - NeurIPS');
    expect(lines).toContain('DO  - 10.5555/3295222.3295349');
    expect(lines[lines.length - 1]).toBe('ER  - ');
  });

  it('emits one AU line per author', () => {
    const paper = makePaper();
    const result = toRIS(paper);
    const authorLines = result.split('\n').filter(l => l.startsWith('AU  - '));
    expect(authorLines).toHaveLength(3);
  });

  it('handles missing year gracefully', () => {
    const paper = makePaper({ year: undefined as unknown as number });
    const result = toRIS(paper);
    expect(result).toContain('PY  - ');
  });

  it('handles missing venue gracefully', () => {
    const paper = makePaper({ venue: undefined });
    const result = toRIS(paper);
    expect(result).toContain('JO  - ');
  });

  it('handles missing doi gracefully', () => {
    const paper = makePaper({ doi: undefined });
    const result = toRIS(paper);
    expect(result).toContain('DO  - ');
  });

  it('always starts with TY and ends with ER', () => {
    const paper = makePaper({ doi: undefined, venue: undefined });
    const result = toRIS(paper);
    expect(result.startsWith('TY  - JOUR')).toBe(true);
    expect(result.endsWith('ER  - ')).toBe(true);
  });
});

describe('toBibtexBatch', () => {
  it('combines multiple entries separated by blank lines', () => {
    const papers = [
      makePaper({ id: 'p1', title: 'Paper One', authors: [{ name: 'Alice Smith' }], year: 2020 }),
      makePaper({ id: 'p2', title: 'Paper Two', authors: [{ name: 'Bob Jones' }], year: 2021 }),
    ];
    const result = toBibtexBatch(papers);

    expect(result).toContain('title = {Paper One}');
    expect(result).toContain('title = {Paper Two}');
    // joined with '\n\n'
    expect(result).toContain('\n\n');
  });

  it('returns single entry for a one-paper batch', () => {
    const paper = makePaper();
    const result = toBibtexBatch([paper]);
    expect(result).toBe(toBibtex(paper));
  });

  it('returns empty string for empty array', () => {
    expect(toBibtexBatch([])).toBe('');
  });

  it('each entry is valid BibTeX', () => {
    const papers = [
      makePaper({ id: 'p1', authors: [{ name: 'Alice Smith' }], year: 2020 }),
      makePaper({ id: 'p2', authors: [{ name: 'Bob Jones' }], year: 2021 }),
      makePaper({ id: 'p3', authors: [{ name: 'Carol White' }], year: 2022 }),
    ];
    const result = toBibtexBatch(papers);
    const entryCount = (result.match(/@article\{/g) || []).length;
    expect(entryCount).toBe(3);
  });
});

describe('toRISBatch', () => {
  it('combines multiple RIS entries', () => {
    const papers = [
      makePaper({ id: 'p1', title: 'First Paper', authors: [{ name: 'Alice Smith' }] }),
      makePaper({ id: 'p2', title: 'Second Paper', authors: [{ name: 'Bob Jones' }] }),
    ];
    const result = toRISBatch(papers);

    expect(result).toContain('TI  - First Paper');
    expect(result).toContain('TI  - Second Paper');
  });

  it('returns single RIS entry for one-paper batch', () => {
    const paper = makePaper();
    expect(toRISBatch([paper])).toBe(toRIS(paper));
  });

  it('returns empty string for empty array', () => {
    expect(toRISBatch([])).toBe('');
  });

  it('each entry contains TY and ER markers', () => {
    const papers = [
      makePaper({ id: 'p1', authors: [{ name: 'Alice Smith' }] }),
      makePaper({ id: 'p2', authors: [{ name: 'Bob Jones' }] }),
    ];
    const result = toRISBatch(papers);
    const tyCount = (result.match(/TY  - JOUR/g) || []).length;
    const erCount = (result.match(/ER  - /g) || []).length;
    expect(tyCount).toBe(2);
    expect(erCount).toBe(2);
  });
});
