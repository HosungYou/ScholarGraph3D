import type {
  GraphData,
  SavedGraph,
  SearchOptions,
  TrendAnalysis,
  GapAnalysis,
  StructuralGap,
  ChatMessage,
  ChatResponse,
  LLMSettings,
  Cluster,
  GraphEdge,
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
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || error.message || `API Error: ${response.status}`
    );
  }

  return response.json();
}

export const api = {
  // Search
  search: (query: string, options?: SearchOptions): Promise<GraphData> =>
    request<GraphData>(`${API_BASE}/api/search`, {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    }),

  // Papers
  getPaper: (id: string) =>
    request(`${API_BASE}/api/papers/${id}`),

  getCitations: (id: string) =>
    request(`${API_BASE}/api/papers/${id}/citations`),

  getReferences: (id: string) =>
    request(`${API_BASE}/api/papers/${id}/references`),

  expandPaper: (id: string): Promise<{ nodes: import('@/types').Paper[]; edges: import('@/types').GraphEdge[] }> =>
    request(`${API_BASE}/api/papers/${id}/expand`, { method: 'POST' }),

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

  loadGraph: async (id: string): Promise<GraphData> =>
    request<GraphData>(`${API_BASE}/api/graphs/${id}`),

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

  // Health
  health: (): Promise<{ status: string }> =>
    request(`${API_BASE}/health`),

  // ─── Phase 2: Analysis ──────────────────────────────────────────

  analyzeTrends: (
    paperIds: string[],
    clusters: Cluster[]
  ): Promise<TrendAnalysis> =>
    request<TrendAnalysis>(`${API_BASE}/api/analysis/trends`, {
      method: 'POST',
      body: JSON.stringify({ paper_ids: paperIds, clusters }),
    }),

  analyzeGaps: (
    paperIds: string[],
    clusters: Cluster[],
    edges: GraphEdge[]
  ): Promise<GapAnalysis> =>
    request<GapAnalysis>(`${API_BASE}/api/analysis/gaps`, {
      method: 'POST',
      body: JSON.stringify({ paper_ids: paperIds, clusters, edges }),
    }),

  generateHypotheses: (
    gapId: string,
    gap: StructuralGap,
    llm: LLMSettings
  ): Promise<string[]> =>
    request<string[]>(`${API_BASE}/api/analysis/hypotheses`, {
      method: 'POST',
      body: JSON.stringify({ gap_id: gapId, gap, llm }),
    }),

  // ─── Phase 2: Chat ─────────────────────────────────────────────

  sendChatMessage: (
    query: string,
    graphData: GraphData,
    llm: LLMSettings,
    history?: ChatMessage[]
  ): Promise<ChatResponse> =>
    request<ChatResponse>(`${API_BASE}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        graph_data: {
          paper_ids: graphData.nodes.map((n) => n.id),
          cluster_count: graphData.clusters.length,
          edge_count: graphData.edges.length,
        },
        llm,
        history: history?.map((m) => ({ role: m.role, content: m.content })),
      }),
    }),

  streamChatMessage: async (
    query: string,
    graphData: GraphData,
    llm: LLMSettings,
    history?: ChatMessage[],
    onChunk?: (text: string) => void
  ): Promise<void> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        query,
        graph_data: {
          paper_ids: graphData.nodes.map((n) => n.id),
          cluster_count: graphData.clusters.length,
          edge_count: graphData.edges.length,
        },
        llm,
        history: history?.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.detail || error.message || `API Error: ${response.status}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // Parse SSE lines
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text && onChunk) {
              onChunk(parsed.text);
            }
          } catch {
            // Plain text chunk
            if (onChunk) onChunk(data);
          }
        }
      }
    }
  },
};

export default api;
