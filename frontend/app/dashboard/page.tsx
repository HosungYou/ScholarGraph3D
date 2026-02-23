'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import SavedGraphs from '@/components/dashboard/SavedGraphs';
import {
  Search,
  LogOut,
  User,
  Compass,
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-[#1A1A1A] glass-strong">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <a href="/" className="text-lg font-bold text-accent">
                SG3D
              </a>
              <span className="text-xs font-mono text-cosmic-glow/60 uppercase tracking-widest">COMMAND CENTER</span>
            </div>
            <span className="text-text-secondary/40">|</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-cosmic-pulse" />
              <span className="text-[10px] font-mono text-text-secondary/50">ONLINE</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <User className="w-4 h-4" />
              <span>{user.email}</span>
            </div>
            <button
              onClick={() => router.push('/')}
              className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
              title="New exploration"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={async () => {
                await signOut();
                router.push('/');
              }}
              className="p-2 rounded-lg hover:bg-accent-red/10 text-text-secondary hover:text-accent-red transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Saved Graphs Section */}
        <section>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2 mb-1">
              <Compass className="w-6 h-6 text-cosmic-glow" />
              MY SEED EXPLORATIONS
            </h1>
            <p className="text-sm text-text-secondary">
              Resume your previous exploration missions
            </p>
          </div>

          <SavedGraphs />
        </section>
      </main>
    </div>
  );
}
