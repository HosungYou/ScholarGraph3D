'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, ChevronDown, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGraphStore } from '@/hooks/useGraphStore';

const OA_FIELDS = [
  'Physical Sciences',
  'Life Sciences',
  'Social Sciences',
  'Health Sciences',
  'Engineering',
  'Arts & Humanities',
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { llmSettings } = useGraphStore();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [yearMin, setYearMin] = useState(searchParams.get('year_min') || '');
  const [yearMax, setYearMax] = useState(searchParams.get('year_max') || '');
  const [field, setField] = useState(searchParams.get('field') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [isAiSearching, setIsAiSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // AI mode: call natural language search backend
    if (aiMode) {
      const groqKey = llmSettings?.provider === 'groq' ? llmSettings.api_key : null;

      if (groqKey) {
        // Use AI natural language search
        setIsAiSearching(true);
        try {
          const resp = await fetch(`${API_BASE}/api/search/natural`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: query.trim(),
              groq_api_key: groqKey,
              limit: 200,
            }),
          });
          if (resp.ok) {
            // Navigate to explore with the query
            const params = new URLSearchParams();
            params.set('q', query.trim());
            if (yearMin) params.set('year_min', yearMin);
            if (yearMax) params.set('year_max', yearMax);
            if (field) params.set('field', field);
            router.push(`/explore?${params.toString()}`);
            return;
          }
        } catch (err) {
          console.error('AI search failed, falling back to keyword search:', err);
        } finally {
          setIsAiSearching(false);
        }
      }
      // Fallback: use regular search with natural language query
    }

    // Regular keyword search
    const params = new URLSearchParams();
    params.set('q', query.trim());
    if (yearMin) params.set('year_min', yearMin);
    if (yearMax) params.set('year_max', yearMax);
    if (field) params.set('field', field);

    router.push(`/explore?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
      {/* Mode toggle */}
      <div className="flex-shrink-0 flex items-center bg-[#0a0f1e]/50 rounded-lg p-0.5 border border-[#1a2555]/30">
        <button
          type="button"
          onClick={() => setAiMode(false)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
            !aiMode
              ? 'bg-[#1a2555] text-[#E8EAF6] shadow-sm'
              : 'text-[#7B8CDE]/50 hover:text-[#7B8CDE]'
          }`}
        >
          <Search className="w-3 h-3" />
          Keyword
        </button>
        <button
          type="button"
          onClick={() => setAiMode(true)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
            aiMode
              ? 'bg-[#6c5ce7]/80 text-[#a29bfe] shadow-sm'
              : 'text-[#7B8CDE]/50 hover:text-[#7B8CDE]'
          }`}
          title={!llmSettings || llmSettings.provider !== 'groq' ? 'Set Groq API key in LLM Settings for AI Search' : 'AI Search mode'}
        >
          <Sparkles className="w-3 h-3" />
          AI Search
        </button>
      </div>

      <div className="flex-1 relative flex items-center hud-scanline">
        <span className="absolute top-0 left-0 right-0 text-[9px] font-mono text-[#00E5FF]/30 uppercase tracking-widest pointer-events-none px-2 leading-none" style={{ marginTop: '-10px' }}>
          NAVIGATION CONSOLE
        </span>
        {aiMode ? (
          <Sparkles className="absolute left-3 w-4 h-4 text-[#a29bfe] pointer-events-none" />
        ) : (
          <Search className="absolute left-3 w-4 h-4 text-[#7B8CDE] pointer-events-none" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            aiMode
              ? 'Describe what you\'re looking for... e.g. "How is AI adopted in healthcare since 2020?"'
              : 'Search papers...'
          }
          className={`w-full bg-transparent border rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-[#7B8CDE]/60 outline-none transition-colors ${
            aiMode
              ? 'border-[#6c5ce7]/40 focus:border-[#a29bfe]/50'
              : 'border-[#1a2555]/30 focus:border-[#00E5FF]/40'
          }`}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors border ${
          showFilters
            ? 'bg-[#00E5FF]/10 border-[#00E5FF]/30 text-[#00E5FF]'
            : 'bg-[#0a0f1e]/50 border-[#1a2555]/30 text-[#7B8CDE] hover:text-text-primary'
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        Filters
        <ChevronDown
          className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`}
        />
      </button>

      <button
        type="submit"
        disabled={!query.trim() || isAiSearching}
        className={`hud-button uppercase font-mono tracking-wider text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
          aiMode
            ? 'bg-[#6c5ce7]/15 border-[#a29bfe]/30 text-[#a29bfe] hover:bg-[#6c5ce7]/25'
            : ''
        }`}
      >
        {isAiSearching ? 'SCANNING...' : aiMode ? '✨ SCAN' : 'SCAN'}
      </button>

      {/* Filter dropdown */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-2 glass-strong rounded-lg p-4 z-30"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#7B8CDE] whitespace-nowrap font-mono">
                  Year Range
                </label>
                <input
                  type="number"
                  value={yearMin}
                  onChange={(e) => setYearMin(e.target.value)}
                  placeholder="From"
                  min="1900"
                  max="2026"
                  className="w-20 bg-[#0a0f1e] border border-[#1a2555]/30 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-[#00E5FF]/40"
                />
                <span className="text-[#7B8CDE]/40">-</span>
                <input
                  type="number"
                  value={yearMax}
                  onChange={(e) => setYearMax(e.target.value)}
                  placeholder="To"
                  min="1900"
                  max="2026"
                  className="w-20 bg-[#0a0f1e] border border-[#1a2555]/30 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-[#00E5FF]/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#7B8CDE] whitespace-nowrap font-mono">
                  Field
                </label>
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="bg-[#0a0f1e] border border-[#1a2555]/30 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-[#00E5FF]/40"
                >
                  <option value="">All Fields</option>
                  {OA_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {(yearMin || yearMax || field) && (
                <button
                  type="button"
                  onClick={() => {
                    setYearMin('');
                    setYearMax('');
                    setField('');
                  }}
                  className="text-xs text-[#00E5FF] hover:text-[#00E5FF]/80 transition-colors font-mono"
                >
                  Clear
                </button>
              )}
            </div>
            {aiMode && (!llmSettings || llmSettings.provider !== 'groq') && (
              <p className="text-xs text-[#a29bfe]/70 mt-2 font-mono">
                Set a Groq API key in LLM Settings to enable AI-powered query expansion
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
