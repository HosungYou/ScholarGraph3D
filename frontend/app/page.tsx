'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, HelpCircle, Box, Brain, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { UserProfile } from '@/types';

type InputMode = 'keyword' | 'doi' | 'question';

const EXAMPLE_QUERIES = [
  { label: 'transformer architecture', field: 'CS' },
  { label: 'AI adoption healthcare', field: 'Med' },
  { label: 'climate change impacts', field: 'Env' },
  { label: 'CRISPR gene editing', field: 'Bio' },
];

export default function LandingPage() {
  const [activeMode, setActiveMode] = useState<InputMode>('keyword');
  const [inputValue, setInputValue] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isLoadingScaffold, setIsLoadingScaffold] = useState(false);
  const [scaffoldAngles, setScaffoldAngles] = useState<{
    label: string;
    query: string;
    type: string;
  }[] | null>(null);
  const router = useRouter();

  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Safety net: if OAuth hash fragment lands on root, redirect authenticated users
  useEffect(() => {
    if (user && window.location.hash.includes('access_token')) {
      router.push('/dashboard');
    }
  }, [user, router]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sg3d-recent-searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch {}
  }, []);

  // Load user profile when logged in
  useEffect(() => {
    if (user) {
      api.getUserProfile().then(setUserProfile).catch(() => {});
    }
  }, [user]);

  const saveRecentSearch = (q: string) => {
    try {
      const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('sg3d-recent-searches', JSON.stringify(updated));
    } catch {}
  };

  const handleKeywordSearch = (q: string) => {
    if (!q.trim()) return;
    saveRecentSearch(q.trim());
    router.push(`/explore?q=${encodeURIComponent(q.trim())}`);
  };

  const handleDOISearch = (doi: string) => {
    if (!doi.trim()) return;
    router.push(`/explore?doi=${encodeURIComponent(doi.trim())}`);
  };

  const handleQuestionSubmit = async (question: string) => {
    if (!question.trim()) return;
    setIsLoadingScaffold(true);
    setScaffoldAngles(null);

    try {
      // Try Groq for fast angle generation
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const resp = await fetch(`${API_BASE}/api/analysis/scaffold-angles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setScaffoldAngles(data.angles);
      } else {
        // Fallback: generate generic angles
        const q = question.trim();
        setScaffoldAngles([
          { label: '🔭 Broad Survey', query: `${q} survey review`, type: 'broad' },
          { label: '🎯 Focused Study', query: `${q} empirical study`, type: 'narrow' },
          { label: '🔬 Methodology', query: `${q} methodology systematic`, type: 'method' },
          { label: '📐 Theory', query: `${q} theoretical framework`, type: 'theory' },
          { label: '👥 Population', query: `${q} specific context`, type: 'population' },
        ]);
      }
    } catch {
      // Fallback angles on network error
      const q = question.trim();
      setScaffoldAngles([
        { label: '🔭 Broad Survey', query: `${q} survey review`, type: 'broad' },
        { label: '🎯 Focused Study', query: `${q} empirical study`, type: 'narrow' },
        { label: '🔬 Methodology', query: `${q} methodology systematic`, type: 'method' },
        { label: '📐 Theory', query: `${q} theoretical framework`, type: 'theory' },
        { label: '👥 Population', query: `${q} specific context`, type: 'population' },
      ]);
    } finally {
      setIsLoadingScaffold(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeMode === 'keyword') handleKeywordSearch(inputValue);
    else if (activeMode === 'doi') handleDOISearch(inputValue);
    else handleQuestionSubmit(inputValue);
  };

  const modeConfig = {
    keyword: {
      icon: Search,
      label: '🔍 Field Search',
      placeholder: 'transformer architecture, AI in healthcare...',
      buttonText: 'Explore',
      hint: 'Explore the full landscape of papers in this research area',
    },
    doi: {
      icon: FileText,
      label: '📄 Seed Paper',
      placeholder: '10.1016/j.cell.2023.01.001 or paper URL...',
      buttonText: 'Analyze',
      hint: 'Start from a specific paper and explore its citation network',
    },
    question: {
      icon: HelpCircle,
      label: '🤔 Research Question',
      placeholder: 'How does AI affect doctor-patient relationships?',
      buttonText: scaffoldAngles ? 'New Question' : 'Suggest Angles',
      hint: 'AI analyzes your question and suggests 5 exploration angles',
    },
  };

  const currentMode = modeConfig[activeMode];

  const features = [
    {
      icon: Box,
      title: '3D Visualization',
      description: 'Navigate citation networks and topic clusters in an immersive 3D space.',
      color: '#4A90D9',
    },
    {
      icon: Brain,
      title: 'AI Analysis',
      description: 'Automatic clustering, TLDR generation, and research gap detection.',
      color: '#2ECC71',
    },
    {
      icon: Zap,
      title: 'Real-time Sync',
      description: 'Live data from Semantic Scholar and OpenAlex with UMAP embeddings.',
      color: '#E67E22',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-surface pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-accent/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl px-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-6xl font-bold tracking-tight mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-purple to-accent-green">
              ScholarGraph3D
            </span>
          </h1>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Explore the universe of academic papers in 3D
          </p>
        </motion.div>

        {/* Mode Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex gap-2 mb-4 justify-center"
        >
          {(Object.keys(modeConfig) as InputMode[]).map((mode) => {
            const cfg = modeConfig[mode];
            return (
              <button
                key={mode}
                onClick={() => {
                  setActiveMode(mode);
                  setInputValue('');
                  setScaffoldAngles(null);
                }}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  activeMode === mode
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-surface/60 border-border/30 text-text-secondary hover:text-text-primary hover:border-border/50'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </motion.div>

        {/* Search Input */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={handleSubmit}
          className="mb-4"
        >
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/30 via-accent-purple/30 to-accent-green/30 rounded-2xl blur-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center glass-strong rounded-2xl overflow-hidden">
              <currentMode.icon className="w-5 h-5 text-text-secondary ml-5 flex-shrink-0" />
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (scaffoldAngles) setScaffoldAngles(null);
                }}
                placeholder={currentMode.placeholder}
                className="flex-1 bg-transparent px-4 py-5 text-lg text-text-primary placeholder:text-text-secondary/60 outline-none"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoadingScaffold}
                className="px-8 py-5 bg-accent hover:bg-accent/90 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoadingScaffold && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {currentMode.buttonText}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-secondary/50 mt-2 text-center">{currentMode.hint}</p>
        </motion.form>

        {/* Scaffolding Angles (question mode) */}
        <AnimatePresence>
          {scaffoldAngles && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 glass rounded-2xl p-5 border border-accent/20"
            >
              <p className="text-sm text-text-secondary mb-3 font-medium">
                Choose your exploration angle (click to explore):
              </p>
              <div className="flex flex-col gap-2">
                {scaffoldAngles.map((angle, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      saveRecentSearch(angle.query);
                      router.push(`/explore?q=${encodeURIComponent(angle.query)}`);
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left bg-surface/60 hover:bg-surface border border-border/30 hover:border-accent/30 transition-all group"
                  >
                    <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                      {angle.label}
                    </span>
                    <span className="text-xs text-text-secondary/60 ml-auto font-mono">
                      {angle.query}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setScaffoldAngles(null)}
                className="mt-3 text-xs text-text-secondary/50 hover:text-text-secondary transition-colors"
              >
                ✕ Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue Exploring — logged-in users */}
        {user && (userProfile?.research_interests?.length || recentSearches.length > 0) && !scaffoldAngles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mb-6 glass rounded-2xl p-5 border border-purple-500/20"
          >
            <p className="text-xs text-text-secondary/60 mb-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
              Continue exploring
            </p>
            <div className="flex flex-wrap gap-2">
              {/* From research interests */}
              {userProfile?.research_interests?.slice(0, 3).map((interest) => (
                <button
                  key={interest}
                  onClick={() => handleKeywordSearch(interest)}
                  className="px-3 py-1.5 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/40 rounded-full text-xs text-purple-300 hover:text-purple-200 transition-all"
                >
                  {interest}
                </button>
              ))}
              {/* From recent searches */}
              {recentSearches.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => handleKeywordSearch(s)}
                  className="px-3 py-1.5 bg-surface/60 hover:bg-surface border border-border/30 rounded-full text-xs text-text-secondary hover:text-text-primary transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-text-secondary/40">
                {userProfile ? `${userProfile.total_searches} searches · ${userProfile.total_papers_viewed} papers viewed` : ''}
              </span>
              <a href="/dashboard" className="text-[10px] text-purple-400/70 hover:text-purple-300 transition-colors">
                View dashboard →
              </a>
            </div>
          </motion.div>
        )}

        {/* Quick examples (keyword mode) — shown only when not logged in or no profile data */}
        {activeMode === 'keyword' && !scaffoldAngles && !(user && (userProfile?.research_interests?.length || recentSearches.length > 0)) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-2 justify-center mb-8"
          >
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => handleKeywordSearch(ex.label)}
                className="px-4 py-2 bg-surface/80 hover:bg-surface border border-border/40 rounded-full text-sm text-text-secondary hover:text-text-primary transition-all"
              >
                {ex.label}
                <span className="ml-2 text-xs text-text-secondary/40">{ex.field}</span>
              </button>
            ))}
          </motion.div>
        )}

        {/* Recent searches — shown only when not logged in */}
        {recentSearches.length > 0 && !scaffoldAngles && !user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-2 justify-center flex-wrap mb-8"
          >
            <span className="text-xs text-text-secondary/40">Recent:</span>
            {recentSearches.map((s) => (
              <button
                key={s}
                onClick={() => handleKeywordSearch(s)}
                className="px-3 py-1 bg-surface/60 hover:bg-surface border border-border/30 rounded-full text-xs text-text-secondary hover:text-text-primary transition-all"
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
              className="glass rounded-xl p-6 hover:bg-surface-hover/50 transition-colors group"
            >
              <feature.icon
                className="w-8 h-8 mb-4 transition-transform group-hover:scale-110"
                style={{ color: feature.color }}
              />
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center text-sm text-text-secondary/60"
        >
          <a href="/auth" className="hover:text-accent transition-colors">
            Sign In
          </a>
          <span className="mx-3">|</span>
          <a href="/dashboard" className="hover:text-accent transition-colors">
            Dashboard
          </a>
        </motion.div>
      </div>
    </div>
  );
}
