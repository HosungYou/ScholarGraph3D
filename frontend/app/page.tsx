'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, HelpCircle, GitBranch, Layers, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { UserProfile } from '@/types';

type InputMode = 'doi' | 'keyword' | 'question';

const DOI_PATTERN = /10\.\d{4,}\/\S+/;

function looksLikeDoi(input: string): boolean {
  return DOI_PATTERN.test(input) || input.includes('doi.org/');
}

const EXAMPLE_SEEDS = [
  { label: 'Attention Is All You Need', doi: '10.48550/arXiv.1706.03762', field: 'Transformers' },
  { label: 'AlphaFold 2', doi: '10.1038/s41586-021-03819-2', field: 'Protein' },
  { label: 'BERT', doi: '10.48550/arXiv.1810.04805', field: 'NLP' },
];

const EXAMPLE_QUERIES = [
  { label: 'transformer architecture', field: 'CS' },
  { label: 'AI adoption healthcare', field: 'Med' },
  { label: 'climate change impacts', field: 'Env' },
  { label: 'CRISPR gene editing', field: 'Bio' },
];

export default function LandingPage() {
  const [activeMode, setActiveMode] = useState<InputMode>('doi');
  const [inputValue, setInputValue] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isLoadingDoi, setIsLoadingDoi] = useState(false);
  const [doiError, setDoiError] = useState<string | null>(null);
  const [isLoadingScaffold, setIsLoadingScaffold] = useState(false);
  const [scaffoldAngles, setScaffoldAngles] = useState<{
    label: string;
    query: string;
    type: string;
  }[] | null>(null);
  const router = useRouter();

  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (user && window.location.hash.includes('access_token')) {
      router.push('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sg3d-recent-searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch {}
  }, []);

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
    // Auto-detect DOIs entered in keyword mode
    if (looksLikeDoi(q)) {
      setActiveMode('doi');
      setInputValue(q.trim());
      handleDOILookup(q.trim());
      return;
    }
    saveRecentSearch(q.trim());
    router.push(`/explore?q=${encodeURIComponent(q.trim())}`);
  };

  const handleDOILookup = async (doi: string) => {
    if (!doi.trim()) return;
    setIsLoadingDoi(true);
    setDoiError(null);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const resp = await fetch(
        `${API_BASE}/api/papers/by-doi?doi=${encodeURIComponent(doi.trim())}`,
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.paper_id) {
        router.push(`/explore/seed?paper_id=${encodeURIComponent(data.paper_id)}`);
      } else {
        throw new Error('No paper ID returned');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDoiError(`Could not find paper: ${msg}`);
    } finally {
      setIsLoadingDoi(false);
    }
  };

  const handleQuestionSubmit = async (question: string) => {
    if (!question.trim()) return;
    setIsLoadingScaffold(true);
    setScaffoldAngles(null);

    try {
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
    setDoiError(null);
    if (activeMode === 'doi') handleDOILookup(inputValue);
    else if (activeMode === 'keyword') handleKeywordSearch(inputValue);
    else handleQuestionSubmit(inputValue);
  };

  const switchMode = (mode: InputMode) => {
    setActiveMode(mode);
    setInputValue('');
    setScaffoldAngles(null);
    setDoiError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-surface pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full bg-accent/4 blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] rounded-full bg-accent-purple/3 blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-3xl px-6">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent/80 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Navigate the topology of knowledge
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4 leading-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-purple to-accent-green">
              ScholarGraph3D
            </span>
          </h1>
          <p className="text-lg text-text-secondary/80 max-w-xl mx-auto leading-relaxed">
            Academic papers mapped in 3D space — semantically, temporally, relationally.
            Start from a paper you know. Let the knowledge topology guide the rest.
          </p>
        </motion.div>

        {/* Primary: Seed Paper Input */}
        <AnimatePresence mode="wait">
          {activeMode === 'doi' && (
            <motion.div
              key="doi"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mb-5"
            >
              {/* Seed Paper concept pills */}
              <div className="flex items-center justify-center gap-4 mb-4 text-xs text-text-secondary/50">
                <span className="flex items-center gap-1.5">
                  <GitBranch className="w-3 h-3 text-accent/50" />
                  Citation network
                </span>
                <span className="w-px h-3 bg-border/30" />
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-accent-purple/50" />
                  Semantic topology
                </span>
                <span className="w-px h-3 bg-border/30" />
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-accent-green/50" />
                  Temporal depth
                </span>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/40 via-accent-purple/30 to-accent-green/30 rounded-2xl blur opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-center glass-strong rounded-2xl overflow-hidden border border-accent/20">
                    <FileText className="w-5 h-5 text-accent/60 ml-5 flex-shrink-0" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        setDoiError(null);
                      }}
                      placeholder="Paste a DOI, URL, or arXiv link…  e.g. 10.1038/s41586-021-03819-2"
                      className="flex-1 bg-transparent px-4 py-5 text-base text-text-primary placeholder:text-text-secondary/40 outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoadingDoi}
                      className="px-8 py-5 bg-accent hover:bg-accent/90 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoadingDoi && (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {isLoadingDoi ? 'Finding…' : 'Explore'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <p className="text-xs text-text-secondary/40">
                    Enter a paper's DOI or URL → explore its full citation universe in 3D
                  </p>
                  {doiError && (
                    <p className="text-xs text-red-400/80">{doiError}</p>
                  )}
                </div>
              </form>

              {/* Example seeds */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-secondary/30">Try:</span>
                {EXAMPLE_SEEDS.map((s) => (
                  <button
                    key={s.doi}
                    onClick={() => handleDOILookup(s.doi)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/60 hover:bg-surface border border-border/30 hover:border-accent/30 text-xs text-text-secondary hover:text-accent transition-all"
                  >
                    <span>{s.label}</span>
                    <span className="text-text-secondary/30">{s.field}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {activeMode === 'keyword' && (
            <motion.div
              key="keyword"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mb-5"
            >
              <form onSubmit={handleSubmit}>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/20 to-accent-purple/20 rounded-2xl blur opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-center glass-strong rounded-2xl overflow-hidden">
                    <Search className="w-5 h-5 text-text-secondary ml-5 flex-shrink-0" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="transformer architecture, AI in healthcare, CRISPR…"
                      className="flex-1 bg-transparent px-4 py-5 text-base text-text-primary placeholder:text-text-secondary/40 outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim()}
                      className="px-8 py-5 bg-surface hover:bg-surface-hover text-text-primary font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l border-border/30"
                    >
                      Search
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-secondary/40 mt-2 px-1">
                  Explore the full landscape of papers in this research area
                </p>
              </form>

              {/* Quick examples */}
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => handleKeywordSearch(ex.label)}
                    className="px-3 py-1.5 bg-surface/60 hover:bg-surface border border-border/30 rounded-full text-xs text-text-secondary hover:text-text-primary transition-all"
                  >
                    {ex.label}
                    <span className="ml-1.5 text-text-secondary/30">{ex.field}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {activeMode === 'question' && (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mb-5"
            >
              <form onSubmit={handleSubmit}>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-purple/20 to-accent-green/20 rounded-2xl blur opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-center glass-strong rounded-2xl overflow-hidden">
                    <HelpCircle className="w-5 h-5 text-text-secondary ml-5 flex-shrink-0" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        if (scaffoldAngles) setScaffoldAngles(null);
                      }}
                      placeholder="How does AI affect doctor-patient relationships?"
                      className="flex-1 bg-transparent px-4 py-5 text-base text-text-primary placeholder:text-text-secondary/40 outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoadingScaffold}
                      className="px-8 py-5 bg-surface hover:bg-surface-hover text-text-primary font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l border-border/30 flex items-center gap-2"
                    >
                      {isLoadingScaffold && (
                        <div className="w-4 h-4 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
                      )}
                      {scaffoldAngles ? 'New Question' : 'Suggest Angles'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-secondary/40 mt-2 px-1">
                  AI analyzes your question and suggests 5 exploration angles
                </p>
              </form>

              {/* Scaffold angles */}
              <AnimatePresence>
                {scaffoldAngles && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 glass rounded-2xl p-4 border border-accent/20"
                  >
                    <p className="text-xs text-text-secondary/60 mb-3 font-medium">
                      Choose your exploration angle:
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
                          <span className="text-xs text-text-secondary/40 ml-auto font-mono">
                            {angle.query}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setScaffoldAngles(null)}
                      className="mt-3 text-xs text-text-secondary/30 hover:text-text-secondary transition-colors"
                    >
                      ✕ Dismiss
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode switcher — compact, secondary */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-1 mb-8"
        >
          {(
            [
              { mode: 'doi' as InputMode, icon: FileText, label: 'Seed Paper', primary: true },
              { mode: 'keyword' as InputMode, icon: Search, label: 'Topic Search', primary: false },
              { mode: 'question' as InputMode, icon: HelpCircle, label: 'Research Question', primary: false },
            ] as const
          ).map(({ mode, icon: Icon, label, primary }) => (
            <button
              key={mode}
              onClick={() => switchMode(mode)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activeMode === mode
                  ? primary
                    ? 'bg-accent/15 border-accent/30 text-accent'
                    : 'bg-surface border-border/40 text-text-primary'
                  : 'bg-transparent border-transparent text-text-secondary/50 hover:text-text-secondary hover:border-border/20'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </motion.div>

        {/* Continue Exploring — logged-in users */}
        {user && (userProfile?.research_interests?.length || recentSearches.length > 0) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mb-8 glass rounded-2xl p-4 border border-purple-500/15"
          >
            <p className="text-xs text-text-secondary/50 mb-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
              Continue exploring
            </p>
            <div className="flex flex-wrap gap-2">
              {userProfile?.research_interests?.slice(0, 3).map((interest) => (
                <button
                  key={interest}
                  onClick={() => handleKeywordSearch(interest)}
                  className="px-3 py-1.5 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/40 rounded-full text-xs text-purple-300 hover:text-purple-200 transition-all"
                >
                  {interest}
                </button>
              ))}
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
              <span className="text-[10px] text-text-secondary/30">
                {userProfile
                  ? `${userProfile.total_searches} searches · ${userProfile.total_papers_viewed} papers viewed`
                  : ''}
              </span>
              <a href="/dashboard" className="text-[10px] text-purple-400/60 hover:text-purple-300 transition-colors">
                Dashboard →
              </a>
            </div>
          </motion.div>
        )}

        {/* Philosophy strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="grid grid-cols-3 gap-4 mb-10"
        >
          {[
            {
              icon: GitBranch,
              color: '#4A90D9',
              title: 'Citation topology',
              desc: 'References and co-citations reveal the intellectual lineage of every idea.',
            },
            {
              icon: Layers,
              color: '#9B59B6',
              title: 'Semantic clusters',
              desc: 'SPECTER2 embeddings place papers by meaning — not just keywords.',
            },
            {
              icon: Clock,
              color: '#2ECC71',
              title: 'Time depth on Z',
              desc: 'The Z-axis is publication year — knowledge archaeology in 3D.',
            },
          ].map((f) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -2 }}
              className="glass rounded-xl p-4 border border-border/20 hover:border-border/40 transition-colors"
            >
              <f.icon className="w-5 h-5 mb-3" style={{ color: f.color }} />
              <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
              <p className="text-xs text-text-secondary/60 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="text-center text-xs text-text-secondary/30"
        >
          <a href={user ? '/dashboard' : '/auth'} className="hover:text-accent transition-colors">
            {user ? 'My Account' : 'Sign In'}
          </a>
          <span className="mx-3">·</span>
          <a href="/dashboard" className="hover:text-accent transition-colors">
            Dashboard
          </a>
        </motion.div>
      </div>
    </div>
  );
}
