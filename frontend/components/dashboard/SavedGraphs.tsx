'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
  Network,
  Calendar,
  FileText,
  Trash2,
  ArrowRight,
  Search,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { SavedGraph } from '@/types';

export default function SavedGraphs() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: graphs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['graphs'],
    queryFn: () => api.listGraphs(),
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteGraph(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graphs'] });
    },
  });

  const handleLoad = (graph: SavedGraph) => {
    router.push(`/explore/seed?graph_id=${graph.id}&paper_id=${encodeURIComponent(graph.seed_query || '')}`);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this graph?')) {
      deleteMutation.mutate(id);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-neutral-500 text-sm font-mono">
          Sign in to view your saved graphs
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400/80 text-xs font-mono">Failed to load saved graphs</p>
        <p className="text-neutral-700 text-[10px] font-mono mt-2">Please try again later</p>
      </div>
    );
  }

  if (!graphs || graphs.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <Network className="w-10 h-10 text-neutral-800 mx-auto mb-6" />
        <p className="text-neutral-400 font-serif text-xl mb-2">No explorations yet</p>
        <p className="text-neutral-600 text-sm font-mono mb-8 max-w-sm mx-auto">
          Search for papers and save your exploration graphs to revisit them later.
        </p>
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#D4AF37] text-black text-xs font-mono font-semibold uppercase tracking-widest hover:bg-[#E5C04B] transition-colors rounded-lg"
        >
          <Search className="w-3.5 h-3.5" />
          Start Exploring
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
          {graphs.length} saved {graphs.length === 1 ? 'graph' : 'graphs'}
        </span>
      </div>

      {graphs.map((graph, i) => (
        <motion.div
          key={graph.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => handleLoad(graph)}
          className="group cursor-pointer rounded-lg p-5 bg-neutral-950 border border-neutral-800 hover:border-neutral-600 transition-all duration-300"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-white group-hover:text-[#D4AF37] transition-colors leading-snug truncate">
                {graph.name}
              </h3>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-neutral-600 font-mono">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  {graph.paper_count} papers
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {new Date(graph.created_at).toLocaleDateString()}
                </span>
              </div>
              {graph.seed_query && (
                <div className="mt-2 text-[11px] text-neutral-700 font-mono truncate">
                  &ldquo;{graph.seed_query}&rdquo;
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(graph.id); }}
                title="Delete graph"
                className="p-2 rounded-lg text-neutral-700 hover:text-red-400 hover:bg-red-400/5 transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="p-2 rounded-lg text-neutral-700 group-hover:text-[#D4AF37] transition-all">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
