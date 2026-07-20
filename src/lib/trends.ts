import { supabaseAdmin, isSupabaseConfigured } from './supabase/admin';
import type { LeaderboardEntry, Slice, CitationEntry } from './visibility';

/**
 * Visibility trend tracking (#2).
 *
 * Each audit run can persist a compact snapshot of its visibility result so
 * the /reports UI (or a future trends chart) can show momentum over time.
 * Mirrors the graceful-no-op convention used across the app: when Supabase
 * isn't configured, save/read calls are cheap no-ops instead of throwing.
 */

export interface VisibilitySnapshotInput {
  userId?: string;
  domain: string;
  visibility: {
    visibilityPct: number;
    totalPrompts: number;
    leaderboard: LeaderboardEntry[];
    models: Slice[];
    citations: CitationEntry[];
  };
}

export interface VisibilitySnapshotRow {
  capturedAt: string;
  visibilityPct: number;
  totalPrompts: number;
  leaderboard: LeaderboardEntry[];
  models: Slice[];
  citations: CitationEntry[];
}

export interface TrendPoint {
  capturedAt: string;
  visibilityPct: number;
}

export interface CompetitorMover {
  brand: string;
  delta: number;
}

export type Momentum = 'up' | 'down' | 'flat';

export interface VisibilityTrend {
  points: TrendPoint[];
  momentum: Momentum;
  deltaPct: number;
  competitorMovers: CompetitorMover[];
}

const EMPTY_TREND: VisibilityTrend = { points: [], momentum: 'flat', deltaPct: 0, competitorMovers: [] };

/** Threshold below which we call the trend "flat" rather than up/down (noise floor). */
const FLAT_THRESHOLD_PCT = 1;

/**
 * Pure computation over an ordered (oldest→newest) list of snapshots.
 * Factored out so trend math is unit-testable without a database.
 */
export function computeTrend(snapshots: VisibilitySnapshotRow[]): VisibilityTrend {
  if (snapshots.length === 0) return EMPTY_TREND;

  const ordered = [...snapshots].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  const points: TrendPoint[] = ordered.map((s) => ({ capturedAt: s.capturedAt, visibilityPct: s.visibilityPct }));

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const deltaPct = Math.round((last.visibilityPct - first.visibilityPct) * 10) / 10;

  let momentum: Momentum = 'flat';
  if (deltaPct > FLAT_THRESHOLD_PCT) momentum = 'up';
  else if (deltaPct < -FLAT_THRESHOLD_PCT) momentum = 'down';

  const competitorMovers = computeCompetitorMovers(first.leaderboard, last.leaderboard);

  return { points, momentum, deltaPct, competitorMovers };
}

/** Diff two leaderboards by brand, returning movers sorted by |delta| descending. */
function computeCompetitorMovers(
  firstLeaderboard: LeaderboardEntry[],
  lastLeaderboard: LeaderboardEntry[]
): CompetitorMover[] {
  const firstByBrand = new Map(firstLeaderboard.map((e) => [e.brand, e.visibilityPct]));
  const movers: CompetitorMover[] = [];
  for (const entry of lastLeaderboard) {
    const before = firstByBrand.get(entry.brand);
    if (before === undefined) continue; // new entrant — no meaningful delta yet
    const delta = Math.round((entry.visibilityPct - before) * 10) / 10;
    if (delta !== 0) movers.push({ brand: entry.brand, delta });
  }
  return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Persist a visibility snapshot. Returns false (no-op) when Supabase isn't configured. */
export async function saveVisibilitySnapshot(input: VisibilitySnapshotInput): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const db = supabaseAdmin();
  const { error } = await db.from('visibility_snapshots').insert({
    user_id: input.userId ?? null,
    domain: input.domain,
    visibility_pct: input.visibility.visibilityPct,
    total_prompts: input.visibility.totalPrompts,
    leaderboard: input.visibility.leaderboard,
    models: input.visibility.models,
    citations: input.visibility.citations,
  });

  return !error;
}

export interface GetVisibilityTrendInput {
  domain: string;
  userId?: string;
  limit?: number;
}

/** Load recent snapshots for a domain and compute trend stats. Returns EMPTY_TREND when unconfigured. */
export async function getVisibilityTrend(input: GetVisibilityTrendInput): Promise<VisibilityTrend> {
  if (!isSupabaseConfigured()) return EMPTY_TREND;

  const db = supabaseAdmin();
  const limit = input.limit ?? 30;

  let query = db
    .from('visibility_snapshots')
    .select('captured_at, visibility_pct, total_prompts, leaderboard, models, citations')
    .eq('domain', input.domain)
    .order('captured_at', { ascending: false })
    .limit(limit);

  query = input.userId ? query.eq('user_id', input.userId) : query.is('user_id', null);

  const { data, error } = await query;
  if (error || !data) return EMPTY_TREND;

  const snapshots: VisibilitySnapshotRow[] = data.map((row) => ({
    capturedAt: row.captured_at,
    visibilityPct: row.visibility_pct,
    totalPrompts: row.total_prompts,
    leaderboard: (row.leaderboard as LeaderboardEntry[]) ?? [],
    models: (row.models as Slice[]) ?? [],
    citations: (row.citations as CitationEntry[]) ?? [],
  }));

  return computeTrend(snapshots);
}
