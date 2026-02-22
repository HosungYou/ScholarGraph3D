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
  ExternalLink,
  Loader2,
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
    router.push(`/explore?graph_id=${graph.id}`);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this graph?')) {
      deleteMutation.mutate(id);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">
          Sign in to view your saved graphs
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-cosmic-glow animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-accent-red text-sm">Failed to load saved graphs</p>
      </div>
    );
  }

  if (!graphs || graphs.length === 0) {
    return (
      <div className="hud-panel text-center py-12 px-6">
        <Network className="w-12 h-12 text-[#7B8CDE]/30 mx-auto mb-4" />
        <p className="text-[#7B8CDE] mb-2">No saved graphs yet</p>
        <p className="text-sm text-[#7B8CDE]/50 mb-4">
          Search for papers and save your explorations
        </p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 hud-button text-sm uppercase font-mono"
        >
          Start Exploring
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {graphs.map((graph, i) => (
        <motion.div
          key={graph.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="hud-panel p-4 hover:border-cosmic-glow/20 transition-colors group"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-[#E8EAF6] mb-1">
                {graph.name}
              </h3>
              <div className="flex items-center gap-3 text-xs text-[#7B8CDE] font-mono">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {graph.paper_count} papers
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(graph.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-1 text-xs text-[#7B8CDE]/50 font-mono">
                Query: &ldquo;{graph.seed_query}&rdquo;
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleLoad(graph)}
                title="Open graph"
                className="p-1.5 rounded-lg hover:bg-cosmic-glow/10 text-[#7B8CDE] hover:text-cosmic-glow transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(graph.id)}
                title="Delete graph"
                className="p-1.5 rounded-lg hover:bg-accent-red/10 text-[#7B8CDE] hover:text-accent-red transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
