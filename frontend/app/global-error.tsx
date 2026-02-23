'use client';

/**
 * Global error boundary — catches errors that escape route-level error.tsx.
 * Required for App Router: must render its own <html>/<body>.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#000', color: '#999', fontFamily: 'system-ui' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
            <div style={{ color: '#D4AF37', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Something went wrong
            </div>
            <p style={{ fontSize: 14, marginBottom: 16 }}>
              The application encountered an unexpected error.
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: '8px 16px',
                background: 'rgba(212,175,55,0.1)',
                border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: 4,
                color: '#D4AF37',
                fontSize: 14,
                cursor: 'pointer',
                marginRight: 8,
              }}
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                color: '#999',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
