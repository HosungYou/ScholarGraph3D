'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const OA_FIELDS = [
  'Physical Sciences',
  'Life Sciences',
  'Social Sciences',
  'Health Sciences',
  'Engineering',
  'Arts & Humanities',
];

export default function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [yearMin, setYearMin] = useState(searchParams.get('year_min') || '');
  const [yearMax, setYearMax] = useState(searchParams.get('year_max') || '');
  const [field, setField] = useState(searchParams.get('field') || '');
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const params = new URLSearchParams();
    params.set('q', query.trim());
    if (yearMin) params.set('year_min', yearMin);
    if (yearMax) params.set('year_max', yearMax);
    if (field) params.set('field', field);

    router.push(`/explore?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
      <div className="flex-1 relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-text-secondary pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search papers..."
          className="w-full bg-surface/50 border border-border/30 rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none focus:border-accent/50 transition-colors"
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
        disabled={!query.trim()}
        className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Search
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
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
