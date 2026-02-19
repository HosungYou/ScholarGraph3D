import type { GraphData, SavedGraph, SearchOptions } from '@/types';
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
};

export default api;
