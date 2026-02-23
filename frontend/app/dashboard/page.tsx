'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import SavedGraphs from '@/components/dashboard/SavedGraphs';
import CosmicStarfield from '@/components/cosmic/CosmicStarfield';
import { motion } from 'framer-motion';
import {
  Search,
  LogOut,
  User,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-6 h-6 border-2 border-[#D4AF37]/40 border-t-[#D4AF37] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-black text-white">
      <CosmicStarfield />

      {/* Navigation — matching landing page */}
      <nav className="relative z-10 flex items-center justify-between px-8 md:px-16 py-6 border-b border-neutral-900">
        <div className="flex items-center gap-3">
          <a href="/" className="font-serif text-2xl tracking-tight text-white hover:text-[#D4AF37] transition-colors">
            SG3D
          </a>
          <span className="text-[10px] font-mono text-neutral-600 tracking-wider">v3.0</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
            <User className="w-3.5 h-3.5" />
            <span>{user.email}</span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="text-xs font-mono text-neutral-500 hover:text-white transition-colors tracking-wider uppercase"
            title="New exploration"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
            className="text-xs font-mono text-neutral-500 hover:text-red-400 transition-colors tracking-wider uppercase"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-8 md:px-16 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight mb-3">
            Your<br />
            <span className="text-neutral-400">Explorations.</span>
          </h1>
          <p className="text-neutral-500 text-sm leading-relaxed max-w-md mb-12">
            Resume previous seed paper explorations or start a new journey through the universe of knowledge.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <SavedGraphs />
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-5xl mx-auto px-8 md:px-16 py-10 border-t border-neutral-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-serif text-lg text-white">ScholarGraph3D</span>
            <span className="text-[10px] font-mono text-neutral-700">&copy; 2025</span>
          </div>
          <div className="flex items-center gap-6 text-[10px] font-mono text-neutral-600">
            <a href="/" className="hover:text-white transition-colors uppercase tracking-wider">
              Search
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
