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
