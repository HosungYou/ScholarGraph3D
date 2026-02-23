'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, GitBranch, Layers, Clock, Crosshair, Radar, Orbit, ScanSearch } from 'lucide-react';
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

// --- Mission stat counter animation ---
function AnimatedCounter({ target, suffix = '' }: { target: string; suffix?: string }) {
  return (
    <span className="hud-value text-cosmic-glow tabular-nums">
      {target}{suffix}
    </span>
  );
}

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
      setDoiError(`Target not found: ${msg}`);
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

    try {
      const data = await api.searchPapers(query.trim());
      setNaturalResults(data.papers || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDoiError(`Scan failed: ${msg}`);
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
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-black">
      {/* Deep Field Background */}
      <StarfieldBackground ref={starfieldRef} />

      {/* Subtle vignette overlay */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      <div className={`relative z-10 w-full max-w-3xl px-6 ${isWarping ? 'animate-warp' : ''}`}>

        {/* === MISSION BRIEFING HEADER === */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-10"
        >
          {/* Mission status badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded border border-cosmic-glow/15 bg-cosmic-glow/[0.03] mb-6">
            <span className="hud-status animate-cosmic-pulse" />
            <span className="hud-label text-cosmic-glow/80 text-[10px]">
              Navigate the topology of knowledge
            </span>
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-5 leading-[1.1]">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] via-[#6c5ce7] to-[#a29bfe] cosmic-glow">
              ScholarGraph3D
            </span>
          </h1>

          {/* Mission description */}
          <p className="text-base text-text-secondary/70 max-w-lg mx-auto leading-relaxed font-light">
            Enter a paper{"'"}s coordinates. Map its citation universe in 3D — semantically, temporally, relationally.
          </p>
        </motion.div>

        {/* === COORDINATE INPUT CONSOLE === */}
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
              {/* Instrument readouts */}
              <div className="flex items-center justify-center gap-5 mb-4">
                {[
                  { icon: GitBranch, label: 'Gravitational mapping', color: '#4A90D9' },
                  { icon: Layers, label: 'Nebula classification', color: '#9B59B6' },
                  { icon: Clock, label: 'Temporal archaeology', color: '#2ECC71' },
                ].map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-text-muted/60">
                    <item.icon className="w-3 h-3" style={{ color: item.color, opacity: 0.5 }} />
                    {item.label}
                  </span>
                ))}
              </div>

              {/* Input console */}
              <form onSubmit={handleSubmit}>
                <div className="relative group">
                  {/* Glow on focus */}
                  <div className="absolute -inset-px bg-gradient-to-r from-cosmic-glow/20 via-cosmic-nebula/15 to-cosmic-glow/20 rounded-lg blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />

                  <div className="relative flex items-center bg-[rgba(4,8,18,0.9)] rounded-lg overflow-hidden border border-[rgba(0,229,255,0.12)] group-focus-within:border-[rgba(0,229,255,0.3)] transition-colors">
                    {/* Input prefix */}
                    <div className="flex items-center gap-2 pl-4 pr-2 text-cosmic-glow/30 flex-shrink-0">
                      <Crosshair className="w-4 h-4" />
                      <span className="text-[10px] font-mono uppercase tracking-wider hidden sm:inline">TARGET</span>
                    </div>
                    <div className="w-px h-6 bg-[rgba(0,229,255,0.1)] flex-shrink-0" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        setDoiError(null);
                      }}
                      placeholder="DOI, URL, or arXiv link…  e.g. 10.1038/s41586-021-03819-2"
                      className="flex-1 bg-transparent px-4 py-4 text-sm text-text-primary placeholder:text-text-muted/40 outline-none font-mono"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoadingDoi || isWarping}
                      className="px-6 py-4 hud-button text-xs uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 rounded-none border-0 border-l border-l-[rgba(0,229,255,0.12)]"
                    >
                      {isLoadingDoi ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-cosmic-glow/30 border-t-cosmic-glow rounded-full animate-spin" />
                          <span>Locating</span>
                        </>
                      ) : (
                        <>
                          <Radar className="w-3.5 h-3.5" />
                          <span>Initiate scan</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Status line */}
                <div className="flex items-center justify-between mt-2 px-1">
                  <p className="text-[10px] text-text-muted/50 font-mono">
                    Input target coordinates &rarr; map full citation universe
                  </p>
                  {doiError && (
                    <p className="text-[10px] text-accent-red/70 font-mono">{doiError}</p>
                  )}
                </div>
              </form>

              {/* Known targets */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted/30">Known targets:</span>
                {EXAMPLE_SEEDS.map((s) => (
                  <button
                    key={s.doi}
                    onClick={() => handleDOILookup(s.doi)}
                    className="group/chip flex items-center gap-1.5 px-3 py-1.5 rounded border border-[rgba(0,229,255,0.06)] hover:border-[rgba(0,229,255,0.2)] bg-[rgba(0,229,255,0.02)] hover:bg-[rgba(0,229,255,0.05)] text-xs transition-all"
                  >
                    <span className="text-text-secondary/70 group-hover/chip:text-cosmic-glow transition-colors font-mono text-[11px]">{s.label}</span>
                    <span className="text-text-muted/30 text-[9px] font-mono">{s.field}</span>
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
                  <div className="absolute -inset-px bg-gradient-to-r from-cosmic-nebula/15 to-cosmic-glow/15 rounded-lg blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
                  <div className="relative flex items-center bg-[rgba(4,8,18,0.9)] rounded-lg overflow-hidden border border-[rgba(0,229,255,0.12)] group-focus-within:border-[rgba(0,229,255,0.3)] transition-colors">
                    <div className="flex items-center gap-2 pl-4 pr-2 text-cosmic-nebula/30 flex-shrink-0">
                      <ScanSearch className="w-4 h-4" />
                      <span className="text-[10px] font-mono uppercase tracking-wider hidden sm:inline">SCAN</span>
                    </div>
                    <div className="w-px h-6 bg-[rgba(0,229,255,0.1)] flex-shrink-0" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        setNaturalResults(null);
                        setDoiError(null);
                      }}
                      placeholder="Describe your research topic or question..."
                      className="flex-1 bg-transparent px-4 py-4 text-sm text-text-primary placeholder:text-text-muted/40 outline-none font-mono"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoadingNatural}
                      className="px-6 py-4 hud-button text-xs uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 rounded-none border-0 border-l border-l-[rgba(0,229,255,0.12)]"
                    >
                      {isLoadingNatural ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-cosmic-glow/30 border-t-cosmic-glow rounded-full animate-spin" />
                          <span>Scanning</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-3.5 h-3.5" />
                          <span>Deep scan</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted/50 font-mono mt-2 px-1">
                  Broad spectrum scan &rarr; select target &rarr; map citation universe
                </p>
                {doiError && (
                  <p className="text-[10px] text-accent-red/70 font-mono mt-1 px-1">{doiError}</p>
                )}
              </form>

              {/* Scan presets */}
              {!naturalResults && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted/30">Presets:</span>
                  {EXAMPLE_QUERIES.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => {
                        setInputValue(ex.label);
                        handleNaturalSearch(ex.label);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[rgba(0,229,255,0.06)] hover:border-[rgba(0,229,255,0.2)] bg-[rgba(0,229,255,0.02)] hover:bg-[rgba(0,229,255,0.05)] text-xs transition-all font-mono"
                    >
                      <span className="text-text-secondary/60">{ex.label}</span>
                      <span className="text-text-muted/30 text-[9px]">{ex.field}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Paper results */}
              <AnimatePresence>
                {naturalResults && naturalResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 flex flex-col gap-1.5 max-h-[400px] overflow-y-auto"
                  >
                    <p className="text-[10px] text-text-muted/50 px-1 font-mono uppercase tracking-wider mb-1">
                      {naturalResults.length} targets detected — select to explore:
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
                        className="text-left rounded-lg p-4 bg-[rgba(4,8,18,0.8)] border border-[rgba(0,229,255,0.06)] hover:border-[rgba(0,229,255,0.2)] transition-all group"
                      >
                        <h3 className="text-sm font-medium text-text-primary group-hover:text-cosmic-glow transition-colors leading-snug">
                          {paper.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-text-muted/50 font-mono">
                          {paper.authors?.slice(0, 3).map((a: any) => a.name || a).join(', ')}
                          {paper.authors?.length > 3 && ' et al.'}
                          {paper.year && <span>&middot; {paper.year}</span>}
                          {paper.citation_count > 0 && (
                            <span>&middot; {paper.citation_count} citations</span>
                          )}
                        </div>
                        {paper.abstract_snippet && (
                          <p className="text-[11px] text-text-muted/40 mt-1.5 line-clamp-2">
                            {paper.abstract_snippet}
                          </p>
                        )}
                        {paper.fields?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {paper.fields.slice(0, 3).map((f: string) => (
                              <span key={f} className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded bg-cosmic-glow/5 text-cosmic-glow/50 border border-cosmic-glow/10">
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
                    className="mt-4 text-center text-[11px] text-text-muted/40 font-mono py-8"
                  >
                    No targets detected. Adjust scan parameters.
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* === MODE SWITCH === */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-1 mb-10"
        >
          {([
            { mode: 'doi' as InputMode, icon: Crosshair, label: 'Seed Paper' },
            { mode: 'natural' as InputMode, icon: ScanSearch, label: 'Find Papers' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => switchMode(mode)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-mono uppercase tracking-widest transition-all border ${
                activeMode === mode
                  ? 'bg-cosmic-glow/[0.06] border-cosmic-glow/20 text-cosmic-glow'
                  : 'bg-transparent border-transparent text-text-muted/40 hover:text-text-secondary/60 hover:border-[rgba(0,229,255,0.08)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </motion.div>

        {/* === MISSION BRIEFING PANELS === */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="grid grid-cols-3 gap-3 mb-12"
        >
          {[
            {
              icon: Orbit,
              color: '#4A90D9',
              title: 'Gravitational Mapping',
              code: 'GRAV-MAP',
              desc: 'Citation links form gravitational bonds. References and co-citations reveal the intellectual lineage of every idea.',
              stat: '16M+',
              statLabel: 'citation pairs indexed',
            },
            {
              icon: Layers,
              color: '#9B59B6',
              title: 'Nebula Classification',
              code: 'NEB-CLASS',
              desc: 'SPECTER2 embeddings cluster papers by semantic meaning — forming nebulae of related knowledge.',
              stat: 'HDBSCAN',
              statLabel: 'density clustering',
            },
            {
              icon: Clock,
              color: '#2ECC71',
              title: 'Temporal Archaeology',
              code: 'TEMP-ARCH',
              desc: 'Publication year maps to the Z-axis. Excavate knowledge layers from recent discoveries to foundational works.',
              stat: 'Z-axis',
              statLabel: 'time depth mapping',
            },
          ].map((f) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -2, borderColor: 'rgba(0,229,255,0.2)' }}
              className="hud-panel rounded-lg p-4 transition-all cursor-default group"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between mb-3">
                <f.icon className="w-4 h-4" style={{ color: f.color, opacity: 0.7 }} />
                <span className="text-[8px] font-mono tracking-widest text-text-muted/30">{f.code}</span>
              </div>

              {/* Title */}
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider mb-2 text-text-primary/90">
                {f.title}
              </h3>

              {/* Description */}
              <p className="text-[11px] text-text-muted/50 leading-relaxed mb-3">
                {f.desc}
              </p>

              {/* Stat readout */}
              <div className="pt-2 border-t border-[rgba(0,229,255,0.06)]">
                <div className="hud-label text-[8px] text-text-muted/30 mb-0.5">{f.statLabel}</div>
                <div className="text-xs font-mono font-bold" style={{ color: f.color, opacity: 0.8 }}>{f.stat}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* === FOOTER === */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-text-muted/25">
            <a href={user ? '/dashboard' : '/auth'} className="hover:text-cosmic-glow/50 transition-colors uppercase tracking-wider">
              {user ? 'My Account' : 'Sign In'}
            </a>
            <span className="w-px h-3 bg-text-muted/10" />
            <a href="/dashboard" className="hover:text-cosmic-glow/50 transition-colors uppercase tracking-wider">
              Dashboard
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
