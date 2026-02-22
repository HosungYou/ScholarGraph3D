'use client';

import { ExternalLink, X, BookOpen } from 'lucide-react';
import type { Recommendation } from '@/types';
import { useRouter } from 'next/navigation';

interface RecommendationCardProps {
  rec: Recommendation;
  onDismiss: (id: string) => void;
  isDismissing: boolean;
}

export default function RecommendationCard({
  rec,
  onDismiss,
  isDismissing,
}: RecommendationCardProps) {
  const router = useRouter();

  const title = rec.title || 'Untitled Paper';
  const year = rec.year;
  const citationCount = rec.citation_count ?? 0;
  const authors = rec.authors || [];
  const firstAuthor = authors[0];
  const authorDisplay = firstAuthor
    ? typeof firstAuthor === 'string'
      ? firstAuthor
      : (firstAuthor as { name?: string }).name || ''
    : '';
  const authorStr = authorDisplay
    ? `${authorDisplay.split(' ').pop()}${authors.length > 1 ? ' et al.' : ''}`
    : '';
  const snippet = rec.tldr || rec.explanation || (rec.abstract ? rec.abstract.slice(0, 120) + '...' : '');

  return (
    <div className="hud-panel p-4 hover:border-cosmic-glow/20 transition-colors flex flex-col gap-2 relative group">
      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(rec.id)}
        disabled={isDismissing}
        className="absolute top-2 right-2 p-1 rounded text-[#7B8CDE]/40 hover:text-[#7B8CDE] hover:bg-[#0a0f1e] opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
        title="Not interested"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Title */}
      <p className="text-sm font-medium text-[#E8EAF6] leading-snug pr-6 line-clamp-2">
        {title}
      </p>

      {/* Meta */}
      <div className="flex items-center gap-2 text-[10px] text-[#7B8CDE] flex-wrap font-mono">
        {authorStr && <span>{authorStr}</span>}
        {year && <span>{year}</span>}
        {citationCount > 0 && (
          <span className="flex items-center gap-0.5">
            <BookOpen className="w-2.5 h-2.5" />
            {citationCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Explanation / snippet */}
      {snippet && (
        <p className="text-[11px] text-[#7B8CDE]/70 leading-relaxed line-clamp-2">
          {snippet}
        </p>
      )}

      {/* Reason tags */}
      {rec.reason_tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rec.reason_tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-cosmic-glow/10 border border-cosmic-glow/20 rounded text-[9px] text-cosmic-glow"
            >
              {tag.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Score + Explore */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-[9px] text-[#7B8CDE]/40 font-mono">
          Match: {Math.round(rec.score * 100)}%
        </span>
        <button
          onClick={() => router.push(`/explore?q=${encodeURIComponent(title)}`)}
          className="flex items-center gap-1 text-[10px] text-cosmic-glow hover:text-cosmic-glow/70 transition-colors font-mono"
        >
          Explore
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}
