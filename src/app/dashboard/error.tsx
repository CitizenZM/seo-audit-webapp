'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

/**
 * Route-level error boundary (B6). Next.js renders this instead of a blank
 * white screen whenever a render error escapes the dashboard tree.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error('Dashboard render error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg)] text-center">
      <div className="card p-6 sm:p-8 max-w-md w-full">
        <div className="w-12 h-12 rounded-full bg-[var(--red-soft)] text-[var(--red)] flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-lg font-bold text-[var(--ink)] mb-2">Something went wrong rendering this report</h2>
        <p className="text-sm text-[var(--ink-3)] mb-6">
          This usually means the audited URL was malformed or the response was unexpected. Try again with a different URL.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <button onClick={() => reset()} className="h-11 px-4 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors">
            Try again
          </button>
          <button onClick={() => router.push('/')} className="h-11 px-4 rounded-lg bg-[var(--brand)] text-white text-sm font-semibold hover:brightness-95 transition-all">
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
