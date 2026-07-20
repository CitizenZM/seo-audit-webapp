import { supabaseAdmin, isSupabaseConfigured } from './supabase/admin';

/**
 * AI crawler analytics (#3).
 *
 * Consumes a Vercel Log Drain (or a generic { entries } payload) posted to
 * /api/crawler-logs, filters requests whose User-Agent matches a known AI
 * bot, and persists the hits so we can show "who's actually crawling you"
 * next to the robots.txt-based access checks in geo.ts.
 */

// Mirrors AI_BOTS in ./geo — kept local rather than imported to avoid coupling
// this analytics module to geo.ts's export surface (per file-ownership split;
// geo.ts is out of scope for this change). Keep names in sync if geo.ts's
// list changes.
export const KNOWN_AI_BOTS: { name: string; engine: string }[] = [
  { name: 'GPTBot', engine: 'OpenAI' },
  { name: 'OAI-SearchBot', engine: 'OpenAI' },
  { name: 'ChatGPT-User', engine: 'OpenAI' },
  { name: 'ClaudeBot', engine: 'Anthropic' },
  { name: 'Claude-User', engine: 'Anthropic' },
  { name: 'Claude-SearchBot', engine: 'Anthropic' },
  { name: 'anthropic-ai', engine: 'Anthropic' },
  { name: 'Google-Extended', engine: 'Google Gemini' },
  { name: 'Google-CloudVertexBot', engine: 'Google Vertex AI' },
  { name: 'GoogleOther', engine: 'Google' },
  { name: 'PerplexityBot', engine: 'Perplexity' },
  { name: 'Perplexity-User', engine: 'Perplexity' },
  { name: 'Applebot-Extended', engine: 'Apple Intelligence' },
  { name: 'Bytespider', engine: 'ByteDance' },
  { name: 'meta-externalagent', engine: 'Meta AI' },
  { name: 'Amazonbot', engine: 'Amazon (Alexa / shopping agents)' },
  { name: 'CCBot', engine: 'Common Crawl (training data)' },
];

export interface RawLogEntry {
  userAgent: string;
  path: string;
  timestamp: string;
}

export interface CrawlerHit extends RawLogEntry {
  bot: string;
  engine: string;
}

/** Case-insensitive substring match against the known-bot list. Returns the matched entry or null. */
export function matchAiBot(userAgent: string): { name: string; engine: string } | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  for (const bot of KNOWN_AI_BOTS) {
    if (ua.includes(bot.name.toLowerCase())) return bot;
  }
  return null;
}

/**
 * Tolerant parser for two accepted shapes:
 *  - Vercel Log Drain: an array of log objects, each with a `proxy` sub-object
 *    carrying `userAgent`, `path` (or `pathname`), and a timestamp field.
 *  - Generic: { entries: [{ userAgent, path, timestamp }] }.
 * Unknown/malformed entries are skipped silently — never throws.
 */
export function parseLogDrainPayload(body: unknown): RawLogEntry[] {
  const out: RawLogEntry[] = [];
  if (!body) return out;

  try {
    // Generic shape: { entries: [...] }
    if (typeof body === 'object' && !Array.isArray(body) && body !== null && 'entries' in body) {
      const entries = (body as { entries: unknown }).entries;
      if (Array.isArray(entries)) {
        for (const e of entries) {
          const parsed = parseGenericEntry(e);
          if (parsed) out.push(parsed);
        }
      }
      return out;
    }

    // Vercel Log Drain shape: top-level array of log records.
    if (Array.isArray(body)) {
      for (const record of body) {
        const parsed = parseVercelLogRecord(record);
        if (parsed) out.push(parsed);
      }
      return out;
    }
  } catch {
    return out;
  }

  return out;
}

function parseGenericEntry(e: unknown): RawLogEntry | null {
  if (!e || typeof e !== 'object') return null;
  const obj = e as Record<string, unknown>;
  const userAgent = obj.userAgent;
  const path = obj.path;
  const timestamp = obj.timestamp;
  if (typeof userAgent !== 'string' || !userAgent) return null;
  if (typeof path !== 'string' || !path) return null;
  const ts = normalizeTimestamp(timestamp);
  if (!ts) return null;
  return { userAgent, path, timestamp: ts };
}

function parseVercelLogRecord(record: unknown): RawLogEntry | null {
  if (!record || typeof record !== 'object') return null;
  const obj = record as Record<string, unknown>;

  // Vercel log drains nest request metadata under `proxy` for edge/request logs.
  const proxy = (obj.proxy && typeof obj.proxy === 'object' ? obj.proxy : obj) as Record<string, unknown>;

  const userAgent = firstString(proxy.userAgent, (proxy.headers as Record<string, unknown> | undefined)?.['user-agent'], obj.userAgent);
  const path = firstString(proxy.path, proxy.pathname, obj.path, obj.pathname);
  const timestampRaw = firstDefined(proxy.timestamp, obj.timestamp, obj.timestampInMs);

  if (!userAgent || !path) return null;
  const ts = normalizeTimestamp(timestampRaw);
  if (!ts) return null;

  return { userAgent, path, timestamp: ts };
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

function firstDefined(...vals: unknown[]): unknown {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function normalizeTimestamp(raw: unknown): string | null {
  if (raw === undefined || raw === null) return new Date().toISOString();
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Filter raw log entries down to the ones matching a known AI bot UA. */
export function filterAiCrawlerHits(entries: RawLogEntry[]): CrawlerHit[] {
  const hits: CrawlerHit[] = [];
  for (const entry of entries) {
    const match = matchAiBot(entry.userAgent);
    if (match) hits.push({ ...entry, bot: match.name, engine: match.engine });
  }
  return hits;
}

/** Persist matched crawler hits. No-op (returns 0) when Supabase isn't configured. */
export async function saveCrawlerHits(hits: CrawlerHit[], domain?: string): Promise<number> {
  if (!isSupabaseConfigured() || hits.length === 0) return 0;

  const db = supabaseAdmin();
  const rows = hits.map((h) => ({
    bot: h.bot,
    engine: h.engine,
    path: h.path,
    hit_at: h.timestamp,
    domain: domain ?? null,
  }));

  const { error, count } = await db.from('crawler_hits').insert(rows, { count: 'exact' });
  return error ? 0 : (count ?? rows.length);
}

export interface CrawlerHitRow {
  bot: string;
  engine: string;
  path: string;
  hitAt: string;
}

export interface CrawlerStats {
  totalHits: number;
  byBot: { bot: string; engine: string; hits: number }[];
  byEngine: { engine: string; hits: number }[];
  topPaths: { path: string; hits: number }[];
  firstSeen: string | null;
  lastSeen: string | null;
}

const EMPTY_STATS: CrawlerStats = { totalHits: 0, byBot: [], byEngine: [], topPaths: [], firstSeen: null, lastSeen: null };

/** Pure aggregation over crawler hit rows — factored out for unit testing. */
export function aggregateCrawlerHits(rows: CrawlerHitRow[]): CrawlerStats {
  if (rows.length === 0) return EMPTY_STATS;

  const byBotMap = new Map<string, { engine: string; hits: number }>();
  const byEngineMap = new Map<string, number>();
  const byPathMap = new Map<string, number>();
  let firstSeen = rows[0].hitAt;
  let lastSeen = rows[0].hitAt;

  for (const row of rows) {
    const bot = byBotMap.get(row.bot) ?? { engine: row.engine, hits: 0 };
    bot.hits += 1;
    byBotMap.set(row.bot, bot);

    byEngineMap.set(row.engine, (byEngineMap.get(row.engine) ?? 0) + 1);
    byPathMap.set(row.path, (byPathMap.get(row.path) ?? 0) + 1);

    if (row.hitAt < firstSeen) firstSeen = row.hitAt;
    if (row.hitAt > lastSeen) lastSeen = row.hitAt;
  }

  const byBot = [...byBotMap.entries()]
    .map(([bot, v]) => ({ bot, engine: v.engine, hits: v.hits }))
    .sort((a, b) => b.hits - a.hits);

  const byEngine = [...byEngineMap.entries()]
    .map(([engine, hits]) => ({ engine, hits }))
    .sort((a, b) => b.hits - a.hits);

  const topPaths = [...byPathMap.entries()]
    .map(([path, hits]) => ({ path, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 20);

  return { totalHits: rows.length, byBot, byEngine, topPaths, firstSeen, lastSeen };
}

export interface GetCrawlerStatsInput {
  domain?: string;
  days?: number;
}

/** Load recent crawler_hits rows and compute stats. Returns EMPTY_STATS when unconfigured. */
export async function getCrawlerStats(input: GetCrawlerStatsInput = {}): Promise<CrawlerStats> {
  if (!isSupabaseConfigured()) return EMPTY_STATS;

  const db = supabaseAdmin();
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = db
    .from('crawler_hits')
    .select('bot, engine, path, hit_at')
    .gte('hit_at', since)
    .order('hit_at', { ascending: false })
    .limit(5000);

  if (input.domain) query = query.eq('domain', input.domain);

  const { data, error } = await query;
  if (error || !data) return EMPTY_STATS;

  const rows: CrawlerHitRow[] = data.map((r) => ({ bot: r.bot, engine: r.engine, path: r.path, hitAt: r.hit_at }));
  return aggregateCrawlerHits(rows);
}
