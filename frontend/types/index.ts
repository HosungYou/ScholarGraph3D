export interface Author {
  name: string;
  id?: string;
  affiliations?: string[];
}

export interface Topic {
  id: string;
  display_name: string;
  score: number;
}

export interface Paper {
  id: string;
  s2_paper_id?: string;
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
  is_bridge?: boolean;
  frontier_score?: number;  // 0-1: how many unexplored connections
  direction?: 'seed' | 'reference' | 'citation';
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'citation' | 'similarity' | 'ghost';
  weight: number;
  is_influential?: boolean;
  // Best-effort intent from the search endpoint (heuristic for similarity edges,
  // S2-native for citation edges). Full LLM-enhanced intents are available via
  // the /api/papers/{id}/intents endpoint and use the CitationIntent interface.
  intent?: 'methodology' | 'background' | 'result_comparison' | 'supports' | 'contradicts';
}

export interface Cluster {
  id: number;
  label: string;
  topics: string[];
  paper_count: number;
  hull_points: [number, number, number][];
  color: string;
  centroid?: [number, number, number];   // Arithmetic mean centroid
}

export interface GraphData {
  nodes: Paper[];
  edges: GraphEdge[];
  clusters: Cluster[];
  gaps?: StructuralGap[];
  frontier_ids?: string[];
  meta: {
    total: number;
    query: string;
    oa_credits_used: number;
    cluster_silhouette?: number;
    [key: string]: any;
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

// ─── Paper Search (NL → Selection) ───────────────────────────────────

export interface PaperSearchResult {
  paper_id: string;
  title: string;
  authors: { name: string }[];
  year: number;
  citation_count: number;
  abstract_snippet?: string;
  fields: string[];
  doi?: string;
  venue?: string;
}

// ─── Gap Analysis ────────────────────────────────────────────────────

export interface GapScoreBreakdown {
  structural: number;
  relatedness: number;
  temporal: number;
  composite: number;
}

export interface EvidenceDetail {
  actual_edges: number;
  max_possible_edges: number;
  centroid_similarity: number;
  total_year_span: number;
}

export interface GapKeyPaper {
  paper_id: string;
  title: string;
  tldr?: string;
  citation_count: number;
}

export interface StructuralGap {
  gap_id: string;
  cluster_a: { id: number; label: string; paper_count: number };
  cluster_b: { id: number; label: string; paper_count: number };
  gap_strength: number;
  bridge_papers: { paper_id: string; title: string; score: number; sim_to_cluster_a?: number; sim_to_cluster_b?: number; cited_by_a_count?: number; cited_by_b_count?: number }[];
  potential_edges: { source: string; target: string; similarity: number }[];
  research_questions: (string | { question: string; justification: string; methodology_hint: string })[];
  gap_score_breakdown?: GapScoreBreakdown;
  key_papers_a?: GapKeyPaper[];
  key_papers_b?: GapKeyPaper[];
  temporal_context?: { year_range_a: [number, number]; year_range_b: [number, number]; overlap_years: number };
  evidence_detail?: EvidenceDetail;
}

export interface GapAnalysis {
  gaps: StructuralGap[];
  summary: { total_gaps: number; avg_gap_strength: number };
}

// ─── Citation Intent (Enhanced) ──────────────────────────────────────

export interface CitationIntent {
  citing_id: string;
  cited_id: string;
  basic_intent?: 'methodology' | 'background' | 'result_comparison';
  confidence?: number;
  context?: string;
  is_influential: boolean;
}

