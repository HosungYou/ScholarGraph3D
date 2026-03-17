#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return options;
}

function printUsage() {
  console.log(`
Usage:
  npm run review:fixture -- --api http://127.0.0.1:8000 --paper-id PAPER_ID --slug fixture-name

Options:
  --api          Backend API base URL. Default: http://127.0.0.1:8000
  --paper-id     Seed paper ID used by /api/seed-explore
  --slug         Output fixture filename slug
  --label        Display label shown in review mode
  --description  Short description for the fixture
  --max-papers   Max papers for seed graph. Default: 40
  --expand-id    Optional node ID to precompute expand flow for
`);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText} :: ${text}`);
  }
  return response.json();
}

function deriveExpandTarget(graph, explicitExpandId) {
  if (explicitExpandId) return explicitExpandId;

  const seedId = graph.meta?.seed_paper_id;
  if (seedId) return seedId;

  const candidates = [...graph.nodes]
    .filter((node) => node.s2_paper_id || node.doi)
    .sort((a, b) => {
      const frontierDelta = (b.frontier_score || 0) - (a.frontier_score || 0);
      if (frontierDelta !== 0) return frontierDelta;
      return (b.citation_count || 0) - (a.citation_count || 0);
    });

  if (candidates.length === 0) {
    throw new Error('No expandable node found in graph result');
  }

  return candidates[0].id;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.h || !options['paper-id'] || !options.slug) {
    printUsage();
    process.exit(options.help || options.h ? 0 : 1);
  }

  const apiBase = options.api || 'http://127.0.0.1:8000';
  const paperId = options['paper-id'];
  const slug = options.slug;
  const maxPapers = Number(options['max-papers'] || '40');
  const label = options.label || `Live Review: ${slug}`;
  const description =
    options.description ||
    `Generated from live ScholarGraph3D backend for paper ${paperId}.`;

  console.log(`[fixture] fetching seed graph for ${paperId}`);
  const graph = await requestJson(`${apiBase}/api/seed-explore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paper_id: paperId,
      depth: 1,
      max_papers: maxPapers,
      include_references: true,
      include_citations: true,
    }),
  });

  console.log('[fixture] fetching network overview');
  const overview = await requestJson(`${apiBase}/api/network-overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      graph_context: {
        papers: graph.nodes,
        edges: graph.edges,
        clusters: graph.clusters,
      },
    }),
  }).catch(() => null);

  const expandTargetId = deriveExpandTarget(graph, options['expand-id']);
  const expandTargetNode =
    graph.nodes.find((node) => node.id === expandTargetId) ||
    graph.nodes.find((node) => node.s2_paper_id === expandTargetId);

  if (!expandTargetNode) {
    throw new Error(`Expand target "${expandTargetId}" was not found in graph nodes`);
  }

  const expandRequestId = expandTargetNode.s2_paper_id || (expandTargetNode.doi ? `DOI:${expandTargetNode.doi}` : expandTargetNode.id);

  console.log(`[fixture] precomputing expand flow for ${expandRequestId}`);
  const expansion = await requestJson(
    `${apiBase}/api/papers/${encodeURIComponent(expandRequestId)}/expand-stable`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        existing_nodes: graph.nodes.map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
          z: node.z,
          cluster_id: node.cluster_id,
        })),
        limit: 20,
      }),
    }
  );

  const fixture = {
    id: slug,
    label,
    description,
    graph,
    overview,
    expansions: {
      [expandTargetNode.id]: {
        nodes: (expansion.nodes || []).map((node) => ({
          id: node.paper_id,
          s2_paper_id: node.paper_id,
          doi: node.doi || undefined,
          title: node.title || '',
          authors: node.authors || [],
          year: node.year || 0,
          venue: node.venue || undefined,
          citation_count: node.citation_count || 0,
          abstract: node.abstract || undefined,
          tldr: node.tldr || undefined,
          fields: node.fields || [],
          topics: [],
          x: node.initial_x || 0,
          y: node.initial_y || 0,
          z: node.initial_z || 0,
          cluster_id: node.cluster_id ?? -1,
          cluster_label: 'Expanded',
          is_open_access: node.is_open_access || false,
          oa_url: node.oa_url || undefined,
          frontier_score: node.frontier_score || 0,
          is_bridge: false,
        })),
        edges: expansion.edges || [],
        meta: expansion.meta || undefined,
      },
    },
  };

  const outDir = path.join(process.cwd(), 'public', 'review-fixtures');
  const outFile = path.join(outDir, `${slug}.json`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(fixture, null, 2));

  console.log(`[fixture] wrote ${outFile}`);
  console.log(`[fixture] open http://127.0.0.1:3100/explore/seed?fixture=${slug}`);
}

main().catch((error) => {
  console.error('[fixture] generation failed');
  console.error(error);
  process.exit(1);
});
