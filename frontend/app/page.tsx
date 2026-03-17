'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, BookOpen, Check, Clock3, GitCompareArrows, Plus, Search, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import dynamic from 'next/dynamic';
import type { StarfieldBackgroundRef } from '@/components/cosmic/StarfieldBackground';
import type { PaperSearchResult } from '@/types';

const StarfieldBackground = dynamic(
  () => import('@/components/cosmic/StarfieldBackground'),
  { ssr: false }
);

const AstronautHelmet = dynamic(
  () => import('@/components/cosmic/AstronautHelmet'),
  { ssr: false }
);

type InputMode = 'doi' | 'natural';

const DOI_PATTERN = /10\.\d{4,}\/\S+/;

function looksLikeDoi(input: string): boolean {
  return DOI_PATTERN.test(input) || input.includes('doi.org/');
}

const EXAMPLE_SEEDS = [
  { label: 'Attention Is All You Need', doi: '10.48550/arXiv.1706.03762', field: 'CS', color: '#4DA6FF' },
  { label: 'AlphaFold 2', doi: '10.1038/s41586-021-03819-2', field: 'Bio', color: '#69F0AE' },
  { label: 'BERT', doi: '10.48550/arXiv.1810.04805', field: 'NLP', color: '#4DA6FF' },
  { label: 'mRNA Vaccines', doi: '10.1038/s41586-020-2622-0', field: 'Med', color: '#FF5252' },
  { label: 'GPT-4 Technical Report', doi: '10.48550/arXiv.2303.08774', field: 'CS', color: '#4DA6FF' },
  { label: 'Diffusion Models', doi: '10.48550/arXiv.2006.11239', field: 'CS', color: '#B388FF' },
];

const EXAMPLE_QUERIES = [
  { label: 'transformer architecture', field: 'CS', color: '#4DA6FF' },
  { label: 'AI adoption healthcare', field: 'Med', color: '#FF5252' },
  { label: 'climate change impacts', field: 'Env', color: '#76FF03' },
  { label: 'CRISPR gene editing', field: 'Bio', color: '#69F0AE' },
  { label: 'quantum computing algorithms', field: 'Physics', color: '#EA80FC' },
  { label: 'large language models', field: 'CS', color: '#4DA6FF' },
  { label: 'renewable energy storage', field: 'Eng', color: '#B388FF' },
  { label: 'behavioral economics nudges', field: 'Econ', color: '#FFD740' },
];

const HISTORY_KEY = 'sg3d-search-history';
const MAX_HISTORY = 10;

interface SearchHistoryEntry {
  query: string;
  type: 'doi' | 'search';
  timestamp: number;
  label?: string;
}

function getSearchHistory(): SearchHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSearchHistory(entry: Omit<SearchHistoryEntry, 'timestamp'>) {
  if (typeof window === 'undefined') return;
  try {
    const history = getSearchHistory();
    const deduplicated = history.filter(h => h.query !== entry.query);
    deduplicated.unshift({ ...entry, timestamp: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(deduplicated.slice(0, MAX_HISTORY)));
  } catch {}
}

function clearSearchHistory() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_KEY);
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function formatAuthors(paper: PaperSearchResult): string {
  const names = paper.authors?.slice(0, 3).map((author) => author.name).filter(Boolean) || [];
  if (names.length === 0) return 'Author metadata unavailable';
  const suffix = paper.authors.length > 3 ? ' et al.' : '';
  return `${names.join(', ')}${suffix}`;
}

function getSearchReasons(paper: PaperSearchResult, query: string, index: number): string[] {
  const reasons: string[] = [];
  const loweredQuery = query.toLowerCase();

  if (index === 0) reasons.push('top match');
  if ((paper.citation_count || 0) > 1000) reasons.push('highly cited anchor');
  if (paper.year >= 2022) reasons.push('recent paper');
  if (paper.abstract_snippet) reasons.push('abstract available');
  if (paper.venue) reasons.push(`from ${paper.venue}`);
  if (paper.fields.some((field) => loweredQuery.includes(field.toLowerCase()))) {
    reasons.push('field match');
  }

  return reasons.slice(0, 3);
}

function getSeedFitLabel(paper: PaperSearchResult, index: number): string {
  if ((paper.citation_count || 0) > 1000) return 'Strong overview seed';
  if (paper.year >= 2023) return 'Good frontier seed';
  if (index === 0) return 'Best first seed';
  return 'Viable seed paper';
}

export default function LandingPage() {
  const [activeMode, setActiveMode] = useState<InputMode>('natural');
  const [inputValue, setInputValue] = useState('');
  const [isLoadingDoi, setIsLoadingDoi] = useState(false);
  const [doiError, setDoiError] = useState<string | null>(null);
  const [isLoadingNatural, setIsLoadingNatural] = useState(false);
  const [naturalResults, setNaturalResults] = useState<PaperSearchResult[] | null>(null);
  const [refinedQuery, setRefinedQuery] = useState<string | null>(null);
  const [shortlistedPaperIds, setShortlistedPaperIds] = useState<string[]>([]);
  const router = useRouter();

  const starfieldRef = useRef<StarfieldBackgroundRef>(null);
  const [isWarping, setIsWarping] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [displayedSeeds, setDisplayedSeeds] = useState(EXAMPLE_SEEDS.slice(0, 3));
  const [displayedQueries, setDisplayedQueries] = useState(EXAMPLE_QUERIES.slice(0, 4));

  const { user } = useAuth();

  const shortlistedPapers = (naturalResults || []).filter((paper) =>
    shortlistedPaperIds.includes(paper.paper_id)
  );

  const mostCitedShortlist = shortlistedPapers.reduce<PaperSearchResult | null>((best, paper) => {
    if (!best || paper.citation_count > best.citation_count) return paper;
    return best;
  }, null);

  const mostRecentShortlist = shortlistedPapers.reduce<PaperSearchResult | null>((best, paper) => {
    if (!best || (paper.year || 0) > (best.year || 0)) return paper;
    return best;
  }, null);

  useEffect(() => {
    if (user && window.location.hash.includes('access_token')) {
      router.push('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    setSearchHistory(getSearchHistory());
    setDisplayedSeeds(pickRandom(EXAMPLE_SEEDS, 3));
    setDisplayedQueries(pickRandom(EXAMPLE_QUERIES, 4));
  }, []);

  const handleDOILookup = async (doi: string) => {
    if (!doi.trim()) return;
    setIsLoadingDoi(true);
    setDoiError(null);

    try {
      const data = await api.getPaperByDOI(doi.trim());
      if (data.paper_id) {
        saveSearchHistory({ query: doi, type: 'doi', label: doi });
        setSearchHistory(getSearchHistory());
        setIsWarping(true);
        starfieldRef.current?.triggerWarp();
        setTimeout(() => {
          router.push(`/explore/seed?paper_id=${encodeURIComponent(data.paper_id)}`);
        }, 600);
      } else {
        throw new Error('No paper ID returned');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDoiError(`Paper not found: ${msg}`);
      setIsWarping(false);
    } finally {
      setIsLoadingDoi(false);
    }
  };

  const handleNaturalSearch = async (query: string) => {
    if (!query.trim()) return;
    if (looksLikeDoi(query)) {
      setActiveMode('doi');
      setInputValue(query.trim());
      handleDOILookup(query.trim());
      return;
    }
    setIsLoadingNatural(true);
    setNaturalResults(null);
    setRefinedQuery(null);
    setShortlistedPaperIds([]);
    try {
      const data = await api.searchPapers(query.trim());
      setNaturalResults(data.papers || []);
      setRefinedQuery(data.refined_query || null);
      saveSearchHistory({ query: query.trim(), type: 'search' });
      setSearchHistory(getSearchHistory());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDoiError(`Search failed: ${msg}`);
      setRefinedQuery(null);
    } finally {
      setIsLoadingNatural(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDoiError(null);
    if (isWarping) return;
    if (activeMode === 'doi') handleDOILookup(inputValue);
    else handleNaturalSearch(inputValue);
  };

  const switchMode = (mode: InputMode) => {
    setActiveMode(mode);
    setInputValue('');
    setNaturalResults(null);
    setRefinedQuery(null);
    setShortlistedPaperIds([]);
    setDoiError(null);
  };

  const startSeedWorkspace = (paperId: string) => {
    setIsWarping(true);
    starfieldRef.current?.triggerWarp();
    setTimeout(() => {
      router.push(`/explore/seed?paper_id=${encodeURIComponent(paperId)}`);
    }, 600);
  };

  const toggleShortlist = (paperId: string) => {
    setShortlistedPaperIds((current) => {
      if (current.includes(paperId)) {
        return current.filter((id) => id !== paperId);
      }
      if (current.length >= 3) {
        return [...current.slice(1), paperId];
      }
      return [...current, paperId];
    });
  };

  const getShortlistRole = (paper: PaperSearchResult): string => {
    if (mostCitedShortlist?.paper_id === paper.paper_id) return 'Best overview';
    if (mostRecentShortlist?.paper_id === paper.paper_id) return 'Best frontier';
    return 'Balanced candidate';
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      <StarfieldBackground ref={starfieldRef} />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 md:px-16 py-6">
        <div className="flex items-center gap-3">
          <span className="font-serif text-2xl tracking-tight text-white">SG3D</span>
          <span className="text-[10px] font-mono text-neutral-600 tracking-wider">v3.0</span>
        </div>
        <div className="flex items-center gap-6">
          <a href={user ? '/dashboard' : '/auth'} className="text-xs font-mono text-neutral-500 hover:text-white transition-colors tracking-wider uppercase">
            {user ? 'Account' : 'Sign In'}
          </a>
          <a href="/dashboard" className="text-xs font-mono text-neutral-500 hover:text-white transition-colors tracking-wider uppercase">
            Dashboard
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <div className={`relative z-10 ${isWarping ? 'animate-warp' : ''}`}>
        <div className="max-w-7xl mx-auto px-8 md:px-16 pt-8 md:pt-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center min-h-[60vh]">

            {/* Left: Text */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.h1
                className="font-serif text-5xl md:text-7xl lg:text-8xl font-normal leading-[0.95] tracking-tight mb-8"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                Map the<br />
                <span className="text-neutral-400">Universe</span><br />
                of Knowledge.
              </motion.h1>

              <motion.p
                className="text-neutral-500 text-base md:text-lg max-w-md leading-relaxed mb-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                Start from a topic, choose one promising paper, then expand,
                compare, and turn the workspace into a reading plan or research brief.
              </motion.p>

              {/* Stats row */}
              <motion.div
                className="flex items-center gap-10 mb-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                {[
                  { number: 'Topic', label: 'search first' },
                  { number: 'Seed', label: 'pick one paper' },
                  { number: 'Brief', label: 'turn results into output' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="font-serif text-3xl md:text-4xl text-white">{stat.number}</div>
                    <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider mt-1">{stat.label}</div>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right: 3D Helmet */}
            <motion.div
              className="hidden md:flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <AstronautHelmet size={450} />
            </motion.div>
          </div>
        </div>

        {/* Input Section */}
        <motion.div
          className="max-w-3xl mx-auto px-8 md:px-16 py-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          {/* Mode switch */}
          <div className="flex items-center gap-1 mb-4">
            {([
              { mode: 'natural' as InputMode, label: 'Topic Search' },
              { mode: 'doi' as InputMode, label: 'Known Paper' },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                className={`relative px-4 py-2 text-[11px] font-mono uppercase tracking-widest transition-all ${
                  activeMode === mode
                    ? 'text-white'
                    : 'text-neutral-600 hover:text-neutral-400'
                }`}
              >
                {label}
                {activeMode === mode && (
                  <motion.div
                    layoutId="mode-underline"
                    className="absolute -bottom-px left-1 right-1 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Input */}
          <AnimatePresence mode="wait">
            {activeMode === 'doi' ? (
              <motion.div key="doi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <form onSubmit={handleSubmit}>
                  <div className="flex items-stretch border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950 hover:border-neutral-700 focus-within:border-[#D4AF37]/40 focus-within:shadow-[0_0_20px_rgba(212,175,55,0.08)] transition-all duration-300">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => { setInputValue(e.target.value); setDoiError(null); }}
                      placeholder="Paste a DOI, paper URL, or arXiv link..."
                      className="flex-1 bg-transparent px-5 py-4 text-sm text-white placeholder:text-neutral-700 outline-none font-mono"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoadingDoi || isWarping}
                      className="px-6 py-4 bg-[#D4AF37] text-black text-xs font-mono font-semibold uppercase tracking-widest disabled:opacity-20 disabled:cursor-not-allowed hover:bg-[#E5C04B] transition-colors flex items-center gap-2"
                    >
                      {isLoadingDoi ? (
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                      <span>{isLoadingDoi ? 'Finding' : 'Explore'}</span>
                    </button>
                  </div>
                </form>
                {doiError && (
                  <p className="text-xs text-red-400/80 font-mono mt-2">{doiError}</p>
                )}
                <p className="text-[10px] text-neutral-800 mt-2 font-mono tracking-wider">Use this when you already know the exact paper to seed from</p>

                {/* Recent searches */}
                {searchHistory.length > 0 && (
                  <div className="mt-4 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-neutral-700 uppercase tracking-wider">Recent</span>
                      <button
                        onClick={() => { clearSearchHistory(); setSearchHistory([]); }}
                        className="text-[10px] text-neutral-700 hover:text-red-400/60 transition-colors font-mono"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {searchHistory.slice(0, 5).map((h) => (
                        <button
                          key={h.timestamp}
                          onClick={() => {
                            if (h.type === 'doi') {
                              handleDOILookup(h.query);
                            } else {
                              switchMode('natural');
                              setInputValue(h.query);
                              handleNaturalSearch(h.query);
                            }
                          }}
                          className="group flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D4AF37]/15 hover:border-[#D4AF37]/40 text-xs transition-all"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/40 flex-shrink-0" />
                          <span className="text-neutral-400 group-hover:text-[#D4AF37] transition-colors font-mono text-[11px] truncate max-w-[180px]">{h.label || h.query}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Example seeds */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono text-neutral-700 uppercase tracking-wider">Try:</span>
                  {displayedSeeds.map((s) => (
                    <button
                      key={s.doi}
                      onClick={() => handleDOILookup(s.doi)}
                      className="group flex items-center gap-2 px-3 py-1.5 rounded border border-neutral-800 hover:border-neutral-600 text-xs transition-all"
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-neutral-400 group-hover:text-white transition-colors font-mono text-[11px]">{s.label}</span>
                      <span className="text-neutral-700 text-[9px] font-mono">{s.field}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div key="natural" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <form onSubmit={handleSubmit}>
                  <div className="flex items-stretch border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950 hover:border-neutral-700 focus-within:border-[#D4AF37]/40 focus-within:shadow-[0_0_20px_rgba(212,175,55,0.08)] transition-all duration-300">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => { setInputValue(e.target.value); setNaturalResults(null); setDoiError(null); }}
                      placeholder="Describe a research topic, method, or question..."
                      className="flex-1 bg-transparent px-5 py-4 text-sm text-white placeholder:text-neutral-700 outline-none font-mono"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoadingNatural}
                      className="px-6 py-4 bg-[#D4AF37] text-black text-xs font-mono font-semibold uppercase tracking-widest disabled:opacity-20 disabled:cursor-not-allowed hover:bg-[#E5C04B] transition-colors flex items-center gap-2"
                    >
                      {isLoadingNatural ? (
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>{isLoadingNatural ? 'Searching' : 'Find'}</span>
                    </button>
                  </div>
                </form>
                {doiError && (
                  <p className="text-xs text-red-400/80 font-mono mt-2">{doiError}</p>
                )}
                <p className="text-[10px] text-neutral-800 mt-2 font-mono tracking-wider">Start broad, then choose one paper to anchor the workspace</p>

                {refinedQuery && refinedQuery !== inputValue.trim() && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(212,175,55,0.16)] bg-[rgba(212,175,55,0.06)] px-3 py-1 text-[10px] font-mono text-[#D4AF37]/80">
                    <Sparkles className="w-3 h-3" />
                    Interpreted as: {refinedQuery}
                  </div>
                )}

                {/* Recent searches */}
                {searchHistory.length > 0 && !naturalResults && (
                  <div className="mt-4 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-neutral-700 uppercase tracking-wider">Recent</span>
                      <button
                        onClick={() => { clearSearchHistory(); setSearchHistory([]); }}
                        className="text-[10px] text-neutral-700 hover:text-red-400/60 transition-colors font-mono"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {searchHistory.slice(0, 5).map((h) => (
                        <button
                          key={h.timestamp}
                          onClick={() => {
                            if (h.type === 'doi') {
                              switchMode('doi');
                              setInputValue(h.query);
                              handleDOILookup(h.query);
                            } else {
                              setInputValue(h.query);
                              handleNaturalSearch(h.query);
                            }
                          }}
                          className="group flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D4AF37]/15 hover:border-[#D4AF37]/40 text-xs transition-all"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/40 flex-shrink-0" />
                          <span className="text-neutral-400 group-hover:text-[#D4AF37] transition-colors font-mono text-[11px] truncate max-w-[180px]">{h.label || h.query}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick examples */}
                {!naturalResults && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-[10px] font-mono text-neutral-700 uppercase tracking-wider">Try:</span>
                    {displayedQueries.map((ex) => (
                      <button
                        key={ex.label}
                        onClick={() => { setInputValue(ex.label); handleNaturalSearch(ex.label); }}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded border border-neutral-800 hover:border-neutral-600 text-xs transition-all font-mono"
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ex.color }} />
                        <span className="text-neutral-400 group-hover:text-white transition-colors">{ex.label}</span>
                        <span className="text-neutral-700 text-[9px]">{ex.field}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Search results */}
                <AnimatePresence>
                  {naturalResults && naturalResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-4 flex flex-col gap-1.5 max-h-[400px] overflow-y-auto"
                    >
                      <div className="mb-2 px-1">
                        <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-wider">
                          {naturalResults.length} candidate seed papers
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500 font-mono">
                          Shortlist up to three papers, compare them, then commit one as the workspace seed.
                        </p>
                      </div>
                      {shortlistedPapers.length > 0 && (
                        <div className="mb-3 rounded-2xl border border-[rgba(212,175,55,0.18)] bg-[rgba(212,175,55,0.05)] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]/80">
                                <GitCompareArrows className="w-3.5 h-3.5" />
                                Shortlist Compare
                              </div>
                              <p className="mt-2 text-sm text-neutral-300">
                                Compare candidate seeds before you lock in the workspace.
                              </p>
                            </div>
                            <button
                              onClick={() => setShortlistedPaperIds([])}
                              className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 transition-colors hover:text-white"
                            >
                              Clear
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {shortlistedPapers.map((paper) => (
                              <div
                                key={`shortlist-${paper.paper_id}`}
                                className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-black/30 p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="rounded-full border border-[rgba(212,175,55,0.16)] bg-[rgba(212,175,55,0.06)] px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#D4AF37]/75">
                                    {getShortlistRole(paper)}
                                  </span>
                                  <button
                                    onClick={() => toggleShortlist(paper.paper_id)}
                                    className="text-neutral-600 transition-colors hover:text-white"
                                    title="Remove from shortlist"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <h3 className="mt-2 text-sm font-medium leading-snug text-white">
                                  {paper.title}
                                </h3>
                                <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono text-neutral-500">
                                  {paper.year ? <span>{paper.year}</span> : null}
                                  {paper.venue ? <span>{paper.venue}</span> : null}
                                  {paper.citation_count ? <span>{paper.citation_count} cit.</span> : null}
                                </div>
                                <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                                  {formatAuthors(paper)}
                                </p>
                                <button
                                  onClick={() => startSeedWorkspace(paper.paper_id)}
                                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(212,175,55,0.22)] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] transition-colors hover:bg-[rgba(212,175,55,0.08)]"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                  Use as seed
                                </button>
                              </div>
                            ))}
                          </div>

                          {shortlistedPapers.length >= 2 && (
                            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-mono text-neutral-500">
                              {mostCitedShortlist ? (
                                <span className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1">
                                  Most cited: {mostCitedShortlist.title}
                                </span>
                              ) : null}
                              {mostRecentShortlist ? (
                                <span className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1">
                                  Most recent: {mostRecentShortlist.title}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                      {naturalResults.map((paper, index) => {
                        const reasons = getSearchReasons(paper, inputValue, index);
                        const isShortlisted = shortlistedPaperIds.includes(paper.paper_id);
                        return (
                          <div
                            key={paper.paper_id}
                            className="text-left rounded-xl p-4 bg-neutral-950 border border-neutral-800 hover:border-[#D4AF37]/40 transition-all group"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(212,175,55,0.18)] bg-[rgba(212,175,55,0.05)] px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#D4AF37]/75">
                                  <Sparkles className="w-3 h-3" />
                                  {getSeedFitLabel(paper, index)}
                                </div>
                                <h3 className="mt-2 text-sm font-medium text-white group-hover:text-[#D4AF37] transition-colors leading-snug">
                                  {paper.title}
                                </h3>
                              </div>
                              <div className="text-right text-[10px] font-mono text-neutral-500">
                                {paper.year || 'n.d.'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-neutral-600 font-mono">
                              <span>{formatAuthors(paper)}</span>
                              {paper.citation_count > 0 && <span>&middot; {paper.citation_count} cit.</span>}
                            </div>
                            {paper.venue && (
                              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-neutral-500">
                                <BookOpen className="w-3 h-3" />
                                {paper.venue}
                              </div>
                            )}
                            {paper.abstract_snippet && (
                              <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-neutral-400">
                                {paper.abstract_snippet}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              {paper.fields.slice(0, 2).map((field) => (
                                <span
                                  key={`${paper.paper_id}-${field}`}
                                  className="rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-0.5 text-[9px] font-mono text-neutral-400"
                                >
                                  {field}
                                </span>
                              ))}
                              {reasons.map((reason) => (
                                <span
                                  key={`${paper.paper_id}-${reason}`}
                                  className="rounded-full border border-[rgba(212,175,55,0.16)] bg-[rgba(212,175,55,0.05)] px-2 py-0.5 text-[9px] font-mono text-[#D4AF37]/75"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                            <div className="mt-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]/75">
                              <Clock3 className="w-3 h-3" />
                              Pick, compare, then seed the workspace
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => toggleShortlist(paper.paper_id)}
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                                  isShortlisted
                                    ? 'border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.08)] text-[#D4AF37]'
                                    : 'border border-[rgba(255,255,255,0.08)] text-neutral-400 hover:border-neutral-600 hover:text-white'
                                }`}
                              >
                                {isShortlisted ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {isShortlisted ? 'Shortlisted' : 'Add to shortlist'}
                              </button>
                              <button
                                onClick={() => startSeedWorkspace(paper.paper_id)}
                                className="inline-flex items-center gap-2 rounded-full border border-[rgba(212,175,55,0.22)] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] transition-colors hover:bg-[rgba(212,175,55,0.08)]"
                              >
                                <ArrowRight className="w-3 h-3" />
                                Use as seed
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                  {naturalResults && naturalResults.length === 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-center text-sm text-neutral-600 font-mono py-6">
                      No papers found.
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Divider */}
        <div className="max-w-7xl mx-auto px-8 md:px-16">
          <div className="h-px bg-neutral-900" />
        </div>

        {/* How It Works */}
        <motion.section
          className="max-w-7xl mx-auto px-8 md:px-16 py-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start mb-16">
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight">
              How It<br />Works.
            </h2>
            <p className="text-neutral-500 text-sm leading-relaxed max-w-md pt-3">
              Three dimensions of academic knowledge, each revealing a different
              layer of the research landscape.
            </p>
          </div>

          <div className="space-y-0">
            {[
              {
                num: '01',
                title: 'Citation Mapping',
                desc: 'References and co-citations reveal the intellectual lineage of every idea. See how papers build upon each other across disciplines.',
                stat: '16M+ pairs',
              },
              {
                num: '02',
                title: 'Semantic Clustering',
                desc: 'SPECTER2 embeddings place papers by meaning, not keywords. Related research naturally groups into visible clusters.',
                stat: 'HDBSCAN',
              },
              {
                num: '03',
                title: 'Temporal Depth',
                desc: 'Publication year maps to the Z-axis. Navigate through time, from foundational works to cutting-edge discoveries.',
                stat: 'Z-axis',
              },
            ].map((item, i) => (
              <motion.div
                key={item.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="flex items-start gap-8 py-8 border-t border-neutral-900 group"
              >
                <span className="font-mono text-[11px] text-neutral-700 pt-1 w-8 flex-shrink-0">{item.num}</span>
                <div className="flex-1 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-serif text-white group-hover:text-[#D4AF37] transition-colors mb-2">
                      {item.title}
                    </h3>
                    <p className="text-neutral-500 text-sm leading-relaxed max-w-md">{item.desc}</p>
                  </div>
                  <span className="font-mono text-xs text-neutral-600 flex-shrink-0 pt-1">{item.stat}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="max-w-7xl mx-auto px-8 md:px-16 py-10 border-t border-neutral-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-serif text-lg text-white">ScholarGraph3D</span>
              <span className="text-[10px] font-mono text-neutral-700">&copy; 2025</span>
            </div>
            <div className="flex items-center gap-6 text-[10px] font-mono text-neutral-600">
              <a href={user ? '/dashboard' : '/auth'} className="hover:text-white transition-colors uppercase tracking-wider">
                {user ? 'Account' : 'Sign In'}
              </a>
              <a href="/dashboard" className="hover:text-white transition-colors uppercase tracking-wider">
                Dashboard
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
