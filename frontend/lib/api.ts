import type {
  GraphData,
  SavedGraph,
  CitationIntent,
  Paper,
} from '@/types';
import { getSession } from './supabase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const session = await getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // No session available
  }
  return {};
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  timeout: number = 20000
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const method = options.method || 'GET';
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const makeRequest = async (retryCount = 0): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 429 && retryCount === 0) {
        const retryAfter = Math.min(
          Number(response.headers.get('retry-after') || '3'),
          10
        );
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[API] 429 rate limited, retrying in ${retryAfter}s...`);
        }
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return makeRequest(1);
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const status = response.status;
        let message = error.detail || error.message || `API Error: ${status}`;
        if (status === 429) message = `Rate limited. Please wait and try again.`;
        else if (status === 404) message = `Paper not found in Semantic Scholar. Try a different paper.`;
        else if (status >= 500) message = `Server error. The external API may be down. Try again later.`;
        throw new Error(message);
      }

      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[API] ${method} ${url} — ${Math.round(elapsed)}ms`);
      }

      return response.json();
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out. The server may be busy.');
      }

      // Network error retry (TypeError from fetch = network failure)
      if (err instanceof TypeError && retryCount === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[API] Network error, retrying in 2s...`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return makeRequest(1);
      }

      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[API] ${method} ${url} — FAILED after ${Math.round(elapsed)}ms:`, err);
      }

      throw err;
    }
  };

  return makeRequest();
}

export const api = {
  expandPaperStable: (
    id: string,
    existingNodes: import('@/types').Paper[],
    existingEdges: import('@/types').GraphEdge[]
  ): Promise<{ nodes: import('@/types').Paper[]; edges: import('@/types').GraphEdge[]; meta?: { references_ok: boolean; citations_ok: boolean; refs_count: number; cites_count: number; error_detail?: string } }> =>
    request(`${API_BASE}/api/papers/${encodeURIComponent(id)}/expand-stable`, {
      method: 'POST',
      body: JSON.stringify({
        existing_nodes: existingNodes.map((n) => ({
          id: n.id,
          x: n.x,
          y: n.y,
          z: n.z,
          cluster_id: n.cluster_id,
        })),
        limit: 20,
      }),
    }).then((r: any) => ({
      nodes: (r.nodes || []).map((n: any) => ({
        id: n.paper_id,
        title: n.title || '',
        authors: n.authors || [],
        year: n.year || 0,
        venue: n.venue,
        citation_count: n.citation_count || 0,
        abstract: n.abstract || undefined,
        tldr: n.tldr || undefined,
        fields: n.fields || [],
        topics: [],
        x: n.initial_x || 0,
        y: n.initial_y || 0,
        z: n.initial_z || 0,
        cluster_id: n.cluster_id ?? -1,
        cluster_label: 'Expanded',
        is_open_access: n.is_open_access || false,
        oa_url: undefined,
        is_bridge: false,
        frontier_score: n.frontier_score || 0,
        s2_paper_id: n.paper_id,
        doi: n.doi || undefined,
      })),
      edges: r.edges || [],
      meta: r.meta,
    })),

  // Saved Graphs (auth required)
  listGraphs: async (): Promise<SavedGraph[]> =>
    request<SavedGraph[]>(`${API_BASE}/api/graphs`),

  saveGraph: async (data: {
    name: string;
    seed_query: string;
    graph_data: GraphData;
  }): Promise<SavedGraph> =>
    request<SavedGraph>(`${API_BASE}/api/graphs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGraph: async (
    id: string,
    data: {
      name?: string;
      graph_data?: GraphData;
      paper_ids?: string[];
      layout_state?: Record<string, unknown>;
    }
  ): Promise<SavedGraph> =>
    request<SavedGraph>(`${API_BASE}/api/graphs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  loadGraph: async (id: string): Promise<GraphData> => {
    const detail = await request<{ graph_data?: GraphData }>(`${API_BASE}/api/graphs/${id}`);
    if (detail.graph_data) return detail.graph_data;
    throw new Error('Graph has no saved data');
  },

  deleteGraph: async (id: string): Promise<void> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/graphs/${id}`, {
      method: 'DELETE',
      headers: { ...authHeaders },
    });
    if (!response.ok) {
      throw new Error(`Failed to delete graph: ${response.status}`);
    }
  },

  // ─── Citation Intent ──────────────────────────────────────────────

  getCitationIntents: (
    paperId: string,
    enhanced?: boolean
  ): Promise<CitationIntent[]> => {
    const params = new URLSearchParams();
    if (enhanced) params.set('enhanced', 'true');
    const qs = params.toString();
    return request<CitationIntent[]>(
      `${API_BASE}/api/papers/${encodeURIComponent(paperId)}/intents${qs ? '?' + qs : ''}`
    );
  },

  // ─── Paper Search (NL → Selection) ──────────────────────────────
  searchPapers: (
    query: string,
    limit?: number
  ): Promise<{ papers: import('@/types').PaperSearchResult[]; refined_query?: string }> =>
    request(`${API_BASE}/api/paper-search`, {
      method: 'POST',
      body: JSON.stringify({ query, limit: limit || 10 }),
    }),

  getPaperByDOI: (doi: string): Promise<{
    paper_id: string;
    title: string;
    doi: string;
    source?: string;
  }> =>
    request(`${API_BASE}/api/papers/by-doi?doi=${encodeURIComponent(doi)}`),

  getPaperDetails: (paperId: string): Promise<Paper> =>
    request<any>(`${API_BASE}/api/papers/${encodeURIComponent(paperId)}`).then((paper) => ({
      id: paper.id || paper.s2_paper_id || paper.paper_id || paperId,
      s2_paper_id: paper.s2_paper_id || paper.paper_id || undefined,
      doi: paper.doi || undefined,
      title: paper.title || '',
      authors: paper.authors || [],
      year: paper.year || 0,
      venue: paper.venue || undefined,
      citation_count: paper.citation_count || 0,
      abstract: paper.abstract || undefined,
      tldr: paper.tldr || undefined,
      fields: paper.fields || paper.fields_of_study || [],
      topics: paper.topics || [],
      x: 0,
      y: 0,
      z: 0,
      cluster_id: -1,
      cluster_label: 'Saved Paper',
      is_open_access: paper.is_open_access || false,
      oa_url: paper.oa_url || undefined,
      is_bridge: false,
      frontier_score: 0,
    })),

  // ─── Seed Paper Exploration ──────────────────────────────────────
  seedExplore: (
    paperId: string,
    options?: { depth?: number; max_papers?: number; include_references?: boolean; include_citations?: boolean }
  ): Promise<GraphData> =>
    request<GraphData>(`${API_BASE}/api/seed-explore`, {
      method: 'POST',
      body: JSON.stringify({
        paper_id: paperId,
        depth: options?.depth ?? 1,
        max_papers: options?.max_papers ?? 50,
        include_references: options?.include_references ?? true,
        include_citations: options?.include_citations ?? true,
      }),
    }, 30000),
};

export default api;
