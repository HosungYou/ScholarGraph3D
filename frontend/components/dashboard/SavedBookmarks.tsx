'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Bookmark, BookOpen, ExternalLink, StickyNote, Tags } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SavedBookmarks() {
  const { user } = useAuth();
  const router = useRouter();

  const bookmarksQuery = useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => api.getBookmarks(),
    enabled: !!user,
  });

  const bookmarkCards = useMemo(() => bookmarksQuery.data || [], [bookmarksQuery.data]);

  if (!user) return null;

  if (bookmarksQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
      </div>
    );
  }

  if (bookmarksQuery.isError) {
    return (
      <div className="rounded-xl border border-red-400/15 bg-red-400/5 p-4 text-sm text-red-300/80">
        Failed to load saved papers.
      </div>
    );
  }

  if (!bookmarkCards.length) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-[#D4AF37]/70" />
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]/70">
            Saved Papers
          </span>
        </div>
        <p className="mt-3 text-sm text-neutral-500">
          Bookmark papers from a workspace to build a reusable reading library.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#D4AF37]/70" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]/70">
              Saved Papers
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Quick access to papers you marked for follow-up.
          </p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-600">
          {bookmarkCards.length} saved
        </span>
      </div>

      {bookmarkCards.map((bookmark, index) => (
        <motion.div
          key={bookmark.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.04 }}
          className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 transition-colors hover:border-neutral-700"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <button
                onClick={() => router.push(`/explore/seed?paper_id=${encodeURIComponent(bookmark.paper_id)}`)}
                className="text-left"
              >
                <div className="text-sm font-medium text-white hover:text-[#D4AF37] transition-colors leading-snug">
                  {bookmark.paper_title || 'Saved paper'}
                </div>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] font-mono text-neutral-600">
                {!bookmark.paper_title ? <span>{bookmark.paper_id}</span> : null}
                {bookmark.paper_year ? <span>{bookmark.paper_year}</span> : null}
                {bookmark.paper_venue ? (
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {bookmark.paper_venue}
                  </span>
                ) : null}
                {bookmark.paper_citation_count ? <span>{bookmark.paper_citation_count} cit.</span> : null}
              </div>
              {bookmark.paper_authors.length > 0 ? (
                <p className="mt-2 text-[12px] text-neutral-500 line-clamp-2">
                  {bookmark.paper_authors.slice(0, 4).join(', ')}
                </p>
              ) : null}
              {bookmark.memo && (
                <div className="mt-3 flex gap-2 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  <StickyNote className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-[#D4AF37]/60" />
                  <p className="text-[12px] leading-relaxed text-neutral-400">
                    {bookmark.memo}
                  </p>
                </div>
              )}
              {bookmark.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {bookmark.tags.map((tag) => (
                    <span
                      key={`${bookmark.id}-${tag}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[rgba(212,175,55,0.16)] bg-[rgba(212,175,55,0.06)] px-2 py-0.5 text-[10px] font-mono text-[#D4AF37]/80"
                    >
                      <Tags className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => router.push(`/explore/seed?paper_id=${encodeURIComponent(bookmark.paper_id)}`)}
              className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide text-neutral-400 transition-colors hover:border-[rgba(212,175,55,0.2)] hover:text-[#D4AF37]"
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
