'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import SavedGraphs from '@/components/dashboard/SavedGraphs';
import RecommendationCard from '@/components/dashboard/RecommendationCard';
import { api } from '@/lib/api';
import type { WatchQuery, Recommendation } from '@/types';
import {
  Search,
  LogOut,
  User,
  Eye,
  Bell,
  BellOff,
  Trash2,
  RefreshCw,
  Plus,
  Calendar,
  Filter,
  ExternalLink,
  Sparkles,
  Settings,
  Save,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();

  // Watch queries state
  const [watchQueries, setWatchQueries] = useState<WatchQuery[]>([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // Profile settings state
  const [showSettings, setShowSettings] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [researchInterests, setResearchInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');
  const [defaultYearMin, setDefaultYearMin] = useState<number>(2015);
  const [defaultYearMax, setDefaultYearMax] = useState<number>(2026);
  const [defaultMinCitations, setDefaultMinCitations] = useState<number>(0);

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

  const loadRecommendations = useCallback(async () => {
    setRecsLoading(true);
    try {
      const recs = await api.getRecommendations();
      setRecommendations(recs);
    } catch {
      // Silently fail — recommendations are optional
    } finally {
      setRecsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadWatchQueries();
      loadRecommendations();
    }
  }, [user, loadWatchQueries, loadRecommendations]);

  // Load user profile
  useEffect(() => {
    if (user) {
      setProfileLoading(true);
      api.getUserProfile()
        .then((profile) => {
          setResearchInterests(profile.research_interests || []);
          setDefaultYearMin(profile.default_year_min || 2015);
          setDefaultYearMax(profile.default_year_max || 2026);
          setDefaultMinCitations(profile.default_min_citations || 0);
        })
        .catch(() => { /* Profile might not exist yet */ })
        .finally(() => setProfileLoading(false));
    }
  }, [user]);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      await api.updateUserProfile({
        research_interests: researchInterests,
        default_year_min: defaultYearMin,
        default_year_max: defaultYearMax,
        default_min_citations: defaultMinCitations,
      });
    } catch {
      // ignore
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAddInterest = () => {
    const trimmed = newInterest.trim();
    if (trimmed && !researchInterests.includes(trimmed)) {
      setResearchInterests([...researchInterests, trimmed]);
      setNewInterest('');
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setResearchInterests(researchInterests.filter((i) => i !== interest));
  };

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

  const handleDismissRecommendation = async (id: string) => {
    setDismissingId(id);
    try {
      await api.dismissRecommendation(id);
      setRecommendations((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    } finally {
      setDismissingId(null);
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
      <header className="border-b border-[#1a2555]/50 glass-strong">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <a
                href="/"
                className="text-lg font-bold text-accent"
              >
                SG3D
              </a>
              <span className="text-xs font-mono text-cosmic-glow/60 uppercase tracking-widest">COMMAND CENTER</span>
            </div>
            <span className="text-text-secondary/40">|</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-cosmic-pulse" />
              <span className="text-[10px] font-mono text-text-secondary/50">ONLINE</span>
            </div>
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
        {/* Research Settings Section */}
        <section>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-between w-full mb-4"
          >
            <div>
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2 mb-1">
                <Settings className="w-5 h-5 text-cosmic-glow/60" />
                STATION CONFIGURATION
              </h2>
              <p className="text-sm text-text-secondary text-left">
                Customize your search defaults and interests
              </p>
            </div>
            {showSettings ? (
              <ChevronUp className="w-5 h-5 text-[#7B8CDE]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[#7B8CDE]" />
            )}
          </button>

          {showSettings && (
            <div className="hud-panel p-6 space-y-6">
              {profileLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="text-xs font-mono text-cosmic-glow/50 animate-cosmic-pulse uppercase tracking-widest">LOADING CONFIG...</div>
                </div>
              ) : (
                <>
                  {/* Research Interests */}
                  <div>
                    <label className="font-mono text-xs uppercase tracking-wide text-[#7B8CDE] mb-2 block">
                      Research Interests
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {researchInterests.map((interest) => (
                        <span
                          key={interest}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-cosmic-glow/10 border border-cosmic-glow/20 text-cosmic-glow rounded-full text-xs"
                        >
                          <Tag className="w-3 h-3" />
                          {interest}
                          <button
                            onClick={() => handleRemoveInterest(interest)}
                            className="ml-0.5 hover:text-red-400 transition-colors"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newInterest}
                        onChange={(e) => setNewInterest(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddInterest();
                          }
                        }}
                        placeholder="e.g., machine learning, climate change..."
                        className="flex-1 px-3 py-1.5 bg-[#0a0f1e] border border-[#1a2555] rounded-lg text-sm text-[#E8EAF6] placeholder-[#7B8CDE]/40 focus:outline-none focus:border-cosmic-glow/40"
                      />
                      <button
                        onClick={handleAddInterest}
                        className="px-3 py-1.5 hud-button text-xs font-medium rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Year Range */}
                  <div>
                    <label className="font-mono text-xs uppercase tracking-wide text-[#7B8CDE] mb-2 block">
                      Default Year Range
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        value={defaultYearMin}
                        onChange={(e) => setDefaultYearMin(Number(e.target.value))}
                        min={1950}
                        max={2026}
                        className="w-24 px-3 py-1.5 bg-[#0a0f1e] border border-[#1a2555] rounded-lg text-sm text-[#E8EAF6] focus:outline-none focus:border-cosmic-glow/40"
                      />
                      <span className="text-[#7B8CDE]/50">to</span>
                      <input
                        type="number"
                        value={defaultYearMax}
                        onChange={(e) => setDefaultYearMax(Number(e.target.value))}
                        min={1950}
                        max={2026}
                        className="w-24 px-3 py-1.5 bg-[#0a0f1e] border border-[#1a2555] rounded-lg text-sm text-[#E8EAF6] focus:outline-none focus:border-cosmic-glow/40"
                      />
                    </div>
                  </div>

                  {/* Min Citations */}
                  <div>
                    <label className="font-mono text-xs uppercase tracking-wide text-[#7B8CDE] mb-2 block">
                      Default Minimum Citations
                    </label>
                    <input
                      type="number"
                      value={defaultMinCitations}
                      onChange={(e) => setDefaultMinCitations(Number(e.target.value))}
                      min={0}
                      className="w-32 px-3 py-1.5 bg-[#0a0f1e] border border-[#1a2555] rounded-lg text-sm text-[#E8EAF6] focus:outline-none focus:border-cosmic-glow/40"
                    />
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveProfile}
                      disabled={profileSaving}
                      className="flex items-center gap-2 px-4 py-2 hud-button text-sm font-mono uppercase tracking-wider disabled:opacity-50"
                    >
                      {profileSaving ? (
                        <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Settings
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Recommendations Section */}
        {(recsLoading || recommendations.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2 mb-1">
                  <Sparkles className="w-5 h-5 text-cosmic-glow" />
                  DETECTED SIGNALS
                </h2>
                <p className="text-sm text-text-secondary">
                  Papers matching your research interests
                </p>
              </div>
            </div>

            {recsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-xs font-mono text-cosmic-glow/50 animate-cosmic-pulse uppercase tracking-widest">SCANNING FOR SIGNALS...</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {recommendations.slice(0, 6).map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    onDismiss={handleDismissRecommendation}
                    isDismissing={dismissingId === rec.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Watch Queries Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2 mb-1">
                <Eye className="w-5 h-5 text-cosmic-glow" />
                SURVEILLANCE PROBES
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
                  <span className="flex items-center gap-1 text-cosmic-glow">
                    <Bell className="w-3 h-3" />
                    {totalNewPapers} new papers
                  </span>
                )}
              </div>
              <button
                onClick={handleCheckNow}
                disabled={isChecking || watchQueries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono uppercase border border-[#1a2555] bg-[#0a0f1e] hover:bg-[#111833] text-[#7B8CDE] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`}
                />
                Check Now
              </button>
              <button
                onClick={() => router.push('/explore')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono uppercase hud-button transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                DEPLOY PROBE
              </button>
            </div>
          </div>

          {watchLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-xs font-mono text-cosmic-glow/50 animate-cosmic-pulse uppercase tracking-widest">SCANNING PROBES...</div>
            </div>
          ) : watchQueries.length === 0 ? (
            <div className="hud-panel p-8 text-center">
              <Eye className="w-8 h-8 text-[#7B8CDE]/30 mx-auto mb-3" />
              <p className="text-sm text-[#7B8CDE] mb-1 font-mono uppercase tracking-wide">
                NO ACTIVE PROBES
              </p>
              <p className="text-xs text-[#7B8CDE]/50 mb-4">
                Deploy surveillance probes to monitor research areas
              </p>
              <button
                onClick={() => router.push('/explore')}
                className="inline-flex items-center gap-1.5 px-4 py-2 hud-button text-xs font-mono uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" />
                DEPLOY PROBE
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {watchQueries.map((wq) => (
                <div
                  key={wq.id}
                  className="hud-panel p-4 hover:border-cosmic-glow/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm text-[#E8EAF6] font-medium leading-tight">
                      {wq.query}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {wq.notify_email ? (
                        <Bell className="w-3 h-3 text-cosmic-glow" />
                      ) : (
                        <BellOff className="w-3 h-3 text-[#7B8CDE]/50" />
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
                            className="text-[10px] text-[#7B8CDE] hover:text-[#E8EAF6] px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(wq.id)}
                          className="p-1 rounded text-[#7B8CDE]/50 hover:text-red-400 hover:bg-red-900/20 transition-colors"
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
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#0a0f1e] border border-[#1a2555] rounded text-[10px] text-[#7B8CDE]">
                        <Calendar className="w-2.5 h-2.5" />
                        {wq.filters.year_min}
                        {wq.filters.year_max
                          ? `\u2013${wq.filters.year_max}`
                          : '+'}
                      </span>
                    )}
                    {wq.filters.field && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#0a0f1e] border border-[#1a2555] rounded text-[10px] text-[#7B8CDE]">
                        <Filter className="w-2.5 h-2.5" />
                        {wq.filters.field}
                      </span>
                    )}
                  </div>

                  {/* Footer with new papers action */}
                  <div className="flex items-center justify-between text-[10px] text-[#7B8CDE]/50 font-mono">
                    <span>Checked: {formatDate(wq.last_checked)}</span>
                    {(wq.new_paper_count ?? 0) > 0 ? (
                      <button
                        onClick={() =>
                          router.push(
                            `/explore?q=${encodeURIComponent(wq.query)}`
                          )
                        }
                        className="flex items-center gap-1 bg-cosmic-glow text-background px-2 py-0.5 rounded-full font-mono font-medium hover:bg-cosmic-glow/80 transition-colors animate-cosmic-pulse"
                      >
                        {wq.new_paper_count} new
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    ) : (
                      <span className="text-[#7B8CDE]/30">No new papers</span>
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
              MISSION ARCHIVES
            </h1>
            <p className="text-sm text-text-secondary">
              Access and manage your previous exploration missions
            </p>
          </div>

          <SavedGraphs />
        </section>
      </main>
    </div>
  );
}
