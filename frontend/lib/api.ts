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
  WatchQuery,
  CitationIntent,
  LitReview,
  UserProfile,
  Recommendation,
  InteractionEvent,
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

  expandPaperStable: (
    id: string,
    existingNodes: import('@/types').Paper[],
    existingEdges: import('@/types').GraphEdge[]
  ): Promise<{ nodes: import('@/types').Paper[]; edges: import('@/types').GraphEdge[] }> =>
    request(`${API_BASE}/api/papers/${id}/expand-stable`, {
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
        authors: [],
        year: n.year || 0,
        venue: n.venue,
        citation_count: n.citation_count || 0,
        abstract: undefined,
        tldr: undefined,
        fields: [],
        topics: [],
        x: n.initial_x || 0,
        y: n.initial_y || 0,
        z: n.initial_z || 0,
        cluster_id: n.cluster_id ?? -1,
        cluster_label: 'Expanded',
        is_open_access: n.is_open_access || false,
        oa_url: undefined,
        is_bridge: false,
      })),
      edges: r.edges || [],
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
    papers: import('@/types').Paper[],
    clusters: import('@/types').Cluster[]
  ): Promise<TrendAnalysis> =>
    request<TrendAnalysis>(`${API_BASE}/api/analysis/trends`, {
      method: 'POST',
      body: JSON.stringify({
        papers: papers.map((p) => ({
          id: p.id,
          title: p.title,
          abstract: p.abstract,
          year: p.year,
          citation_count: p.citation_count,
          cluster_id: p.cluster_id,
          cluster_label: p.cluster_label,
          tldr: p.tldr,
          authors: p.authors,
          fields: p.fields,
        })),
        clusters: clusters.map((c) => ({
          id: c.id,
          label: c.label,
          topics: c.topics,
          paper_count: c.paper_count,
        })),
      }),
    }),

  analyzeGaps: (
    papers: import('@/types').Paper[],
    clusters: import('@/types').Cluster[],
    edges: import('@/types').GraphEdge[]
  ): Promise<GapAnalysis> =>
    request<GapAnalysis>(`${API_BASE}/api/analysis/gaps`, {
      method: 'POST',
      body: JSON.stringify({
        papers: papers.map((p) => ({
          id: p.id,
          title: p.title,
          abstract: p.abstract,
          year: p.year,
          citation_count: p.citation_count,
          cluster_id: p.cluster_id,
          cluster_label: p.cluster_label,
          tldr: p.tldr,
          authors: p.authors,
          fields: p.fields,
        })),
        clusters: clusters.map((c) => ({
          id: c.id,
          label: c.label,
          topics: c.topics,
          paper_count: c.paper_count,
        })),
        edges: edges.map((e) => ({
          source: e.source,
          target: e.target,
          type: e.type,
          weight: e.weight,
        })),
      }),
    }),

  generateHypotheses: (
    gapId: string,
    gap: StructuralGap,
    llm: LLMSettings
  ): Promise<string[]> =>
    request<{ gap_id: string; hypotheses: string[]; provider: string; model: string }>(
      `${API_BASE}/api/analysis/gaps/${gapId}/hypotheses`,
      {
        method: 'POST',
        body: JSON.stringify({
          provider: llm.provider,
          api_key: llm.api_key,
          model: llm.model,
          gap: {
            gap_id: gap.gap_id,
            cluster_a: gap.cluster_a,
            cluster_b: gap.cluster_b,
            gap_strength: gap.gap_strength,
            bridge_papers: gap.bridge_papers,
            potential_edges: gap.potential_edges,
            research_questions: gap.research_questions,
          },
        }),
      }
    ).then((r) => r.hypotheses),

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
          papers: graphData.nodes.map((n) => ({
            id: n.id,
            title: n.title,
            abstract: n.abstract,
            year: n.year,
            citation_count: n.citation_count,
            cluster_id: n.cluster_id,
            cluster_label: n.cluster_label,
            tldr: n.tldr,
            authors: n.authors,
            fields: n.fields,
          })),
          clusters: graphData.clusters,
          edges: graphData.edges,
          gaps: [],
        },
        provider: llm.provider,
        api_key: llm.api_key,
        model: llm.model,
        conversation_history: (history || []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    }),

  // ─── Phase 3: Watch Queries ────────────────────────────────────────

  listWatchQueries: (): Promise<WatchQuery[]> =>
    request<WatchQuery[]>(`${API_BASE}/api/watch`),

  createWatchQuery: (
    query: string,
    filters: object,
    notifyEmail: boolean
  ): Promise<WatchQuery> =>
    request<WatchQuery>(`${API_BASE}/api/watch`, {
      method: 'POST',
      body: JSON.stringify({ query, filters, notify_email: notifyEmail }),
    }),

  deleteWatchQuery: async (id: string): Promise<void> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/watch/${id}`, {
      method: 'DELETE',
      headers: { ...authHeaders },
    });
    if (!response.ok) {
      throw new Error(`Failed to delete watch query: ${response.status}`);
    }
  },

  triggerWatchCheck: (): Promise<{ total_queries: number; new_papers: number }> =>
    request<{ total_queries: number; new_papers: number }>(
      `${API_BASE}/api/watch/check`,
      { method: 'POST' }
    ),

  // ─── Phase 3: Citation Intent ────────────────────────────────────

  getCitationIntents: (
    paperId: string,
    enhanced?: boolean,
    llm?: LLMSettings
  ): Promise<CitationIntent[]> =>
    request<CitationIntent[]>(
      `${API_BASE}/api/papers/${paperId}/citation-intents`,
      {
        method: 'POST',
        body: JSON.stringify({ enhanced: enhanced ?? false, llm }),
      }
    ),

  // ─── Phase 3: Literature Review ──────────────────────────────────

  generateLitReview: (
    graphData: GraphData,
    llm: LLMSettings,
    options?: {
      includeTrends?: boolean;
      includeGaps?: boolean;
      citationStyle?: string;
    }
  ): Promise<LitReview> =>
    request<LitReview>(`${API_BASE}/api/lit-review/generate`, {
      method: 'POST',
      body: JSON.stringify({
        graph_data: {
          paper_ids: graphData.nodes.map((n) => n.id),
          clusters: graphData.clusters,
          edges: graphData.edges,
        },
        llm,
        options: {
          include_trends: options?.includeTrends ?? true,
          include_gaps: options?.includeGaps ?? true,
          citation_style: options?.citationStyle ?? 'APA',
        },
      }),
    }),

  exportLitReviewPdf: async (markdown: string): Promise<Blob> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/lit-review/export-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ markdown }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.detail || error.message || `PDF export failed: ${response.status}`
      );
    }
    return response.blob();
  },

  // ─── Phase 2: Chat (continued) ──────────────────────────────────

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
          papers: graphData.nodes.map((n) => ({
            id: n.id,
            title: n.title,
            abstract: n.abstract,
            year: n.year,
            citation_count: n.citation_count,
            cluster_id: n.cluster_id,
            cluster_label: n.cluster_label,
            tldr: n.tldr,
            authors: n.authors,
            fields: n.fields,
          })),
          clusters: graphData.clusters,
          edges: graphData.edges,
          gaps: [],
        },
        provider: llm.provider,
        api_key: llm.api_key,
        model: llm.model,
        conversation_history: (history || []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
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
            if (parsed.content && onChunk) {
              onChunk(parsed.content);
            } else if (parsed.text && onChunk) {
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

  // ─── Phase 4: Conceptual Edges ──────────────────────────────────────

  streamConceptualEdges: (
    paperIds: string[],
    onEdge: (edge: import('@/types').ConceptualEdge) => void,
    onProgress: (msg: string) => void,
    onComplete: (total: number) => void,
    onError: (msg: string) => void
  ): (() => void) => {
    const params = new URLSearchParams({ paper_ids: paperIds.join(',') });
    const es = new EventSource(`${API_BASE}/api/analysis/conceptual-edges/stream?${params}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'edge') {
          onEdge({
            source: data.source,
            target: data.target,
            relation_type: data.relation_type,
            weight: data.weight,
            explanation: data.explanation,
            color: data.color,
          });
        } else if (data.type === 'progress') {
          onProgress(data.message || '');
        } else if (data.type === 'complete') {
          onComplete(data.total_edges || 0);
          es.close();
        } else if (data.type === 'error') {
          onError(data.message || 'Unknown error');
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      onError('Connection error');
      es.close();
    };

    // Return cleanup function
    return () => es.close();
  },

  generateScaffoldAngles: (question: string): Promise<{
    angles: { label: string; query: string; type: string }[];
  }> =>
    request(`${API_BASE}/api/analysis/scaffold-angles`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),

  getPaperByDOI: (doi: string): Promise<{
    paper_id: string;
    title: string;
    doi: string;
    redirect_query: string;
  }> =>
    request(`${API_BASE}/api/papers/by-doi?doi=${encodeURIComponent(doi)}`),

  // ─── Phase 5: Personalization ──────────────────────────────────────

  getUserProfile: (): Promise<UserProfile> =>
    request<UserProfile>(`${API_BASE}/api/user/profile`),

  updateUserProfile: (prefs: Partial<UserProfile>): Promise<UserProfile> =>
    request<UserProfile>(`${API_BASE}/api/user/profile`, {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),

  logInteraction: (event: InteractionEvent): Promise<void> =>
    request<void>(`${API_BASE}/api/user/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    }).catch(() => { /* fire-and-forget, never throw */ }),

  logSearch: (
    query: string,
    mode: string,
    resultCount: number,
    filtersUsed?: Record<string, unknown>
  ): Promise<void> =>
    request<void>(`${API_BASE}/api/user/search-history`, {
      method: 'POST',
      body: JSON.stringify({ query, mode, result_count: resultCount, filters_used: filtersUsed }),
    }).catch(() => { /* fire-and-forget */ }),

  getRecommendations: (): Promise<Recommendation[]> =>
    request<Recommendation[]>(`${API_BASE}/api/user/recommendations`),

  dismissRecommendation: async (id: string): Promise<void> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/user/recommendations/${id}/dismiss`, {
      method: 'DELETE',
      headers: { ...authHeaders },
    });
    if (!response.ok) {
      throw new Error(`Failed to dismiss recommendation: ${response.status}`);
    }
  },
};

export default api;
