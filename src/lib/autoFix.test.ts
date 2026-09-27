import { describe, it, expect } from 'vitest';
import { runAutoFixBatch, type AutoFixDeps } from './autoFix';

const fixes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}` }));

function deps(over: Partial<AutoFixDeps> = {}): AutoFixDeps & { applied: string[] } {
  const applied: string[] = [];
  return {
    applied,
    scan: async () => ({ proposed: 3, skipped: 0, scanned: 10 }),
    listPending: async () => fixes(3),
    apply: async (id) => { applied.push(id); return { status: 'verified' as const }; },
    now: () => Date.now(),
    ...over,
  };
}

describe('runAutoFixBatch', () => {
  it('scans, then applies every pending fix and tallies outcomes', async () => {
    const d = deps({ apply: async (id) => ({ status: id === 'f1' ? ('conflict' as const) : ('verified' as const) }) });
    const r = await runAutoFixBatch(d, { deadline: Date.now() + 60_000, scan: true });
    expect(r).toMatchObject({ scanned: 10, proposed: 3, attempted: 3, verified: 2, conflict: 1, failed: 0, remaining: 0 });
  });

  it('stops at the time budget and reports what is left for the next run', async () => {
    let t = 0;
    const d = deps({ listPending: async () => fixes(10), now: () => t, apply: async () => { t += 1000; return { status: 'verified' as const }; } });
    const r = await runAutoFixBatch(d, { deadline: 3500, scan: false });
    expect(r.attempted).toBe(4);
    expect(r.remaining).toBe(6);
  });

  it('halts the batch after repeated failures (store or token problem) instead of burning through', async () => {
    const d = deps({ listPending: async () => fixes(20), apply: async () => ({ status: 'failed' as const }) });
    const r = await runAutoFixBatch(d, { deadline: Date.now() + 60_000, scan: false });
    expect(r.attempted).toBe(5);
    expect(r.halted).toMatch(/consecutive failures/);
  });

  it('skips scanning when asked and never throws on an apply exception', async () => {
    let scanned = false;
    const d = deps({ scan: async () => { scanned = true; return { proposed: 0, skipped: 0, scanned: 0 }; }, apply: async (id) => { if (id === 'f0') throw new Error('boom'); return { status: 'verified' as const }; } });
    const r = await runAutoFixBatch(d, { deadline: Date.now() + 60_000, scan: false });
    expect(scanned).toBe(false);
    expect(r).toMatchObject({ attempted: 3, failed: 1, verified: 2 });
  });
});
