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
  intent: number;
  directional: number;
  composite: number;
}

export interface EvidenceDetail {
  actual_edges: number;
  max_possible_edges: number;
  centroid_similarity: number;
  total_year_span: number;
  total_cross_citations: number;
  methodology_ratio: number;
  background_ratio: number;
  citations_a_to_b: number;
  citations_b_to_a: number;
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
  bridge_papers: { paper_id: string; title: string; score: number; sim_to_cluster_a?: number; sim_to_cluster_b?: number }[];
  potential_edges: { source: string; target: string; similarity: number }[];
  research_questions: (string | { question: string; justification: string; methodology_hint: string })[];
  gap_score_breakdown?: GapScoreBreakdown;
  key_papers_a?: GapKeyPaper[];
  key_papers_b?: GapKeyPaper[];
  temporal_context?: { year_range_a: [number, number]; year_range_b: [number, number]; overlap_years: number };
  intent_summary?: { background: number; methodology: number; result: number };
  evidence_detail?: EvidenceDetail;
}

export interface GapAnalysis {
  gaps: StructuralGap[];
  summary: { total_gaps: number; avg_gap_strength: number };
}

// ─── Gap Report ─────────────────────────────────────────────────────

export interface GapReportSection {
  id: string;
  title: string;
  content: string;
}

export interface GapReportQuestion {
  question: string;
  justification: string;
  methodology_hint: string;
}

export interface GapReport {
  gap_id: string;
  title: string;
  generated_at: string;
  executive_summary: string;
  sections: GapReportSection[];
  research_questions: GapReportQuestion[];
  significance_statement?: string;
  limitations?: string;
  cited_papers: GapKeyPaper[];
  bibtex: string;
  raw_metrics: GapScoreBreakdown;
  snapshot_data_url?: string;
  llm_status?: 'success' | 'failed';
}

// ─── Academic Analysis (SNA) ─────────────────────────────────────────

export interface NetworkLevelMetrics {
  density: number;
  diameter: number | null;
  avg_path_length: number | null;
  reciprocity: number;
  transitivity: number;
  component_count: number;
  avg_degree: number;
  node_count: number;
  edge_count: number;
}

export interface NodeCentrality {
  paper_id: string;
  title: string;
  cluster_id: number;
  cluster_label: string;
  degree_in: number;
  degree_out: number;
  betweenness: number;
  closeness: number;
  pagerank: number;
  eigenvector: number;
}

export interface CommunityMetrics {
  cluster_id: number;
  label: string;
  paper_count: number;
  intra_density: number;
  avg_year: number;
  year_range: [number, number];
  h_index: number;
}

export interface StructuralHolesNode {
  paper_id: string;
  title: string;
  cluster_id: number;
  constraint: number;
  effective_size: number;
  efficiency: number;
}

export interface NetworkMetrics {
  network_level: NetworkLevelMetrics;
  node_centrality: NodeCentrality[];
  community_metrics: CommunityMetrics[];
  structural_holes: StructuralHolesNode[];
  modularity: number;
  silhouette: number;
}

export interface AcademicReportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  note: string;
}

export interface AcademicReport {
  methods_section: string;
  tables: {
    table_1: AcademicReportTable;
    table_2: AcademicReportTable;
    table_3: AcademicReportTable;
    table_4: AcademicReportTable;
    table_5: AcademicReportTable;
  };
  figure_captions: {
    figure_1: string;
    figure_2: string;
    figure_3: string;
  };
  reference_list: {
    methodology_refs: string[];
    analysis_refs: { paper_id: string; apa_citation: string }[];
  };
  network_metrics: NetworkMetrics;
  parameters: Record<string, any>;
  generated_at: string;
  feasibility: 'full' | 'partial' | 'insufficient';
  warnings: string[];
}

export interface NetworkOverview {
  node_count: number;
  edge_count: number;
  density: number;
  cluster_count: number;
  modularity: number;
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

// ─── Bookmarks (P10) ─────────────────────────────────────────────────

export interface Bookmark {
  id: string;
  paper_id: string;
  tags: string[];
  memo: string;
  created_at: string;
  updated_at: string;
}

// ─── Chat Actions (P13) ─────────────────────────────────────────────

export interface ChatAction {
  type: 'highlight_papers' | 'select_paper' | 'show_cluster' | 'set_edge_mode' | 'find_path';
  paper_ids?: string[];
  paper_id?: string;
  cluster_id?: number;
  mode?: string;
  start?: string;
  end?: string;
  label?: string;
}
