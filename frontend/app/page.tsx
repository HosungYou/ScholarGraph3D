'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, Box, Brain, Zap } from 'lucide-react';

export default function LandingPage() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const features = [
    {
      icon: Box,
      title: '3D Visualization',
      description:
        'Navigate citation networks and topic clusters in an immersive 3D space.',
      color: '#4A90D9',
    },
    {
      icon: Brain,
      title: 'AI Analysis',
      description:
        'Automatic clustering, TLDR generation, and research gap detection.',
      color: '#2ECC71',
    },
    {
      icon: Zap,
      title: 'Real-time Sync',
      description:
        'Live data from Semantic Scholar and OpenAlex with UMAP embeddings.',
      color: '#E67E22',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-surface pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-accent/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl px-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-6xl font-bold tracking-tight mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-purple to-accent-green">
              ScholarGraph3D
            </span>
          </h1>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Explore the universe of academic papers in 3D
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={handleSearch}
          className="mb-16"
        >
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/30 via-accent-purple/30 to-accent-green/30 rounded-2xl blur-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center glass-strong rounded-2xl overflow-hidden">
              <Search className="w-5 h-5 text-text-secondary ml-5 flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search papers... e.g., &quot;transformer attention mechanism&quot;"
                className="flex-1 bg-transparent px-4 py-5 text-lg text-text-primary placeholder:text-text-secondary/60 outline-none"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="px-8 py-5 bg-accent hover:bg-accent/90 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Explore
              </button>
            </div>
          </div>
        </motion.form>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
              className="glass rounded-xl p-6 hover:bg-surface-hover/50 transition-colors group"
            >
              <feature.icon
                className="w-8 h-8 mb-4 transition-transform group-hover:scale-110"
                style={{ color: feature.color }}
              />
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 text-center text-sm text-text-secondary/60"
        >
          <a href="/auth" className="hover:text-accent transition-colors">
            Sign In
          </a>
          <span className="mx-3">|</span>
          <a href="/dashboard" className="hover:text-accent transition-colors">
            Dashboard
          </a>
        </motion.div>
      </div>
    </div>
  );
}
