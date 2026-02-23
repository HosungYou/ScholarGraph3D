'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Mail, Lock, User, Eye, EyeOff, Chrome, Github } from 'lucide-react';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export default function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const { signUp, signInWithGoogle, signInWithGithub, isLoading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    try {
      await signUp(email, password, fullName);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    }
  };

  if (success) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 backdrop-blur-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-5">
          <Mail className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="font-serif text-2xl tracking-tight text-white mb-2">
          Check Your Email
        </h2>
        <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
          We sent a confirmation link to <strong className="text-neutral-300">{email}</strong>.
          Click the link to activate your account.
        </p>
        <button
          onClick={onSwitchToLogin}
          className="text-sm text-[#D4AF37] hover:text-[#E5C04B] transition-colors font-mono"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 backdrop-blur-sm p-8">
      <h2 className="font-serif text-3xl tracking-tight text-white mb-1">
        Create Account
      </h2>
      <p className="text-sm text-neutral-500 mb-8">
        Start exploring academic papers in 3D
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-400/5 border border-red-400/20 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-3 text-sm text-white font-mono placeholder:text-neutral-700 outline-none focus:border-[#D4AF37]/40 focus:shadow-[0_0_20px_rgba(212,175,55,0.08)] transition-all duration-300"
          />
        </div>

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
            placeholder="Password (min. 6 characters)"
            required
            minLength={6}
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
          {isLoading ? 'Creating account...' : 'Create Account'}
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
        Already have an account?{' '}
        <button
          onClick={onSwitchToLogin}
          className="text-[#D4AF37] hover:text-[#E5C04B] transition-colors"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
