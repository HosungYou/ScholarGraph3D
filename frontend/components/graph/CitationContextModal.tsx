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
    intentLabel === 'extends' ? 'text-blue-400' :
    intentLabel === 'applies' ? 'text-purple-400' :
    intentLabel === 'methodology' ? 'text-purple-400' :
    intentLabel === 'result_comparison' ? 'text-blue-400' :
    intentLabel === 'background' ? 'text-gray-400' :
    'text-gray-400';

  const sourceTitle = sourceNode?.title ?? sourceId;
  const targetTitle = targetNode?.title ?? targetId;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
            <h3 className="text-sm font-semibold text-gray-100">Citation Context</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
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
                className="flex-1 text-left bg-gray-800/50 hover:bg-gray-800 rounded-lg p-3 transition-colors"
              >
                <div className="text-xs text-gray-500 mb-0.5">Citing paper</div>
                <div className="text-sm text-gray-200 line-clamp-2">{sourceTitle}</div>
              </button>
              <div className="flex-shrink-0 text-center">
                <div className={`text-sm font-semibold ${intentColorClass} capitalize`}>
                  {intentLabel ? `→ ${intentLabel.replace(/_/g, ' ')} →` : '→'}
                </div>
              </div>
              <button
                onClick={() => onViewTargetPaper?.(targetId)}
                className="flex-1 text-left bg-gray-800/50 hover:bg-gray-800 rounded-lg p-3 transition-colors"
              >
                <div className="text-xs text-gray-500 mb-0.5">Cited paper</div>
                <div className="text-sm text-gray-200 line-clamp-2">{targetTitle}</div>
              </button>
            </div>

            {/* Context snippet */}
            {intentContext && (
              <div className="bg-gray-800/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Citation context</div>
                <p className="text-sm text-gray-300 italic leading-relaxed">
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
                  <span className="text-xs text-gray-500">Intent:</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 ${intentColorClass} capitalize`}>
                    {intentLabel.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              {type && type !== 'citation' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Type:</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 capitalize">
                    {type}
                  </span>
                </div>
              )}
              {weight !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Weight:</span>
                  <span className="text-xs font-medium text-gray-300">
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
