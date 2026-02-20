'use client';

import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Users,
  Calendar,
  Hash,
  Network,
  Cpu,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Paper } from '@/types';
import { FIELD_COLORS } from '@/types';
import { useGraphStore } from '@/hooks/useGraphStore';

interface PaperDetailPanelProps {
  paper: Paper;
  onClose: () => void;
  onExpand: () => void;
}

export default function PaperDetailPanel({
  paper,
  onClose,
  onExpand,
}: PaperDetailPanelProps) {
  const [showFullAbstract, setShowFullAbstract] = useState(false);
  const { graphData, conceptualEdges } = useGraphStore();

  // Compute relationship summary
  const relationshipSummary = React.useMemo(() => {
    if (!graphData || !paper) return null;
    const incomingCitations = graphData.edges.filter(
      (e) => e.type === 'citation' && e.target === paper.id
    ).length;
    const outgoingCitations = graphData.edges.filter(
      (e) => e.type === 'citation' && e.source === paper.id
    ).length;
    const similarEdges = graphData.edges.filter(
      (e) => e.type === 'similarity' && (e.source === paper.id || e.target === paper.id)
    ).length;
    const isBridge = paper.is_bridge;
    const conceptualCount = conceptualEdges.filter(
      (e) => e.source === paper.id || e.target === paper.id
    ).length;
    return { incomingCitations, outgoingCitations, similarEdges, isBridge, conceptualCount };
  }, [graphData, paper, conceptualEdges]);

  const abstractText = paper.abstract || paper.tldr || 'No abstract available.';
  const isLongAbstract = abstractText.length > 300;
  const displayAbstract =
    isLongAbstract && !showFullAbstract
      ? abstractText.substring(0, 300) + '...'
      : abstractText;

  return (
    <div className="p-5 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 mr-3">
          <h2 className="text-base font-semibold leading-snug text-text-primary">
            {paper.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {/* Authors */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-1.5 text-text-secondary">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium uppercase tracking-wide">
            Authors
          </span>
        </div>
        <div className="space-y-1">
          {paper.authors.slice(0, 5).map((author, i) => (
            <div key={i} className="text-sm text-text-primary">
              {author.name}
              {author.affiliations?.[0] && (
                <span className="text-xs text-text-secondary ml-1">
                  ({author.affiliations[0]})
                </span>
              )}
            </div>
          ))}
          {paper.authors.length > 5 && (
            <div className="text-xs text-text-secondary">
              +{paper.authors.length - 5} more authors
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="glass rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-text-secondary mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-xs">Year</span>
          </div>
          <div className="text-sm font-medium">{paper.year}</div>
        </div>
        <div className="glass rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-text-secondary mb-1">
            <Hash className="w-3.5 h-3.5" />
            <span className="text-xs">Citations</span>
          </div>
          <div className="text-sm font-medium">
            {paper.citation_count.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Venue */}
      {paper.venue && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1 text-text-secondary">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Venue
            </span>
          </div>
          <div className="text-sm text-text-primary">{paper.venue}</div>
        </div>
      )}

      {/* Abstract */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-1.5 text-text-secondary">
          <span className="text-xs font-medium uppercase tracking-wide">
            {paper.abstract ? 'Abstract' : 'TLDR'}
          </span>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          {displayAbstract}
        </p>
        {isLongAbstract && (
          <button
            onClick={() => setShowFullAbstract(!showFullAbstract)}
            className="flex items-center gap-1 mt-1 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            {showFullAbstract ? (
              <>
                Show less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Fields */}
      {paper.fields.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-1.5">
            Fields of Study
          </div>
          <div className="flex flex-wrap gap-1.5">
            {paper.fields.map((field) => (
              <span
                key={field}
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor:
                    (FIELD_COLORS[field] || '#95A5A6') + '20',
                  color: FIELD_COLORS[field] || '#95A5A6',
                  border: `1px solid ${(FIELD_COLORS[field] || '#95A5A6') + '40'}`,
                }}
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {paper.topics.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-1.5">
            Topics
          </div>
          <div className="flex flex-wrap gap-1.5">
            {paper.topics.slice(0, 8).map((topic) => (
              <span
                key={topic.id}
                className="px-2 py-0.5 rounded text-xs bg-surface-hover text-text-secondary border border-border/30"
              >
                {topic.display_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Relationship context */}
      {relationshipSummary && (
        <div className="border-t border-border/20 pt-3 mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary/60 mb-2">
            Graph Relationships
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-surface/50 rounded-lg p-2">
              <div className="text-text-secondary/60">Cited by (in graph)</div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.incomingCitations} papers
              </div>
            </div>
            <div className="bg-surface/50 rounded-lg p-2">
              <div className="text-text-secondary/60">Cites (in graph)</div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.outgoingCitations} papers
              </div>
            </div>
            <div className="bg-surface/50 rounded-lg p-2">
              <div className="text-text-secondary/60">Similar papers</div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.similarEdges} connected
              </div>
            </div>
            <div className="bg-surface/50 rounded-lg p-2">
              <div className="flex items-center gap-1 text-text-secondary/60">
                <Cpu className="w-3 h-3" />
                <span>AI relationships</span>
              </div>
              <div className="font-semibold text-text-primary">
                {relationshipSummary.conceptualCount} analyzed
              </div>
            </div>
            {relationshipSummary.isBridge && (
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2">
                <div className="text-yellow-400/80 text-xs">◈ Bridge Node</div>
                <div className="text-yellow-300/70 text-xs">Connects clusters</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-6">
        <button
          onClick={onExpand}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent/10 hover:bg-accent/20 text-accent rounded-lg text-sm font-medium transition-colors border border-accent/20"
        >
          <Network className="w-4 h-4" />
          Expand Citations
        </button>
        {paper.oa_url && (
          <a
            href={paper.oa_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent-green/10 hover:bg-accent-green/20 text-accent-green rounded-lg text-sm font-medium transition-colors border border-accent-green/20"
          >
            <ExternalLink className="w-4 h-4" />
            Open Access PDF
          </a>
        )}
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-surface-hover hover:bg-border/30 text-text-secondary rounded-lg text-sm transition-colors border border-border/30"
          >
            <ExternalLink className="w-4 h-4" />
            DOI: {paper.doi}
          </a>
        )}
      </div>
    </div>
  );
}
