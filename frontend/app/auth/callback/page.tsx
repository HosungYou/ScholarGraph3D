'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase not configured — redirect immediately
    if (!supabase) {
      router.push('/auth?error=oauth_failed');
      return;
    }

    let redirected = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && !redirected) {
        redirected = true;
        subscription.unsubscribe();
        router.push('/dashboard');
      }
    });

    // 5-second timeout fallback
    const timeout = setTimeout(() => {
      if (!redirected) {
        redirected = true;
        subscription.unsubscribe();
        // Check session manually
        supabase!.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            router.push('/dashboard');
          } else {
            router.push('/auth?error=oauth_failed');
          }
        });
      }
    }, 5000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-text-secondary">Completing sign in...</p>
      </div>
    </div>
  );
}
