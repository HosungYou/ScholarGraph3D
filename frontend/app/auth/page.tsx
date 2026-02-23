'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import LoginForm from '@/components/auth/LoginForm';
import SignupForm from '@/components/auth/SignupForm';
import CosmicStarfield from '@/components/cosmic/CosmicStarfield';
import { motion } from 'framer-motion';
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
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-6 h-6 border-2 border-[#D4AF37]/40 border-t-[#D4AF37] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative">
      <CosmicStarfield density="dense" />

      {/* Back button */}
      <a
        href="/"
        className="absolute top-6 left-8 flex items-center gap-2 text-xs font-mono text-neutral-500 hover:text-white transition-colors tracking-wider uppercase z-10"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Home
      </a>

      {/* Logo */}
      <div className="absolute top-6 right-8 z-10">
        <span className="font-serif text-xl tracking-tight text-white">SG3D</span>
        <span className="text-[10px] font-mono text-neutral-600 tracking-wider ml-2">v3.0</span>
      </div>

      <motion.div
        className="relative z-10 w-full max-w-sm mx-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {mode === 'login' ? (
          <LoginForm onSwitchToSignup={() => setMode('signup')} />
        ) : (
          <SignupForm onSwitchToLogin={() => setMode('login')} />
        )}
      </motion.div>
    </div>
  );
}
