import type { SupabaseClient } from '@supabase/supabase-js';
import { runAudit, type Stage } from '@/lib/runAudit';

/**
 * Audit job lifecycle shared by the interactive route (/api/audits), the
 * worker (/api/jobs/run) and the scheduler (/api/cron/reaudit). One job =
 * one seo_audits row; execution always happens in its own function
 * invocation so N client sites run in parallel, each with the full 300s
 * budget (the old cron ran every site serially inside one 60s function).
 */

export interface CreateJobInput {
  url: string; // already normalized
  domain: string;
  competitors?: string;
  userId?: string | null;
}

export async function createAuditJob(db: SupabaseClient, input: CreateJobInput): Promise<string | null> {
  // Link the run to its client workspace by domain (best effort).
  let clientId: string | null = null;
  try {
    const { data: client } = await db.from('seo_clients').select('id').eq('domain', input.domain).maybeSingle();
    clientId = client?.id ?? null;
  } catch (e) {
    console.warn('Client lookup skipped:', e instanceof Error ? e.message : e);
  }

  const competitorCount = (input.competitors ?? '').split(',').map((s) => s.trim()).filter(Boolean).length;
  const { data: row, error } = await db
    .from('seo_audits')
    .insert({
      user_id: input.userId ?? null,
      client_id: clientId,
      url: input.url,
      domain: input.domain,
      competitors_requested: competitorCount,
      status: 'queued',
      stage: 'queued',
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('Failed to create audit job:', error);
    return null;
  }
  return row.id as string;
}

/** Run the pipeline for an existing job row and persist progress + result. */
export async function executeAuditJob(
  db: SupabaseClient,
  auditId: string,
  url: string,
  competitors?: string,
): Promise<{ ok: true; overallScore: number | null } | { ok: false; error: string }> {
  const updateStage = async (stage: Stage) => {
    await db.from('seo_audits').update({ stage, status: 'running', updated_at: new Date().toISOString() }).eq('id', auditId);
  };
  try {
    await db.from('seo_audits').update({ status: 'running', stage: 'crawl', updated_at: new Date().toISOString() }).eq('id', auditId);
    const result = await runAudit(url, competitors, updateStage);
    await db
      .from('seo_audits')
      .update({
        status: 'done',
        stage: 'done',
        overall_score: result.data.overallScore,
        geo_score: result.data.geoScore,
        visibility_pct: result.data.visibilityPct,
        projected_score: result.data.optimizationPlan?.projectedOverallScore ?? null,
        mobile_speed_score: result.data.technical.mobileSpeedScore,
        result_json: result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auditId);
    return { ok: true, overallScore: result.data.overallScore ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await db
      .from('seo_audits')
      .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', auditId);
    return { ok: false, error: message };
  }
}

/** Shared-secret check for internal (cron → worker) calls. */
export function isInternalCall(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

/**
 * Week-over-week digest rows from audit history. Pure — unit tested.
 * `audits` must be done-status rows for the relevant clients.
 */
export interface DigestAudit {
  domain: string;
  created_at: string;
  overall_score: number | null;
  geo_score: number | null;
  visibility_pct: number | null;
}
export interface DigestRow {
  domain: string;
  latest: { overall: number | null; geo: number | null; visibility: number | null; at: string } | null;
  delta: { overall: number | null; geo: number | null; visibility: number | null };
  alert: string | null;
}

export function buildDigest(audits: DigestAudit[], domains: string[], now: Date = new Date()): DigestRow[] {
  const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  return domains.map((domain) => {
    const rows = audits
      .filter((a) => a.domain === domain)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = rows[0] ?? null;
    // Baseline = newest audit at least ~6 days older than the latest one.
    const baseline = latest
      ? rows.find((a) => new Date(latest.created_at).getTime() - new Date(a.created_at).getTime() >= 6 * 24 * 3600 * 1000)
      : undefined;
    const d = (k: 'overall_score' | 'geo_score' | 'visibility_pct') =>
      latest && baseline && latest[k] != null && baseline[k] != null ? (latest[k] as number) - (baseline[k] as number) : null;
    const delta = { overall: d('overall_score'), geo: d('geo_score'), visibility: d('visibility_pct') };

    let alert: string | null = null;
    if (!latest || new Date(latest.created_at).getTime() < weekAgo) alert = 'No completed audit in the last 7 days';
    else if (delta.overall != null && delta.overall <= -5) alert = `SEO score dropped ${Math.abs(delta.overall)} pts`;
    else if (delta.visibility != null && delta.visibility <= -5) alert = `AI visibility dropped ${Math.abs(delta.visibility)} pts`;

    return {
      domain,
      latest: latest
        ? { overall: latest.overall_score, geo: latest.geo_score, visibility: latest.visibility_pct, at: latest.created_at }
        : null,
      delta,
      alert,
    };
  });
}
