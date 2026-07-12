'use client';

/**
 * Root error boundary (B6). Catches anything that escapes every nested
 * error.tsx — must render its own <html>/<body> since it replaces the layout.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#f5f6f8', color: '#14151a', fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: '#5b6170', marginBottom: 24 }}>An unexpected error occurred. Please try again.</p>
          <button
            onClick={() => reset()}
            style={{ height: 44, padding: '0 20px', borderRadius: 8, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
