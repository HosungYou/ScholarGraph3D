'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import SavedGraphs from '@/components/dashboard/SavedGraphs';
import { api } from '@/lib/api';
import type { WatchQuery } from '@/types';
import {
  Search,
  LogOut,
  User,
  ArrowLeft,
  Eye,
  Bell,
  BellOff,
  Trash2,
  RefreshCw,
  Plus,
  Calendar,
  Filter,
  Loader2,
  ExternalLink,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();

  // Watch queries state
  const [watchQueries, setWatchQueries] = useState<WatchQuery[]>([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth');
    }
  }, [user, isLoading, router]);

  const loadWatchQueries = useCallback(async () => {
    setWatchLoading(true);
    try {
      const queries = await api.listWatchQueries();
      setWatchQueries(queries);
    } catch {
      // Silently fail on dashboard — user can retry
    } finally {
      setWatchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadWatchQueries();
    }
  }, [user, loadWatchQueries]);

  const handleCheckNow = async () => {
    setIsChecking(true);
    try {
      await api.triggerWatchCheck();
      await loadWatchQueries();
    } catch {
      // ignore
    } finally {
      setIsChecking(false);
    }
  };

  const handleDeleteWatch = async (id: string) => {
    try {
      await api.deleteWatchQuery(id);
      setWatchQueries((prev) => prev.filter((q) => q.id !== id));
      setDeleteConfirm(null);
    } catch {
      // ignore
    }
  };

  const totalNewPapers = watchQueries.reduce(
    (sum, q) => sum + (q.new_paper_count ?? 0),
    0
  );

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 glass-strong">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-lg font-bold text-accent"
            >
              SG3D
            </a>
            <span className="text-text-secondary/40">|</span>
            <span className="text-sm text-text-secondary">Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <User className="w-4 h-4" />
              <span>{user.email}</span>
            </div>
            <button
              onClick={() => router.push('/')}
              className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
              title="New search"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={async () => {
                await signOut();
                router.push('/');
              }}
              className="p-2 rounded-lg hover:bg-accent-red/10 text-text-secondary hover:text-accent-red transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Watch Queries Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2 mb-1">
                <Eye className="w-5 h-5 text-blue-400" />
                My Watch Queries
              </h2>
              <p className="text-sm text-text-secondary">
                Monitor research areas for new publications
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Quick stats */}
              <div className="flex items-center gap-4 text-xs text-text-secondary mr-2">
                <span>{watchQueries.length} watches</span>
                {totalNewPapers > 0 && (
                  <span className="flex items-center gap-1 text-blue-400">
                    <Bell className="w-3 h-3" />
                    {totalNewPapers} new papers
                  </span>
                )}
              </div>
              <button
                onClick={handleCheckNow}
                disabled={isChecking || watchQueries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`}
                />
                Check Now
              </button>
              <button
                onClick={() => router.push('/explore')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Watch
              </button>
            </div>
          </div>

          {watchLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : watchQueries.length === 0 ? (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-8 text-center">
              <Eye className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-400 mb-1">
                No watch queries yet
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Set up watches to get notified about new papers in your research areas
              </p>
              <button
                onClick={() => router.push('/explore')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Watch Query
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {watchQueries.map((wq) => (
                <div
                  key={wq.id}
                  className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm text-gray-100 font-medium leading-tight">
                      {wq.query}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {wq.notify_email ? (
                        <Bell className="w-3 h-3 text-blue-400" />
                      ) : (
                        <BellOff className="w-3 h-3 text-gray-500" />
                      )}
                      {deleteConfirm === wq.id ? (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            onClick={() => handleDeleteWatch(wq.id)}
                            className="text-[10px] text-red-400 hover:text-red-300 px-1"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-[10px] text-gray-400 hover:text-gray-300 px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(wq.id)}
                          className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter badges */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {wq.filters.year_min && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300">
                        <Calendar className="w-2.5 h-2.5" />
                        {wq.filters.year_min}
                        {wq.filters.year_max
                          ? `\u2013${wq.filters.year_max}`
                          : '+'}
                      </span>
                    )}
                    {wq.filters.field && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300">
                        <Filter className="w-2.5 h-2.5" />
                        {wq.filters.field}
                      </span>
                    )}
                  </div>

                  {/* Footer with new papers action */}
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>Checked: {formatDate(wq.last_checked)}</span>
                    {(wq.new_paper_count ?? 0) > 0 ? (
                      <button
                        onClick={() =>
                          router.push(
                            `/explore?q=${encodeURIComponent(wq.query)}`
                          )
                        }
                        className="flex items-center gap-1 bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium hover:bg-blue-700 transition-colors"
                      >
                        {wq.new_paper_count} new
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    ) : (
                      <span className="text-gray-600">No new papers</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Saved Graphs Section */}
        <section>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary mb-1">
              Your Saved Graphs
            </h1>
            <p className="text-sm text-text-secondary">
              Access and manage your previously saved paper explorations
            </p>
          </div>

          <SavedGraphs />
        </section>
      </main>
    </div>
  );
}
