export interface Author {
  name: string;
  affiliations?: string[];
}

export interface Topic {
  id: string;
  display_name: string;
  score: number;
}

export interface Paper {
  id: string;
  s2_paper_id?: string;     // was s2_id
  oa_work_id?: string;      // was oa_id
  doi?: string;
  title: string;
  authors: Author[];
  year: number;
  venue?: string;
  citation_count: number;
  abstract?: string;
  tldr?: string;
  fields: string[];
  topics: Topic[];
  x: number;
  y: number;
  z: number;
  cluster_id: number;
  cluster_label: string;
  is_open_access: boolean;
  oa_url?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'citation' | 'similarity';
  weight: number;
  intent?: 'methodology' | 'background' | 'result_comparison';
}

export interface Cluster {
  id: number;
  label: string;
  topics: string[];
  paper_count: number;
  hull_points: [number, number, number][];
  color: string;
}

export interface GraphData {
  nodes: Paper[];
  edges: GraphEdge[];
  clusters: Cluster[];
  meta: {
    total: number;
    query: string;
    oa_credits_used: number;
  };
}

export interface SavedGraph {
  id: string;
  name: string;
  seed_query: string;
  paper_count: number;
  created_at: string;
  updated_at: string;
}

export interface SearchOptions {
  year_min?: number;
  year_max?: number;
  field?: string;
  limit?: number;
}

export const FIELD_COLORS: Record<string, string> = {
  'Physical Sciences': '#4A90D9',
  'Life Sciences': '#2ECC71',
  'Social Sciences': '#E67E22',
  'Health Sciences': '#E74C3C',
  'Engineering': '#9B59B6',
  'Arts & Humanities': '#F39C12',
  'Other': '#95A5A6',
};

export const INTENT_COLORS: Record<string, string> = {
  methodology: '#9B59B6',
  background: '#95A5A6',
  result_comparison: '#4A90D9',
  supports: '#2ECC71',
  contradicts: '#E74C3C',
};

// ─── Phase 2: Trend Analysis ────────────────────────────────────────

export interface ClusterTrend {
  cluster_id: number;
  cluster_label: string;
  classification: 'emerging' | 'stable' | 'declining';
  paper_count: number;
  year_range: [number, number];
  year_distribution: Record<number, number>;
  trend_strength: number;
  velocity: number;
  representative_papers: string[];
}

export interface TrendAnalysis {
  emerging: ClusterTrend[];
  stable: ClusterTrend[];
  declining: ClusterTrend[];
  summary: {
    total_papers: number;
    year_range: [number, number];
    cluster_count: number;
  };
}

// ─── Phase 2: Gap Analysis ──────────────────────────────────────────

export interface StructuralGap {
  gap_id: string;
  cluster_a: { id: number; label: string; paper_count: number };
  cluster_b: { id: number; label: string; paper_count: number };
  gap_strength: number;
  bridge_papers: { paper_id: string; title: string; score: number }[];
  potential_edges: { source: string; target: string; similarity: number }[];
  research_questions: string[];
}

export interface GapAnalysis {
  gaps: StructuralGap[];
  summary: { total_gaps: number; avg_gap_strength: number };
}

// ─── Phase 2: Chat ──────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: { paper_id: string; title: string; index: number }[];
  highlighted_papers?: string[];
  timestamp: string;
}

export interface ChatResponse {
  answer: string;
  citations: { paper_id: string; title: string; index: number }[];
  highlighted_papers: string[];
  suggested_followups: string[];
}

// ─── Phase 2: LLM Settings ─────────────────────────────────────────

export interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'google' | 'groq';
  api_key: string;
  model?: string;
}

export const TREND_COLORS: Record<string, string> = {
  emerging: '#2ECC71',
  stable: '#4A90D9',
  declining: '#E74C3C',
};

// ─── Phase 3: Watch Queries ─────────────────────────────────────────

export interface WatchQuery {
  id: string;
  query: string;
  filters: {
    year_min?: number;
    year_max?: number;
    field?: string;
    venue?: string;
  };
  notify_email: boolean;
  last_checked?: string;
  new_paper_count?: number;
  created_at: string;
}

// ─── Phase 3: Citation Intent (Enhanced) ────────────────────────────

export interface CitationIntent {
  citing_id: string;
  cited_id: string;
  basic_intent?: 'methodology' | 'background' | 'result_comparison';
  enhanced_intent?: 'supports' | 'contradicts' | 'extends' | 'applies' | 'compares';
  confidence?: number;
  context?: string;
  is_influential: boolean;
}

export const ENHANCED_INTENT_COLORS: Record<string, string> = {
  supports: '#2ECC71',     // green
  contradicts: '#E74C3C',  // red
  extends: '#3498DB',      // blue
  applies: '#9B59B6',      // purple
  compares: '#F39C12',     // orange
};

// ─── Phase 3: Literature Review ─────────────────────────────────────

export interface LitReviewSection {
  heading: string;
  content: string;
  paper_refs: string[];
}

export interface LitReview {
  title: string;
  sections: LitReviewSection[];
  references: string[];
  markdown: string;
  metadata: {
    paper_count: number;
    cluster_count: number;
    generation_time: number;
  };
}
