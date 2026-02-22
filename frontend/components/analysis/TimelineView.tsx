'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { useGraphStore } from '@/hooks/useGraphStore';
import type { Paper } from '@/types';

// Field color mapping (mirrors ScholarGraph3D)
const FIELD_COLOR_MAP: Record<string, string> = {
  'Computer Science': '#4A90D9',
  'Engineering': '#5B9BD5',
  'Mathematics': '#6CA6E0',
  'Medicine': '#E74C3C',
  'Biology': '#2ECC71',
  'Physics': '#9B59B6',
  'Chemistry': '#8E44AD',
  'Economics': '#E67E22',
  'Psychology': '#16A085',
  'Sociology': '#D35400',
  'Philosophy': '#BA4A00',
  'Environmental Science': '#82C341',
  'Business': '#5DADE2',
  'Political Science': '#CA6F1E',
  'Education': '#E59866',
  Other: '#95A5A6',
};

function getFieldColor(paper: Paper): string {
  const field = paper.fields?.[0];
  if (!field) return '#95A5A6';
  return FIELD_COLOR_MAP[field] || '#95A5A6';
}

interface TimelineViewProps {
  onClose: () => void;
}

export default function TimelineView({ onClose }: TimelineViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    graphData,
    selectedPaper,
    selectPaper,
    setHighlightedPaperIds,
  } = useGraphStore();

  const clusterMap = useMemo(() => {
    if (!graphData) return new Map<number, { label: string; color: string }>();
    const map = new Map<number, { label: string; color: string }>();
    graphData.clusters.forEach((c) => {
      map.set(c.id, { label: c.label, color: c.color });
    });
    return map;
  }, [graphData]);

  // Build citation edges set for arrows
  const citationEdges = useMemo(() => {
    if (!graphData) return [];
    return graphData.edges.filter((e) => e.type === 'citation');
  }, [graphData]);

  const handleNodeClick = useCallback((paper: Paper) => {
    selectPaper(paper);
    // Highlight this paper in the 3D graph
    setHighlightedPaperIds(new Set([paper.id]));
  }, [selectPaper, setHighlightedPaperIds]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !graphData || graphData.nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const margin = { top: 40, right: 40, bottom: 50, left: 160 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get year range
    const years = graphData.nodes.map((n) => n.year).filter((y) => y != null && !isNaN(y));
    if (years.length === 0) return;
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // X scale: year
    const xScale = d3.scaleLinear()
      .domain([minYear - 0.5, maxYear + 0.5])
      .range([0, innerWidth]);

    // Get unique cluster IDs (sorted)
    const clusterIds = Array.from(new Set(graphData.nodes.map((n) => n.cluster_id)))
      .filter((id) => id >= 0)
      .sort((a, b) => a - b);
    // Add unclustered at end
    const hasUnclustered = graphData.nodes.some((n) => n.cluster_id < 0);
    const allLanes = hasUnclustered ? [...clusterIds, -1] : clusterIds;

    // Y scale: cluster swim lanes
    const laneHeight = Math.min(80, innerHeight / allLanes.length);
    const yScale = d3.scaleBand<number>()
      .domain(allLanes)
      .range([0, Math.min(innerHeight, laneHeight * allLanes.length)])
      .padding(0.15);

    // Draw swim lane backgrounds
    allLanes.forEach((cid) => {
      const info = clusterMap.get(cid);
      g.append('rect')
        .attr('x', 0)
        .attr('y', yScale(cid)!)
        .attr('width', innerWidth)
        .attr('height', yScale.bandwidth())
        .attr('fill', info?.color || '#1a2555')
        .attr('opacity', 0.06)
        .attr('rx', 4);

      // Lane label
      g.append('text')
        .attr('x', -8)
        .attr('y', yScale(cid)! + yScale.bandwidth() / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', info?.color || '#7B8CDE')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('font-family', 'monospace')
        .text((info?.label || 'Unclustered').substring(0, 20));
    });

    // X axis
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d3.format('d') as (domainValue: d3.NumberValue, index: number) => string)
      .ticks(Math.min(maxYear - minYear + 1, 15));

    g.append('g')
      .attr('transform', `translate(0,${Math.min(innerHeight, laneHeight * allLanes.length)})`)
      .call(xAxis)
      .attr('color', '#1a2555')
      .selectAll('text')
      .attr('fill', '#7B8CDE')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace');

    // Year grid lines
    const yearTicks = xScale.ticks(Math.min(maxYear - minYear + 1, 15));
    yearTicks.forEach((year) => {
      g.append('line')
        .attr('x1', xScale(year))
        .attr('x2', xScale(year))
        .attr('y1', 0)
        .attr('y2', Math.min(innerHeight, laneHeight * allLanes.length))
        .attr('stroke', '#1a2555')
        .attr('stroke-dasharray', '2,3');
    });

    // Arrow marker definition
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#1a2555')
      .attr('opacity', 0.5);

    // Node size scale
    const citationCounts = graphData.nodes.map((n) => n.citation_count);
    const maxCitations = Math.max(...citationCounts, 1);
    const sizeScale = d3.scaleSqrt()
      .domain([0, maxCitations])
      .range([3, 14]);

    // Build paper position map (after placing nodes)
    const paperPosMap = new Map<string, { x: number; y: number }>();

    // Jitter within lane to avoid overlap
    const laneCounts = new Map<string, number>();
    graphData.nodes.forEach((paper) => {
      const key = `${paper.cluster_id}-${paper.year}`;
      laneCounts.set(key, (laneCounts.get(key) || 0) + 1);
    });
    const laneCounters = new Map<string, number>();

    // Draw citation edges before nodes (so nodes appear on top)
    const edgeGroup = g.append('g');

    // Plot nodes
    const nodeGroup = g.append('g');

    graphData.nodes.forEach((paper) => {
      if (!paper.year || isNaN(paper.year)) return;
      const cid = paper.cluster_id >= 0 ? paper.cluster_id : -1;
      if (!allLanes.includes(cid)) return;

      const key = `${cid}-${paper.year}`;
      const count = laneCounts.get(key) || 1;
      const idx = laneCounters.get(key) || 0;
      laneCounters.set(key, idx + 1);

      const bandY = yScale(cid)!;
      const bandH = yScale.bandwidth();
      const jitterY = count > 1
        ? bandY + bandH * 0.15 + (bandH * 0.7 * (idx / (count - 1 || 1)))
        : bandY + bandH / 2;

      const cx = xScale(paper.year);
      const cy = jitterY;
      const r = sizeScale(paper.citation_count);

      paperPosMap.set(paper.id, { x: cx, y: cy });

      const isSelected = selectedPaper?.id === paper.id;
      const color = getFieldColor(paper);

      const nodeG = nodeGroup.append('g')
        .attr('transform', `translate(${cx},${cy})`)
        .style('cursor', 'pointer')
        .on('click', () => handleNodeClick(paper));

      // Glow filter for selected nodes
      if (isSelected) {
        nodeG.append('circle')
          .attr('r', r + 3)
          .attr('fill', color)
          .attr('opacity', 0.2);
      }

      // Circle
      nodeG.append('circle')
        .attr('r', r)
        .attr('fill', color)
        .attr('opacity', isSelected ? 1 : 0.7)
        .attr('stroke', isSelected ? '#00E5FF' : 'none')
        .attr('stroke-width', isSelected ? 2 : 0);

      // Tooltip on hover
      nodeG.append('title')
        .text(`${paper.title}\n${paper.authors?.[0]?.name || ''} (${paper.year})\nCitations: ${paper.citation_count}`);
    });

    // Now draw citation edges (paperPosMap is fully populated)
    citationEdges.forEach((edge) => {
      const src = paperPosMap.get(edge.source);
      const tgt = paperPosMap.get(edge.target);
      if (!src || !tgt) return;

      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 0.8;

      edgeGroup.append('path')
        .attr('d', `M${src.x},${src.y} A${dr},${dr} 0 0,1 ${tgt.x},${tgt.y}`)
        .attr('fill', 'none')
        .attr('stroke', '#1a2555')
        .attr('stroke-width', 0.5)
        .attr('stroke-opacity', 0.3)
        .attr('marker-end', 'url(#arrowhead)');
    });

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', '#7B8CDE')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', 'monospace')
      .attr('letter-spacing', '0.15em')
      .text('PUBLICATION TIMELINE');

  }, [graphData, selectedPaper, clusterMap, citationEdges, handleNodeClick]);

  // Resize observer — re-trigger the D3 effect by forcing a re-render
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      // The main useEffect will re-run because containerRef dimensions changed
      // We manually invoke a size-triggered re-draw by dispatching a synthetic resize
      if (svgRef.current && containerRef.current && graphData) {
        // Trigger re-render: the D3 effect reads container dimensions each run
        svgRef.current.dispatchEvent(new Event('resize'));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [graphData]);

  if (!graphData) return null;

  return (
    <div className="flex flex-col h-full bg-[#050510]/95 border-t border-[#1a2555]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a2555]">
        <div className="flex items-center gap-2 text-sm text-[#7B8CDE]">
          <span className="font-mono font-medium text-[#E8EAF6] uppercase tracking-widest text-xs">2D Timeline</span>
          <span className="text-[#7B8CDE]/30">|</span>
          <span className="text-xs font-mono text-[#7B8CDE]">{graphData.nodes.length} papers</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#111833] text-[#7B8CDE] hover:text-[#E8EAF6] transition-colors text-xs font-mono uppercase tracking-wider"
        >
          Close
        </button>
      </div>

      {/* SVG Container */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  );
}
