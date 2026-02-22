'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useGraphStore } from '@/hooks/useGraphStore';

interface CitationContextModalProps {
  sourceId: string;
  targetId: string;
  type: string;
  intent?: string;
  weight?: number;
  onClose: () => void;
  onViewSourcePaper?: (id: string) => void;
  onViewTargetPaper?: (id: string) => void;
}

export default function CitationContextModal({
  sourceId,
  targetId,
  type,
  intent,
  weight,
  onClose,
  onViewSourcePaper,
  onViewTargetPaper,
}: CitationContextModalProps) {
  const { graphData, citationIntents } = useGraphStore();

  const sourceNode = graphData?.nodes.find((n) => n.id === sourceId);
  const targetNode = graphData?.nodes.find((n) => n.id === targetId);

  // Look up citation context from citationIntents store
  const ci = citationIntents.find(
    (c) =>
      (c.citing_id === sourceId && c.cited_id === targetId) ||
      (c.citing_id === targetId && c.cited_id === sourceId)
  );

  const intentLabel = intent || ci?.enhanced_intent || ci?.basic_intent;
  const intentContext = ci?.context;

  const intentColorClass =
    intentLabel === 'contradicts' ? 'text-red-400' :
    intentLabel === 'supports' ? 'text-green-400' :
    intentLabel === 'extends' ? 'text-cosmic-glow' :
    intentLabel === 'applies' ? 'text-cosmic-nebula' :
    intentLabel === 'methodology' ? 'text-cosmic-nebula' :
    intentLabel === 'result_comparison' ? 'text-cosmic-glow' :
    intentLabel === 'background' ? 'text-[#7B8CDE]' :
    'text-[#7B8CDE]';

  const sourceTitle = sourceNode?.title ?? sourceId;
  const targetTitle = targetNode?.title ?? targetId;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-[#050510]/80"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="hud-panel hud-scanline w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2555]">
            <h3 className="text-sm font-mono uppercase tracking-wider text-[#E8EAF6]">Citation Context</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[#111833] text-[#7B8CDE] hover:text-cosmic-glow transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-3">
            {/* Papers */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => onViewSourcePaper?.(sourceId)}
                className="flex-1 text-left bg-[#0a0f1e] border border-[#1a2555] hover:border-cosmic-glow/20 rounded-lg p-3 transition-colors"
              >
                <div className="text-xs font-mono text-[#7B8CDE]/50 mb-0.5 uppercase tracking-wider">Citing paper</div>
                <div className="text-sm text-[#E8EAF6]/90 line-clamp-2">{sourceTitle}</div>
              </button>
              <div className="flex-shrink-0 text-center">
                <div className={`text-sm font-mono font-semibold ${intentColorClass} capitalize`}>
                  {intentLabel ? `→ ${intentLabel.replace(/_/g, ' ')} →` : '→'}
                </div>
              </div>
              <button
                onClick={() => onViewTargetPaper?.(targetId)}
                className="flex-1 text-left bg-[#0a0f1e] border border-[#1a2555] hover:border-cosmic-glow/20 rounded-lg p-3 transition-colors"
              >
                <div className="text-xs font-mono text-[#7B8CDE]/50 mb-0.5 uppercase tracking-wider">Cited paper</div>
                <div className="text-sm text-[#E8EAF6]/90 line-clamp-2">{targetTitle}</div>
              </button>
            </div>

            {/* Context snippet */}
            {intentContext && (
              <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-3">
                <div className="text-xs font-mono text-[#7B8CDE]/50 mb-1 uppercase tracking-wider">Citation context</div>
                <p className="text-sm text-[#7B8CDE] italic leading-relaxed">
                  &ldquo;{intentContext.length > 200
                    ? intentContext.substring(0, 200) + '...'
                    : intentContext}&rdquo;
                </p>
              </div>
            )}

            {/* Intent badge + weight/type info */}
            <div className="flex items-center gap-3 flex-wrap">
              {intentLabel && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#7B8CDE]/50 uppercase tracking-wider">Intent:</span>
                  <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-[#0a0f1e] border border-[#1a2555] ${intentColorClass} capitalize`}>
                    {intentLabel.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              {type && type !== 'citation' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#7B8CDE]/50 uppercase tracking-wider">Type:</span>
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-[#0a0f1e] border border-[#1a2555] text-[#7B8CDE] capitalize">
                    {type}
                  </span>
                </div>
              )}
              {weight !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#7B8CDE]/50 uppercase tracking-wider">Weight:</span>
                  <span className="text-xs font-mono font-medium text-[#7B8CDE]">
                    {weight.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
