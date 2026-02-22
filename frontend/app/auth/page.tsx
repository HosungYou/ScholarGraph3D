'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import LoginForm from '@/components/auth/LoginForm';
import SignupForm from '@/components/auth/SignupForm';
import CosmicStarfield from '@/components/cosmic/CosmicStarfield';
import { ArrowLeft } from 'lucide-react';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      {/* Background */}
      <CosmicStarfield density="dense" />
      <div className="fixed inset-0 z-[1] hud-scanline pointer-events-none" />

      {/* Back button */}
      <a
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors font-mono z-10"
      >
        <ArrowLeft className="w-4 h-4" />
        Home
      </a>

      <div className="relative z-10">
        {mode === 'login' ? (
          <LoginForm onSwitchToSignup={() => setMode('signup')} />
        ) : (
          <SignupForm onSwitchToLogin={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}
