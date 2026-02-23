'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, GitBranch, Layers, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import dynamic from 'next/dynamic';
import type { StarfieldBackgroundRef } from '@/components/cosmic/StarfieldBackground';

const StarfieldBackground = dynamic(
  () => import('@/components/cosmic/StarfieldBackground'),
  { ssr: false }
);

type InputMode = 'doi' | 'natural';

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
  const [isLoadingDoi, setIsLoadingDoi] = useState(false);
  const [doiError, setDoiError] = useState<string | null>(null);
  const [isLoadingNatural, setIsLoadingNatural] = useState(false);
  const [naturalResults, setNaturalResults] = useState<any[] | null>(null);
  const router = useRouter();

  const starfieldRef = useRef<StarfieldBackgroundRef>(null);
  const [isWarping, setIsWarping] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    if (user && window.location.hash.includes('access_token')) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleDOILookup = async (doi: string) => {
    if (!doi.trim()) return;
    setIsLoadingDoi(true);
    setDoiError(null);

    try {
      const data = await api.getPaperByDOI(doi.trim());
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

  const handleNaturalSearch = async (query: string) => {
    if (!query.trim()) return;

    // Auto-detect DOIs in natural mode
    if (looksLikeDoi(query)) {
      setActiveMode('doi');
      setInputValue(query.trim());
      handleDOILookup(query.trim());
      return;
    }

    setIsLoadingNatural(true);
    setNaturalResults(null);

    try {
      const data = await api.searchPapers(query.trim());
      setNaturalResults(data.papers || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDoiError(`Search failed: ${msg}`);
    } finally {
      setIsLoadingNatural(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDoiError(null);
    if (isWarping) return;

    if (activeMode === 'doi') {
      handleDOILookup(inputValue);
    } else if (activeMode === 'natural') {
      handleNaturalSearch(inputValue);
    }
  };

  const switchMode = (mode: InputMode) => {
    setActiveMode(mode);
    setInputValue('');
    setNaturalResults(null);
    setDoiError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background */}
      <StarfieldBackground ref={starfieldRef} />

      <div className={`relative z-10 w-full max-w-3xl px-6 ${isWarping ? 'animate-warp' : ''}`}>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cosmic-glow/5 border border-cosmic-glow/20 text-xs text-cosmic-glow/80 mb-5 font-mono uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-cosmic-glow animate-cosmic-pulse" />
            Navigate the topology of knowledge
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4 leading-tight cosmic-glow">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cosmic-glow via-cosmic-nebula to-accent-green">
              ScholarGraph3D
            </span>
          </h1>
          <p className="text-lg text-text-secondary/80 max-w-xl mx-auto leading-relaxed">
            Academic papers mapped in 3D space — semantically, temporally, relationally.
            Start from a paper you know. Let the knowledge topology guide the rest.
          </p>
        </motion.div>

        {/* Input Modes */}
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
                  <div className="relative flex items-center hud-panel rounded-2xl overflow-hidden border border-accent/20">
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
                      className="px-8 py-5 hud-button uppercase font-mono tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoadingDoi && (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {isLoadingDoi ? 'Finding...' : 'EXPLORE'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <p className="text-xs text-text-secondary/40">
                    Enter a paper{"'"}s DOI or URL &rarr; explore its full citation universe in 3D
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/60 hover:bg-surface border border-cosmic-glow/10 hover:border-cosmic-glow/30 text-xs text-text-secondary hover:text-cosmic-glow transition-all"
                  >
                    <span>{s.label}</span>
                    <span className="text-text-secondary/30">{s.field}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {activeMode === 'natural' && (
            <motion.div
              key="natural"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mb-5"
            >
              <form onSubmit={handleSubmit}>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/20 to-accent-purple/20 rounded-2xl blur opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-center hud-panel rounded-2xl overflow-hidden">
                    <Search className="w-5 h-5 text-text-secondary ml-5 flex-shrink-0" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        setNaturalResults(null);
                        setDoiError(null);
                      }}
                      placeholder="Describe your research topic or question..."
                      className="flex-1 bg-transparent px-4 py-5 text-base text-text-primary placeholder:text-text-secondary/40 outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoadingNatural}
                      className="px-8 py-5 hud-button uppercase font-mono tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoadingNatural && (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {isLoadingNatural ? 'Searching...' : 'FIND PAPERS'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-secondary/40 mt-2 px-1">
                  Search by topic, question, or keywords &rarr; select a paper &rarr; explore its citation universe
                </p>
                {doiError && (
                  <p className="text-xs text-red-400/80 mt-1 px-1">{doiError}</p>
                )}
              </form>

              {/* Quick examples */}
              {!naturalResults && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {EXAMPLE_QUERIES.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => {
                        setInputValue(ex.label);
                        handleNaturalSearch(ex.label);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/60 hover:bg-surface border border-cosmic-glow/10 hover:border-cosmic-glow/30 text-xs text-text-secondary hover:text-cosmic-glow transition-all"
                    >
                      {ex.label}
                      <span className="ml-0.5 text-text-secondary/30">{ex.field}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Paper Selection Cards */}
              <AnimatePresence>
                {naturalResults && naturalResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 flex flex-col gap-2 max-h-[400px] overflow-y-auto"
                  >
                    <p className="text-xs text-text-secondary/50 px-1">
                      Select a seed paper to explore:
                    </p>
                    {naturalResults.map((paper: any) => (
                      <button
                        key={paper.paper_id}
                        onClick={() => {
                          setIsWarping(true);
                          starfieldRef.current?.triggerWarp();
                          setTimeout(() => {
                            router.push(`/explore/seed?paper_id=${encodeURIComponent(paper.paper_id)}`);
                          }, 600);
                        }}
                        className="text-left hud-panel rounded-xl p-4 hover:border-cosmic-glow/30 transition-all group"
                      >
                        <h3 className="text-sm font-medium text-text-primary group-hover:text-cosmic-glow transition-colors leading-snug">
                          {paper.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-secondary/50">
                          {paper.authors?.slice(0, 3).map((a: any) => a.name || a).join(', ')}
                          {paper.authors?.length > 3 && ' et al.'}
                          {paper.year && <span>&middot; {paper.year}</span>}
                          {paper.citation_count > 0 && (
                            <span>&middot; {paper.citation_count} citations</span>
                          )}
                        </div>
                        {paper.abstract_snippet && (
                          <p className="text-xs text-text-secondary/40 mt-1 line-clamp-2">
                            {paper.abstract_snippet}
                          </p>
                        )}
                        {paper.fields?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {paper.fields.slice(0, 3).map((f: string) => (
                              <span key={f} className="px-1.5 py-0.5 text-[10px] rounded bg-accent/10 text-accent/70">
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
                {naturalResults && naturalResults.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 text-center text-sm text-text-secondary/50 py-6"
                  >
                    No papers found. Try a different query.
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode switcher */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-1 mb-8"
        >
          {([
            { mode: 'doi' as InputMode, icon: FileText, label: 'Seed Paper' },
            { mode: 'natural' as InputMode, icon: Search, label: 'Find Papers' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => switchMode(mode)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activeMode === mode
                  ? 'bg-cosmic-glow/10 border-cosmic-glow/30 text-cosmic-glow font-mono'
                  : 'bg-transparent border-transparent text-text-secondary/50 hover:text-text-secondary hover:border-cosmic-glow/10 font-mono'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </motion.div>

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
              className="hud-panel rounded-xl p-4 hover:border-cosmic-glow/30 transition-colors"
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
          <span className="mx-3">&middot;</span>
          <a href="/dashboard" className="hover:text-accent transition-colors">
            Dashboard
          </a>
        </motion.div>
      </div>
    </div>
  );
}
