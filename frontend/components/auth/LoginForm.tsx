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
    <div className="hud-panel w-full max-w-sm p-8">
      <h2 className="text-2xl font-mono uppercase tracking-widest text-cosmic-glow/80 mb-2">
        STATION ACCESS
      </h2>
      <p className="text-sm text-text-secondary mb-8">
        Sign in to access your saved graphs
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20 text-sm text-accent-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full bg-[#0a0f1e] border border-[#1a2555] rounded-lg pl-10 pr-4 py-3 text-sm text-[#E8EAF6] placeholder:text-[#7B8CDE]/40 outline-none focus:border-cosmic-glow/40 focus:shadow-[0_0_10px_rgba(0,229,255,0.1)] transition-colors"
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-[#0a0f1e] border border-[#1a2555] rounded-lg pl-10 pr-10 py-3 text-sm text-[#E8EAF6] placeholder:text-[#7B8CDE]/40 outline-none focus:border-cosmic-glow/40 focus:shadow-[0_0_10px_rgba(0,229,255,0.1)] transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 hud-button uppercase font-mono tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Connecting...' : 'INITIATE ACCESS'}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#1a2555]/60" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-[#0a0f1e] text-[#7B8CDE]/60">
            or continue with
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0a0f1e] border border-[#1a2555] rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-cosmic-glow/30 hover:bg-[#111833] transition-colors disabled:opacity-50"
        >
          <Chrome className="w-4 h-4" />
          Google Dock
        </button>
        <button
          onClick={signInWithGithub}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0a0f1e] border border-[#1a2555] rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-cosmic-glow/30 hover:bg-[#111833] transition-colors disabled:opacity-50"
        >
          <Github className="w-4 h-4" />
          GitHub Dock
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-text-secondary">
        No station credentials?{' '}
        <button
          onClick={onSwitchToSignup}
          className="text-cosmic-glow hover:text-cosmic-glow/80 transition-colors"
        >
          Sign up
        </button>
      </p>
    </div>
  );
}
