'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Mail, Lock, Eye, EyeOff, Chrome, Github } from 'lucide-react';

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

export default function LoginForm({ onSwitchToSignup }: LoginFormProps) {
  const { signIn, signInWithGoogle, signInWithGithub, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    }
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 backdrop-blur-sm p-8">
      <h2 className="font-serif text-3xl tracking-tight text-white mb-1">
        Sign In
      </h2>
      <p className="text-sm text-neutral-500 mb-8">
        Access your saved explorations
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-400/5 border border-red-400/20 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-3 text-sm text-white font-mono placeholder:text-neutral-700 outline-none focus:border-[#D4AF37]/40 focus:shadow-[0_0_20px_rgba(212,175,55,0.08)] transition-all duration-300"
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-10 py-3 text-sm text-white font-mono placeholder:text-neutral-700 outline-none focus:border-[#D4AF37]/40 focus:shadow-[0_0_20px_rgba(212,175,55,0.08)] transition-all duration-300"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-[#D4AF37] text-black text-xs font-mono font-semibold uppercase tracking-widest rounded-lg hover:bg-[#E5C04B] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-neutral-800" />
        </div>
        <div className="relative flex justify-center text-[10px]">
          <span className="px-3 bg-neutral-950 text-neutral-600 font-mono uppercase tracking-wider">
            or continue with
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-500 hover:text-white hover:border-neutral-600 transition-all disabled:opacity-30"
        >
          <Chrome className="w-4 h-4" />
          <span className="font-mono text-xs">Google</span>
        </button>
        <button
          onClick={signInWithGithub}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-500 hover:text-white hover:border-neutral-600 transition-all disabled:opacity-30"
        >
          <Github className="w-4 h-4" />
          <span className="font-mono text-xs">GitHub</span>
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-neutral-600">
        Don&apos;t have an account?{' '}
        <button
          onClick={onSwitchToSignup}
          className="text-[#D4AF37] hover:text-[#E5C04B] transition-colors"
        >
          Sign up
        </button>
      </p>
    </div>
  );
}
