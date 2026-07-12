'use client';

/**
 * Lightweight client-side audit history (#1).
 * Stores recent audits in localStorage so users can revisit / compare past runs
 * without a backend. Production path: swap this for Supabase (see README).
 */
export interface AuditRecord {
  url: string;
  domain: string;
  score: number;
  competitors: number;
  timestamp: number;
  /** Supabase seo_audits row id, when persistence is configured — the
   * capability link used by /reports and /report/[id] for anonymous users
   * (same privacy model as the Share button: unguessable id, never a public
   * listing). Absent when persistence isn't configured. */
  id?: string;
}

const KEY = 'seo-audit-history';
const MAX = 10;

export function getAudits(): AuditRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveAudit(rec: AuditRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getAudits().filter((a) => a.url !== rec.url);
    const next = [rec, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

/** Most recent score for a URL, for trend deltas. Returns null if first audit. */
export function previousScore(url: string): number | null {
  const prior = getAudits().find((a) => a.url === url);
  return prior ? prior.score : null;
}
