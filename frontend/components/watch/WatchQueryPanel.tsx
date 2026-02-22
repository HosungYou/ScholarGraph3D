'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  Plus,
  Trash2,
  RefreshCw,
  Bell,
  BellOff,
  Calendar,
  Filter,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useGraphStore } from '@/hooks/useGraphStore';
import type { WatchQuery } from '@/types';
import { FIELD_COLORS } from '@/types';

export default function WatchQueryPanel() {
  const { watchQueries, setWatchQueries, addWatchQuery, removeWatchQuery } =
    useGraphStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Add form state
  const [newQuery, setNewQuery] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [field, setField] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fieldOptions = Object.keys(FIELD_COLORS);

  const loadWatchQueries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queries = await api.listWatchQueries();
      setWatchQueries(queries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load watch queries'
      );
    } finally {
      setIsLoading(false);
    }
  }, [setWatchQueries]);

  useEffect(() => {
    loadWatchQueries();
  }, [loadWatchQueries]);

  const handleAdd = async () => {
    if (!newQuery.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const filters: Record<string, unknown> = {};
      if (yearMin) filters.year_min = Number(yearMin);
      if (yearMax) filters.year_max = Number(yearMax);
      if (field) filters.field = field;

      const created = await api.createWatchQuery(
        newQuery.trim(),
        filters,
        notifyEmail
      );
      addWatchQuery(created);
      setNewQuery('');
      setYearMin('');
      setYearMax('');
      setField('');
      setNotifyEmail(false);
      setShowAddForm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create watch query'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteWatchQuery(id);
      removeWatchQuery(id);
      setDeleteConfirm(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete watch query'
      );
    }
  };

  const handleCheckNow = async () => {
    setIsChecking(true);
    setError(null);
    try {
      await api.triggerWatchCheck();
      await loadWatchQueries();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to check for new papers'
      );
    } finally {
      setIsChecking(false);
    }
  };

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

  if (isLoading && watchQueries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-cosmic-glow/60" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-cosmic-glow/60 flex items-center gap-2">
          <Eye className="w-4 h-4 text-cosmic-glow/60" />
          SURVEILLANCE PROBES
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCheckNow}
            disabled={isChecking || watchQueries.length === 0}
            className="p-1.5 rounded-md text-[#7B8CDE]/50 hover:text-cosmic-glow hover:bg-[#111833] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Check now"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`p-1.5 rounded-md transition-colors ${
              showAddForm
                ? 'bg-cosmic-glow/15 border border-cosmic-glow/30 text-cosmic-glow'
                : 'text-[#7B8CDE]/50 hover:text-cosmic-glow hover:bg-[#111833]'
            }`}
            title="Add watch query"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/30">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="bg-[#0a0f1e] rounded-lg p-3 space-y-3 border border-[#1a2555]">
          <input
            type="text"
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            placeholder="Search query (e.g., graph neural networks)"
            className="w-full bg-[#050510] border border-[#1a2555] rounded-md px-3 py-2 text-sm text-[#E8EAF6] placeholder:text-[#7B8CDE]/40 focus:outline-none focus:border-cosmic-glow/40 font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />

          <div className="flex gap-2">
            <input
              type="number"
              value={yearMin}
              onChange={(e) => setYearMin(e.target.value)}
              placeholder="Year from"
              className="flex-1 bg-[#050510] border border-[#1a2555] rounded-md px-2.5 py-1.5 text-xs text-[#E8EAF6] placeholder:text-[#7B8CDE]/40 focus:outline-none focus:border-cosmic-glow/40 font-mono"
            />
            <input
              type="number"
              value={yearMax}
              onChange={(e) => setYearMax(e.target.value)}
              placeholder="Year to"
              className="flex-1 bg-[#050510] border border-[#1a2555] rounded-md px-2.5 py-1.5 text-xs text-[#E8EAF6] placeholder:text-[#7B8CDE]/40 focus:outline-none focus:border-cosmic-glow/40 font-mono"
            />
          </div>

          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="w-full bg-[#050510] border border-[#1a2555] rounded-md px-2.5 py-1.5 text-xs text-[#E8EAF6] focus:outline-none focus:border-cosmic-glow/40 font-mono"
          >
            <option value="">All fields</option>
            {fieldOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs font-mono text-[#7B8CDE] cursor-pointer">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
              className="rounded border-[#1a2555] bg-[#050510] text-cosmic-glow focus:ring-cosmic-glow/40 focus:ring-offset-0"
            />
            Email notifications for new papers
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newQuery.trim() || isSubmitting}
              className="hud-button flex-1 uppercase font-mono text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              DEPLOY PROBE
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 bg-[#111833] hover:bg-[#1a2555] text-[#7B8CDE] text-xs font-mono rounded-md transition-colors border border-[#1a2555]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Watch query list */}
      {watchQueries.length === 0 ? (
        <div className="text-center py-8">
          <Eye className="w-8 h-8 text-[#1a2555] mx-auto mb-3" />
          <p className="text-sm font-mono text-[#7B8CDE]/80 mb-1">No probes deployed yet</p>
          <p className="text-xs font-mono text-[#7B8CDE]/50">
            Watch for new papers in your research areas
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {watchQueries.map((wq) => (
            <div
              key={wq.id}
              className="hud-panel rounded-lg p-3 border border-[#1a2555] hover:border-cosmic-glow/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-mono text-[#E8EAF6] font-medium leading-tight">
                  {wq.query}
                </p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {wq.notify_email ? (
                    <Bell className="w-3 h-3 text-cosmic-glow/60" />
                  ) : (
                    <BellOff className="w-3 h-3 text-[#7B8CDE]/30" />
                  )}
                  {deleteConfirm === wq.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(wq.id)}
                        className="text-xs font-mono text-red-400 hover:text-red-300 px-1"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs font-mono text-[#7B8CDE]/50 hover:text-[#7B8CDE] px-1"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(wq.id)}
                      className="p-1 rounded text-[#7B8CDE]/30 hover:text-red-400 hover:bg-red-900/20 transition-colors"
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
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#111833] border border-[#1a2555] rounded text-[10px] font-mono text-[#7B8CDE]">
                    <Calendar className="w-2.5 h-2.5" />
                    {wq.filters.year_min}
                    {wq.filters.year_max ? `–${wq.filters.year_max}` : '+'}
                  </span>
                )}
                {wq.filters.field && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#111833] border border-[#1a2555] rounded text-[10px] font-mono text-[#7B8CDE]">
                    <Filter className="w-2.5 h-2.5" />
                    {wq.filters.field}
                  </span>
                )}
                {wq.filters.venue && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#111833] border border-[#1a2555] rounded text-[10px] font-mono text-[#7B8CDE]">
                    {wq.filters.venue}
                  </span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[10px] font-mono text-[#7B8CDE]/50">
                <span>Checked: {formatDate(wq.last_checked)}</span>
                {(wq.new_paper_count ?? 0) > 0 && (
                  <span className="bg-cosmic-glow text-[#050510] px-1.5 py-0.5 rounded-full font-medium font-mono animate-cosmic-pulse">
                    {wq.new_paper_count} new
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
