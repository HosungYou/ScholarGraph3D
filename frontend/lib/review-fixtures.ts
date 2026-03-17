import type { GraphData, GraphEdge, NetworkOverview, Paper, StructuralGap } from '@/types';

export type ExpandResult = {
  nodes: Paper[];
  edges: GraphEdge[];
  meta?: {
    references_ok: boolean;
    citations_ok: boolean;
    refs_count: number;
    cites_count: number;
    error_detail?: string;
  };
};

export type ReviewFixture = {
  id: string;
  label: string;
  description: string;
  graph: GraphData;
  overview: NetworkOverview | null;
  expansions: Record<string, ExpandResult>;
};

const makePaper = (
  id: string,
  overrides: Partial<Paper> = {}
): Paper => ({
  id,
  s2_paper_id: id,
  title: 'Untitled Paper',
  authors: [{ name: 'Unknown Author' }],
  year: 2024,
  citation_count: 0,
  fields: ['Computer Science'],
  topics: [],
  x: 0,
  y: 0,
  z: 0,
  cluster_id: -1,
  cluster_label: 'Unclustered',
  is_open_access: false,
  ...overrides,
});

const makeEdge = (
  source: string,
  target: string,
  type: GraphEdge['type'],
  weight: number,
  intent?: GraphEdge['intent']
): GraphEdge => ({
  source,
  target,
  type,
  weight,
  ...(intent ? { intent } : {}),
});

const fixture: ReviewFixture = {
  id: 'transformer-review',
  label: 'Transformer Review Workspace',
  description:
    'A compact fixture for visual review of graph loading, detail view, expand flow, gap panel, and academic insight tabs.',
  graph: {
    nodes: [
      makePaper('seed-transformer', {
        title: 'Attention Is All You Need',
        doi: '10.48550/arXiv.1706.03762',
        authors: [
          { name: 'Ashish Vaswani' },
          { name: 'Noam Shazeer' },
          { name: 'Niki Parmar' },
        ],
        year: 2017,
        citation_count: 124000,
        venue: 'NeurIPS',
        abstract:
          'The Transformer replaces recurrence with self-attention and enables efficient sequence modeling.',
        tldr:
          'Introduces a sequence transduction model built entirely on attention mechanisms.',
        fields: ['Computer Science'],
        x: 0,
        y: 1.2,
        z: 0.2,
        cluster_id: 0,
        cluster_label: 'Foundation Models',
        is_open_access: true,
        oa_url: 'https://arxiv.org/abs/1706.03762',
        pagerank: 1,
        betweenness: 0.9,
        direction: 'seed',
      }),
      makePaper('bert', {
        title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
        doi: '10.48550/arXiv.1810.04805',
        authors: [{ name: 'Jacob Devlin' }, { name: 'Ming-Wei Chang' }],
        year: 2018,
        citation_count: 96000,
        venue: 'NAACL',
        abstract: 'BERT pre-trains deep bidirectional representations from unlabeled text.',
        tldr: 'Bidirectional pre-training substantially improves many NLP tasks.',
        fields: ['Computer Science'],
        x: -4.6,
        y: 3.1,
        z: -1.1,
        cluster_id: 0,
        cluster_label: 'Foundation Models',
        is_open_access: true,
        oa_url: 'https://arxiv.org/abs/1810.04805',
        pagerank: 0.84,
        betweenness: 0.48,
        direction: 'citation',
      }),
      makePaper('gpt4', {
        title: 'GPT-4 Technical Report',
        doi: '10.48550/arXiv.2303.08774',
        authors: [{ name: 'OpenAI' }],
        year: 2023,
        citation_count: 16500,
        venue: 'arXiv',
        abstract: 'The GPT-4 report describes model capabilities, limitations, and evaluation results.',
        tldr: 'Large multimodal model with broad benchmark gains and significant caveats.',
        fields: ['Computer Science'],
        x: 4.8,
        y: 2.6,
        z: 1.4,
        cluster_id: 0,
        cluster_label: 'Foundation Models',
        is_open_access: true,
        oa_url: 'https://arxiv.org/abs/2303.08774',
        pagerank: 0.72,
        betweenness: 0.31,
        direction: 'citation',
      }),
      makePaper('alphafold2', {
        title: 'Highly accurate protein structure prediction with AlphaFold',
        doi: '10.1038/s41586-021-03819-2',
        authors: [{ name: 'John Jumper' }, { name: 'Richard Evans' }],
        year: 2021,
        citation_count: 42000,
        venue: 'Nature',
        abstract: 'AlphaFold demonstrates dramatic gains on protein structure prediction.',
        tldr: 'Deep learning advances enable near-experimental protein folding accuracy.',
        fields: ['Biology', 'Computer Science'],
        x: 10.5,
        y: -2.8,
        z: 3.1,
        cluster_id: 1,
        cluster_label: 'Computational Biology',
        is_open_access: false,
        pagerank: 0.58,
        betweenness: 0.27,
        direction: 'citation',
      }),
      makePaper('gnn-drug', {
        title: 'Graph Neural Networks for Drug Discovery',
        authors: [{ name: 'Priya Raman' }],
        year: 2022,
        citation_count: 880,
        venue: 'Patterns',
        abstract: 'Graph neural networks improve molecular property prediction and candidate ranking.',
        tldr: 'Domain-specific graph learning bridges chemistry and representation learning.',
        fields: ['Biology', 'Computer Science'],
        x: 7.8,
        y: -5.9,
        z: 1.6,
        cluster_id: 1,
        cluster_label: 'Computational Biology',
        is_open_access: true,
        oa_url: 'https://doi.org/10.1016/j.patter.2022.100588',
        is_bridge: true,
        frontier_score: 0.81,
        pagerank: 0.39,
        betweenness: 0.71,
        direction: 'citation',
      }),
      makePaper('rlhf', {
        title: 'Training language models to follow instructions with human feedback',
        doi: '10.48550/arXiv.2203.02155',
        authors: [{ name: 'Long Ouyang' }],
        year: 2022,
        citation_count: 9800,
        venue: 'NeurIPS',
        abstract: 'RLHF aligns large language models with human preference data.',
        tldr: 'Instruction-following improves via supervised fine-tuning and reinforcement learning from feedback.',
        fields: ['Computer Science'],
        x: 2.6,
        y: 5.1,
        z: 2.8,
        cluster_id: 0,
        cluster_label: 'Foundation Models',
        is_open_access: true,
        oa_url: 'https://arxiv.org/abs/2203.02155',
        frontier_score: 0.44,
        pagerank: 0.46,
        betweenness: 0.19,
        direction: 'citation',
      }),
    ],
    edges: [
      makeEdge('bert', 'seed-transformer', 'citation', 1, 'background'),
      makeEdge('gpt4', 'seed-transformer', 'citation', 1, 'methodology'),
      makeEdge('rlhf', 'seed-transformer', 'citation', 1, 'supports'),
      makeEdge('gnn-drug', 'alphafold2', 'citation', 1, 'result_comparison'),
      makeEdge('seed-transformer', 'bert', 'similarity', 0.88),
      makeEdge('seed-transformer', 'gpt4', 'similarity', 0.86),
      makeEdge('gpt4', 'rlhf', 'similarity', 0.82),
      makeEdge('alphafold2', 'gnn-drug', 'similarity', 0.84),
      makeEdge('seed-transformer', 'gnn-drug', 'similarity', 0.72),
    ],
    clusters: [
      {
        id: 0,
        label: 'Foundation Models',
        topics: ['transformers', 'language models', 'instruction tuning'],
        paper_count: 4,
        hull_points: [],
        color: '#4DA6FF',
        centroid: [0.5, 3.2, 1.0],
      },
      {
        id: 1,
        label: 'Computational Biology',
        topics: ['protein folding', 'drug discovery'],
        paper_count: 2,
        hull_points: [],
        color: '#69F0AE',
        centroid: [9.1, -4.2, 2.3],
      },
    ],
    gaps: [
      {
        gap_id: 'gap-transformer-biology',
        cluster_a: { id: 0, label: 'Foundation Models', paper_count: 4 },
        cluster_b: { id: 1, label: 'Computational Biology', paper_count: 2 },
        gap_strength: 0.83,
        bridge_papers: [
          {
            paper_id: 'gnn-drug',
            title: 'Graph Neural Networks for Drug Discovery',
            score: 0.81,
            sim_to_cluster_a: 0.72,
            sim_to_cluster_b: 0.86,
          },
        ],
        potential_edges: [
          { source: 'gpt4', target: 'alphafold2', similarity: 0.71 },
          { source: 'rlhf', target: 'gnn-drug', similarity: 0.68 },
        ],
        research_questions: [
          {
            question: 'How can instruction-tuned foundation models support protein design workflows?',
            justification:
              'Both clusters rely on representation learning but differ in evaluation pipelines and domain constraints.',
            methodology_hint:
              'Prototype a retrieval-plus-reasoning benchmark combining protein structure tasks with natural-language planning.',
          },
        ],
        gap_score_breakdown: {
          structural: 0.89,
          relatedness: 0.73,
          temporal: 0.61,
          intent: 0.44,
          directional: 0.58,
          structural_holes: 0.77,
          influence: 0.69,
          author_silo: 0.86,
          venue_diversity: 0.83,
          composite: 0.83,
        },
        key_papers_a: [
          {
            paper_id: 'seed-transformer',
            title: 'Attention Is All You Need',
            citation_count: 124000,
            tldr: 'Sequence modeling using self-attention.',
          },
        ],
        key_papers_b: [
          {
            paper_id: 'alphafold2',
            title: 'Highly accurate protein structure prediction with AlphaFold',
            citation_count: 42000,
            tldr: 'Deep learning for protein folding.',
          },
        ],
        temporal_context: {
          year_range_a: [2017, 2023],
          year_range_b: [2021, 2022],
          overlap_years: 2,
        },
        intent_summary: {
          background: 1,
          methodology: 1,
          result: 1,
        },
        evidence_detail: {
          actual_edges: 1,
          max_possible_edges: 8,
          centroid_similarity: 0.73,
          total_year_span: 6,
          total_cross_citations: 1,
          methodology_ratio: 0.33,
          background_ratio: 0.33,
          citations_a_to_b: 0,
          citations_b_to_a: 1,
          shared_author_count: 0,
          unique_authors_a: 7,
          unique_authors_b: 3,
        },
        actionability: {
          score: 0.78,
          breakdown: {
            bridge_feasibility: 0.78,
            open_access_ratio: 0.66,
            recency: 0.58,
            method_transferability: 0.85,
            terminology_similarity: 0.41,
          },
          recommendation: 'high_opportunity',
        },
      },
    ],
    frontier_ids: ['gnn-drug', 'rlhf'],
    meta: {
      total: 6,
      query: 'transformers in biology',
      oa_credits_used: 0,
      seed_title: 'Attention Is All You Need',
      seed_paper_id: 'seed-transformer',
      citation_edges: 4,
      similarity_edges: 5,
      cluster_silhouette: 0.58,
    },
  },
  overview: {
    node_count: 6,
    edge_count: 9,
    density: 0.3,
    cluster_count: 2,
    modularity: 0.38,
  },
  expansions: {
    'seed-transformer': {
      nodes: [
        makePaper('vision-transformer', {
          title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale',
          authors: [{ name: 'Alexey Dosovitskiy' }],
          year: 2021,
          citation_count: 25500,
          venue: 'ICLR',
          abstract: 'Applies transformers directly to image patches for visual recognition.',
          tldr: 'Vision Transformers scale effectively on large image datasets.',
          fields: ['Computer Science'],
          x: -2.8,
          y: 6.8,
          z: 2.4,
          cluster_id: 0,
          cluster_label: 'Foundation Models',
          is_open_access: true,
          frontier_score: 0.67,
          direction: 'citation',
        }),
        makePaper('protein-lm', {
          title: 'Language models of protein sequences enable biological structure and function prediction',
          authors: [{ name: 'Roshan Rao' }],
          year: 2021,
          citation_count: 6400,
          venue: 'bioRxiv',
          abstract: 'Protein language models reveal structure and function from sequence-only training.',
          tldr: 'Sequence-only transformers can learn transferable biological representations.',
          fields: ['Biology', 'Computer Science'],
          x: 6.3,
          y: -0.8,
          z: 2.8,
          cluster_id: 1,
          cluster_label: 'Computational Biology',
          is_open_access: true,
          frontier_score: 0.74,
          is_bridge: true,
          direction: 'citation',
        }),
      ],
      edges: [
        makeEdge('vision-transformer', 'seed-transformer', 'citation', 1, 'methodology'),
        makeEdge('protein-lm', 'seed-transformer', 'citation', 1, 'supports'),
        makeEdge('vision-transformer', 'protein-lm', 'similarity', 0.77),
      ],
      meta: {
        references_ok: true,
        citations_ok: true,
        refs_count: 1,
        cites_count: 1,
      },
    },
  },
};

export function getReviewFixture(fixtureId?: string | null): ReviewFixture | null {
  if (!fixtureId) return null;
  if (fixtureId !== fixture.id) return null;
  return JSON.parse(JSON.stringify(fixture)) as ReviewFixture;
}

export function listReviewFixtures(): Array<Pick<ReviewFixture, 'id' | 'label' | 'description'>> {
  return [{ id: fixture.id, label: fixture.label, description: fixture.description }];
}

export async function loadGeneratedReviewFixture(
  fixtureId?: string | null
): Promise<ReviewFixture | null> {
  if (!fixtureId) return null;

  const response = await fetch(`/review-fixtures/${fixtureId}.json`, {
    cache: 'no-store',
  });

  if (!response.ok) return null;
  return response.json();
}
