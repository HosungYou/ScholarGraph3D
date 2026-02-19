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
      <div className="flex-shrink-0 flex items-center bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/30">
        <button
          type="button"
          onClick={() => setAiMode(false)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
            !aiMode
              ? 'bg-gray-700 text-gray-100 shadow-sm'
              : 'text-gray-500 hover:text-gray-300'
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
              ? 'bg-purple-700/80 text-purple-100 shadow-sm'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          title={!llmSettings || llmSettings.provider !== 'groq' ? 'Set Groq API key in LLM Settings for AI Search' : 'AI Search mode'}
        >
          <Sparkles className="w-3 h-3" />
          AI Search
        </button>
      </div>

      <div className="flex-1 relative flex items-center">
        {aiMode ? (
          <Sparkles className="absolute left-3 w-4 h-4 text-purple-400 pointer-events-none" />
        ) : (
          <Search className="absolute left-3 w-4 h-4 text-text-secondary pointer-events-none" />
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
          className={`w-full bg-surface/50 border rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors ${
            aiMode
              ? 'border-purple-700/40 focus:border-purple-500/50'
              : 'border-border/30 focus:border-accent/50'
          }`}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors border ${
          showFilters
            ? 'bg-accent/10 border-accent/30 text-accent'
            : 'bg-surface/50 border-border/30 text-text-secondary hover:text-text-primary'
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
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white ${
          aiMode
            ? 'bg-purple-600 hover:bg-purple-700'
            : 'bg-accent hover:bg-accent/90'
        }`}
      >
        {isAiSearching ? 'Searching...' : aiMode ? '✨ Search' : 'Search'}
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
                <label className="text-xs text-text-secondary whitespace-nowrap">
                  Year Range
                </label>
                <input
                  type="number"
                  value={yearMin}
                  onChange={(e) => setYearMin(e.target.value)}
                  placeholder="From"
                  min="1900"
                  max="2026"
                  className="w-20 bg-surface border border-border/30 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent/50"
                />
                <span className="text-text-secondary/40">-</span>
                <input
                  type="number"
                  value={yearMax}
                  onChange={(e) => setYearMax(e.target.value)}
                  placeholder="To"
                  min="1900"
                  max="2026"
                  className="w-20 bg-surface border border-border/30 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent/50"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-text-secondary whitespace-nowrap">
                  Field
                </label>
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="bg-surface border border-border/30 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent/50"
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
                  className="text-xs text-accent hover:text-accent/80 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            {aiMode && (!llmSettings || llmSettings.provider !== 'groq') && (
              <p className="text-xs text-purple-400/70 mt-2">
                💡 Set a Groq API key in LLM Settings to enable AI-powered query expansion
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
