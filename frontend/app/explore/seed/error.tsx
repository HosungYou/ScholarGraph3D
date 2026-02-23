'use client';

import { useEffect } from 'react';

export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deployment skew: old cached JS chunks crash on new deployments.
    // Auto-reload once to get fresh code. Use sessionStorage to prevent loop.
    const key = 'sg3d-error-reload';
    const lastReload = sessionStorage.getItem(key);
    const now = Date.now();

    if (!lastReload || now - Number(lastReload) > 30_000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
      return;
    }

    console.error('[ExploreError]', error.message);
  }, [error]);

  return (
    <div className="h-screen flex items-center justify-center bg-black">
      <div className="text-center max-w-md px-6">
        <div className="text-[#D4AF37] text-lg font-semibold mb-2">
          Visualization Error
        </div>
        <p className="text-[#999999] text-sm mb-4">
          A rendering error occurred. This usually resolves with a fresh reload.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded text-[#D4AF37] text-sm hover:bg-[#D4AF37]/20 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded text-[#999999] text-sm hover:bg-white/10 transition-colors"
          >
            Full Reload
          </button>
        </div>
      </div>
    </div>
  );
}
