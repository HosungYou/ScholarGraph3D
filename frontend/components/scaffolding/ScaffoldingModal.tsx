'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ScaffoldAngle {
  label: string;
  query: string;
  type: 'broad' | 'narrow' | 'method' | 'theory' | 'population';
}

interface ScaffoldingModalProps {
  question: string;
  angles: ScaffoldAngle[];
  onClose: () => void;
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
  broad: 'Get the full landscape — survey papers, reviews, key themes',
  narrow: 'Deep dive — specific studies on exactly this question',
  method: 'How researchers study this — RCT, surveys, meta-analysis',
  theory: 'Theoretical foundations — frameworks and models used',
  population: 'Context-specific — particular settings or demographics',
};

export default function ScaffoldingModal({ question, angles, onClose }: ScaffoldingModalProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const router = useRouter();

  const handleToggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const handleExplore = () => {
    const selectedAngles = angles.filter((_, i) => selected.has(i));
    if (selectedAngles.length === 0) return;
    // For multiple selections, use the first selected query (future: merge)
    const query = selectedAngles.map((a) => a.query).join(' OR ');
    onClose();
    router.push(`/explore?q=${encodeURIComponent(query)}`);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="glass-strong rounded-2xl border border-border/40 w-full max-w-xl shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-border/30">
            <div>
              <h2 className="text-base font-semibold text-text-primary mb-1">
                🤔 Research Angles
              </h2>
              <p className="text-sm text-text-secondary/70 line-clamp-2">{question}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-secondary/50 hover:text-text-secondary hover:bg-surface transition-all ml-4 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Angles */}
          <div className="p-5 space-y-2">
            <p className="text-xs text-text-secondary/50 mb-3">
              Select one or more exploration angles:
            </p>
            {angles.map((angle, i) => (
              <button
                key={i}
                onClick={() => handleToggle(i)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all border ${
                  selected.has(i)
                    ? 'bg-accent/10 border-accent/40 text-text-primary'
                    : 'bg-surface/60 border-border/30 text-text-secondary hover:border-border/50 hover:text-text-primary'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border mt-0.5 flex-shrink-0 flex items-center justify-center transition-all ${
                    selected.has(i) ? 'bg-accent border-accent' : 'border-border/50'
                  }`}
                >
                  {selected.has(i) && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-0.5">{angle.label}</div>
                  <div className="text-xs text-text-secondary/60">
                    {TYPE_DESCRIPTIONS[angle.type] || angle.type}
                  </div>
                  <div className="text-xs font-mono text-text-secondary/40 mt-1 truncate">
                    → {angle.query}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-border/30">
            <button
              onClick={onClose}
              className="text-sm text-text-secondary/50 hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onClose();
                  // Let user type their own query
                }}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border/30 rounded-lg transition-all"
              >
                Type my own
              </button>
              <button
                onClick={handleExplore}
                disabled={selected.size === 0}
                className="px-5 py-2 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Explore {selected.size > 1 ? `${selected.size} angles` : 'selected'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
