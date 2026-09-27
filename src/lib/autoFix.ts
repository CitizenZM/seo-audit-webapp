import type { SupabaseClient } from '@supabase/supabase-js';
import { actOnFix, proposeForClient, type ClientRow } from '@/lib/fixStore';

/**
 * Auto mode (operator request 2026-09-27: "authorize the store once, then no
 * per-item approvals"). After a store is connected, scan it and apply every
 * Tier-1 proposal automatically. Automatic does NOT mean unchecked — each
 * fix still goes through applyFix: conflict protection (never overwrite a
 * merchant edit), Shopify userErrors, and the mandatory re-read-and-compare
 * second check; every fix stays one-click rollback-able.
 *
 * Batches are time-boxed to fit a 300s function; leftovers are reported so
 * the caller can chain another run. Repeated failures halt the batch (a
 * revoked token or store problem shouldn't burn through hundreds of writes).
 */

export interface AutoFixDeps {
  scan: () => Promise<{ proposed: number; skipped: number; scanned: number }>;
  listPending: () => Promise<{ id: string }[]>;
  apply: (id: string) => Promise<{ status: 'verified' | 'failed' | 'conflict' | 'rejected' | 'rolled_back' }>;
  now: () => number;
}

export interface AutoFixResult {
  scanned: number;
  proposed: number;
  attempted: number;
  verified: number;
  conflict: number;
  failed: number;
  remaining: number;
  halted?: string;
}

const MAX_CONSECUTIVE_FAILURES = 5;

export async function runAutoFixBatch(deps: AutoFixDeps, opts: { deadline: number; scan: boolean }): Promise<AutoFixResult> {
  const r: AutoFixResult = { scanned: 0, proposed: 0, attempted: 0, verified: 0, conflict: 0, failed: 0, remaining: 0 };
  if (opts.scan) {
    const s = await deps.scan();
    r.scanned = s.scanned;
    r.proposed = s.proposed;
  }
  const pending = await deps.listPending();
  let streak = 0;
  let i = 0;
  for (; i < pending.length; i++) {
    if (deps.now() >= opts.deadline) break;
    r.attempted++;
    let status: string;
    try {
      status = (await deps.apply(pending[i].id)).status;
    } catch {
      status = 'failed';
    }
    if (status === 'verified') { r.verified++; streak = 0; }
    else if (status === 'conflict') { r.conflict++; streak = 0; }
    else { r.failed++; streak++; }
    if (streak >= MAX_CONSECUTIVE_FAILURES) {
      r.halted = `${MAX_CONSECUTIVE_FAILURES} consecutive failures — stopped to protect the store; check the connection`;
      i++;
      break;
    }
  }
  r.remaining = pending.length - i;
  return r;
}

/** Real dependencies against Supabase + Shopify for one client. */
export function autoFixDeps(db: SupabaseClient, client: ClientRow, operator = 'auto-mode'): AutoFixDeps {
  return {
    scan: () => proposeForClient(db, client),
    listPending: async () => {
      const { data } = await db.from('seo_fixes').select('id').eq('client_id', client.id).eq('status', 'proposed').order('created_at', { ascending: true }).limit(500);
      return (data ?? []) as { id: string }[];
    },
    apply: async (id) => {
      const res = await actOnFix(db, id, 'approve', { operator });
      if ('error' in res) return { status: 'failed' as const };
      return { status: ((res.fix as { status?: string } | null)?.status ?? 'failed') as 'verified' | 'failed' | 'conflict' };
    },
    now: () => Date.now(),
  };
}
