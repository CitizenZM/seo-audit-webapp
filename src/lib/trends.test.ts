import { describe, it, expect } from 'vitest';
import { computeTrend, type VisibilitySnapshotRow } from './trends';

function snap(partial: Partial<VisibilitySnapshotRow> & { capturedAt: string; visibilityPct: number }): VisibilitySnapshotRow {
  return {
    totalPrompts: 10,
    leaderboard: [],
    models: [],
    citations: [],
    ...partial,
  };
}

describe('computeTrend', () => {
  it('returns empty trend for no snapshots', () => {
    const trend = computeTrend([]);
    expect(trend.points).toEqual([]);
    expect(trend.momentum).toBe('flat');
    expect(trend.deltaPct).toBe(0);
    expect(trend.competitorMovers).toEqual([]);
  });

  it('orders points oldest to newest regardless of input order', () => {
    const trend = computeTrend([
      snap({ capturedAt: '2026-07-10T00:00:00Z', visibilityPct: 20 }),
      snap({ capturedAt: '2026-07-01T00:00:00Z', visibilityPct: 10 }),
      snap({ capturedAt: '2026-07-05T00:00:00Z', visibilityPct: 15 }),
    ]);
    expect(trend.points.map((p) => p.visibilityPct)).toEqual([10, 15, 20]);
  });

  it('detects upward momentum', () => {
    const trend = computeTrend([
      snap({ capturedAt: '2026-07-01T00:00:00Z', visibilityPct: 10 }),
      snap({ capturedAt: '2026-07-10T00:00:00Z', visibilityPct: 25 }),
    ]);
    expect(trend.momentum).toBe('up');
    expect(trend.deltaPct).toBe(15);
  });

  it('detects downward momentum', () => {
    const trend = computeTrend([
      snap({ capturedAt: '2026-07-01T00:00:00Z', visibilityPct: 30 }),
      snap({ capturedAt: '2026-07-10T00:00:00Z', visibilityPct: 12 }),
    ]);
    expect(trend.momentum).toBe('down');
    expect(trend.deltaPct).toBe(-18);
  });

  it('treats small changes as flat', () => {
    const trend = computeTrend([
      snap({ capturedAt: '2026-07-01T00:00:00Z', visibilityPct: 20 }),
      snap({ capturedAt: '2026-07-10T00:00:00Z', visibilityPct: 20.5 }),
    ]);
    expect(trend.momentum).toBe('flat');
  });

  it('single snapshot is flat with zero delta', () => {
    const trend = computeTrend([snap({ capturedAt: '2026-07-01T00:00:00Z', visibilityPct: 40 })]);
    expect(trend.momentum).toBe('flat');
    expect(trend.deltaPct).toBe(0);
  });

  it('computes competitor movers sorted by absolute delta, ignoring new entrants', () => {
    const trend = computeTrend([
      snap({
        capturedAt: '2026-07-01T00:00:00Z',
        visibilityPct: 10,
        leaderboard: [
          { brand: 'Acme', mentions: 5, visibilityPct: 50, isYou: true },
          { brand: 'Globex', mentions: 3, visibilityPct: 30, isYou: false },
        ],
      }),
      snap({
        capturedAt: '2026-07-10T00:00:00Z',
        visibilityPct: 20,
        leaderboard: [
          { brand: 'Acme', mentions: 8, visibilityPct: 60, isYou: true },
          { brand: 'Globex', mentions: 1, visibilityPct: 10, isYou: false },
          { brand: 'Initech', mentions: 2, visibilityPct: 20, isYou: false },
        ],
      }),
    ]);
    expect(trend.competitorMovers).toEqual([
      { brand: 'Globex', delta: -20 },
      { brand: 'Acme', delta: 10 },
    ]);
  });
});
