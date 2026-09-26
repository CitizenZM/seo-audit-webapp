import { describe, it, expect } from 'vitest';
import { buildDigest, isInternalCall, type DigestAudit } from './auditJobs';

const NOW = new Date('2026-09-28T12:00:00Z');
const a = (domain: string, daysAgo: number, overall: number | null, visibility: number | null = 10): DigestAudit => ({
  domain,
  created_at: new Date(NOW.getTime() - daysAgo * 86400_000).toISOString(),
  overall_score: overall,
  geo_score: 60,
  visibility_pct: visibility,
});

describe('buildDigest', () => {
  it('computes week-over-week deltas against an audit ≥6 days older', () => {
    const [row] = buildDigest([a('x.com', 0, 70), a('x.com', 2, 69), a('x.com', 7, 64)], ['x.com'], NOW);
    expect(row.latest?.overall).toBe(70);
    expect(row.delta.overall).toBe(6);
    expect(row.alert).toBeNull();
  });

  it('alerts on a ≥5 point SEO drop', () => {
    const [row] = buildDigest([a('x.com', 0, 60), a('x.com', 7, 66)], ['x.com'], NOW);
    expect(row.alert).toMatch(/dropped 6/);
  });

  it('alerts on an AI visibility drop', () => {
    const [row] = buildDigest([a('x.com', 0, 70, 5), a('x.com', 7, 70, 15)], ['x.com'], NOW);
    expect(row.alert).toMatch(/visibility dropped 10/);
  });

  it('alerts when a client had no audit this week, and handles no history', () => {
    const rows = buildDigest([a('old.com', 10, 70)], ['old.com', 'new.com'], NOW);
    expect(rows[0].alert).toMatch(/No completed audit/);
    expect(rows[1].latest).toBeNull();
    expect(rows[1].delta.overall).toBeNull();
  });

  it('null deltas when there is no baseline yet', () => {
    const [row] = buildDigest([a('x.com', 0, 70), a('x.com', 1, 68)], ['x.com'], NOW);
    expect(row.delta.overall).toBeNull();
  });
});

describe('isInternalCall', () => {
  it('requires the exact bearer secret and fails closed without one', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(isInternalCall(new Request('http://x', { headers: { authorization: 'Bearer s3cret' } }))).toBe(true);
    expect(isInternalCall(new Request('http://x', { headers: { authorization: 'Bearer nope' } }))).toBe(false);
    expect(isInternalCall(new Request('http://x'))).toBe(false);
    delete process.env.CRON_SECRET;
    expect(isInternalCall(new Request('http://x', { headers: { authorization: 'Bearer ' } }))).toBe(false);
  });
});
