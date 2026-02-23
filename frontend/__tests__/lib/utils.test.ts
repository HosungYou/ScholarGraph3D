import { cn, findCitationPath } from '@/lib/utils';
import type { GraphEdge } from '@/types';

// ─── cn (Tailwind class merging) ─────────────────────────────────────────────

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('text-red-500')).toBe('text-red-500');
  });

  it('merges multiple classes', () => {
    const result = cn('px-4', 'py-2', 'text-white');
    expect(result).toContain('px-4');
    expect(result).toContain('py-2');
    expect(result).toContain('text-white');
  });

  it('deduplicates conflicting Tailwind classes (last wins)', () => {
    // twMerge keeps the last conflicting utility
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles conditional falsy values', () => {
    const result = cn('base-class', false && 'conditional', undefined, null as unknown as string);
    expect(result).toBe('base-class');
  });

  it('returns empty string when given no arguments', () => {
    expect(cn()).toBe('');
  });
});

// ─── findCitationPath helpers ────────────────────────────────────────────────

const edge = (source: string, target: string): GraphEdge => ({
  source,
  target,
  type: 'citation',
  weight: 1,
});

const similarityEdge = (source: string, target: string): GraphEdge => ({
  source,
  target,
  type: 'similarity',
  weight: 0.8,
});

// ─── findCitationPath ────────────────────────────────────────────────────────

describe('findCitationPath', () => {
  describe('found path', () => {
    it('returns direct path when nodes are directly connected', () => {
      const edges = [edge('A', 'B')];
      const path = findCitationPath('A', 'B', edges);
      expect(path).toEqual(['A', 'B']);
    });

    it('finds a two-hop path', () => {
      const edges = [edge('A', 'B'), edge('B', 'C')];
      const path = findCitationPath('A', 'C', edges);
      expect(path).toEqual(['A', 'B', 'C']);
    });

    it('finds the shortest path among multiple routes', () => {
      // Short route: A→B→D (2 hops)
      // Long route:  A→C→E→D (3 hops)
      const edges = [
        edge('A', 'B'),
        edge('B', 'D'),
        edge('A', 'C'),
        edge('C', 'E'),
        edge('E', 'D'),
      ];
      const path = findCitationPath('A', 'D', edges);
      expect(path).toHaveLength(3); // ['A', 'B', 'D']
      expect(path![0]).toBe('A');
      expect(path![path!.length - 1]).toBe('D');
    });

    it('traverses edges in reverse direction (undirected BFS)', () => {
      // Edge goes B→A, but we search A→B (reverse)
      const edges = [edge('B', 'A')];
      const path = findCitationPath('A', 'B', edges);
      expect(path).toEqual(['A', 'B']);
    });

    it('finds path in a larger graph', () => {
      const edges = [
        edge('A', 'B'),
        edge('A', 'C'),
        edge('B', 'D'),
        edge('C', 'D'),
        edge('D', 'E'),
        edge('E', 'F'),
      ];
      const path = findCitationPath('A', 'F', edges);
      expect(path).not.toBeNull();
      expect(path![0]).toBe('A');
      expect(path![path!.length - 1]).toBe('F');
    });
  });

  describe('self-path', () => {
    it('returns a single-element path when start equals end', () => {
      const edges = [edge('A', 'B')];
      const path = findCitationPath('A', 'A', edges);
      expect(path).toEqual(['A']);
    });

    it('returns single-element path even with no edges', () => {
      const path = findCitationPath('X', 'X', []);
      expect(path).toEqual(['X']);
    });
  });

  describe('no path found', () => {
    it('returns null when there is no connection between nodes', () => {
      const edges = [edge('A', 'B'), edge('C', 'D')];
      const path = findCitationPath('A', 'D', edges);
      expect(path).toBeNull();
    });

    it('returns null for empty edges array', () => {
      const path = findCitationPath('A', 'B', []);
      expect(path).toBeNull();
    });

    it('returns null when target node does not exist in the graph', () => {
      const edges = [edge('A', 'B'), edge('B', 'C')];
      const path = findCitationPath('A', 'Z', edges);
      expect(path).toBeNull();
    });

    it('returns null when start node does not exist in the graph', () => {
      const edges = [edge('A', 'B'), edge('B', 'C')];
      const path = findCitationPath('Z', 'C', edges);
      expect(path).toBeNull();
    });
  });

  describe('edge type filtering', () => {
    it('ignores similarity edges and only traverses citation edges', () => {
      // Only a similarity edge connects A→B; no citation path exists
      const edges = [similarityEdge('A', 'B')];
      const path = findCitationPath('A', 'B', edges);
      expect(path).toBeNull();
    });

    it('uses citation edges while ignoring similarity edges in a mixed graph', () => {
      const edges = [
        similarityEdge('A', 'B'), // ignored
        edge('A', 'C'),           // citation
        edge('C', 'B'),           // citation
      ];
      const path = findCitationPath('A', 'B', edges);
      expect(path).toEqual(['A', 'C', 'B']);
    });

    it('ignores ghost edges', () => {
      const ghostEdge: GraphEdge = { source: 'A', target: 'B', type: 'ghost', weight: 0.5 };
      const path = findCitationPath('A', 'B', [ghostEdge]);
      expect(path).toBeNull();
    });
  });

  describe('cycle handling', () => {
    it('does not loop infinitely on cyclic graphs', () => {
      const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')];
      // A and D are disconnected; should terminate without hanging
      const path = findCitationPath('A', 'D', edges);
      expect(path).toBeNull();
    });

    it('finds a path in a graph with cycles', () => {
      const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A'), edge('C', 'D')];
      const path = findCitationPath('A', 'D', edges);
      expect(path).not.toBeNull();
      expect(path![path!.length - 1]).toBe('D');
    });
  });
});
