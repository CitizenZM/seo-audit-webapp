import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTaskList, reconcileTasks, type ExistingTask, type TaskDraft } from '@/lib/taskList';

/**
 * Apply an audit's findings to the persistent seo_tasks list (see
 * taskList.ts for the reconciliation rules). Called when an audit job
 * completes, and on demand for backfilling from a stored audit. Returns a
 * summary; never throws (task sync must not fail an audit).
 */
export interface TaskSyncSummary {
  ok: boolean;
  inserted: number;
  updated: number;
  reopened: number;
  verifiedDone: number;
  removed: number;
  error?: string;
}

const row = (d: TaskDraft) => ({
  track: d.track,
  source: d.source,
  section: d.section ?? null,
  title: d.title,
  detail: d.detail ?? null,
  priority: d.priority,
  effort: d.effort ?? null,
  impact: d.impact ?? null,
  auto_verifiable: d.autoVerifiable,
  verify: d.verify ?? null,
  affected_urls: d.affectedUrls,
  affected_count: d.affectedCount,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function syncTasksForAudit(
  db: SupabaseClient,
  args: { auditId: string; domain: string; clientId: string | null; data: any },
): Promise<TaskSyncSummary> {
  const empty = { inserted: 0, updated: 0, reopened: 0, verifiedDone: 0, removed: 0 };
  try {
    const fresh = buildTaskList(args.data);
    const { data: existingRows, error } = await db
      .from('seo_tasks')
      .select('id, dedupe_key, source, status, auto_verifiable')
      .eq('domain', args.domain);
    if (error) return { ok: false, ...empty, error: error.message };

    const existing: ExistingTask[] = (existingRows ?? []).map((r: any) => ({
      id: r.id,
      dedupeKey: r.dedupe_key,
      source: r.source,
      status: r.status,
      autoVerifiable: r.auto_verifiable,
    }));

    const crawl = args.data?.siteCrawl;
    const crawlTrusted = Boolean(crawl && !crawl.botBlocked && (crawl.summary?.pagesCrawled ?? 0) > 0);
    const plan = reconcileTasks(existing, fresh, { crawlTrusted });
    const now = new Date().toISOString();

    if (plan.insert.length) {
      const { error: e } = await db.from('seo_tasks').insert(
        plan.insert.map((d) => ({
          ...row(d),
          domain: args.domain,
          client_id: args.clientId,
          dedupe_key: d.dedupeKey,
          first_audit_id: args.auditId,
          last_audit_id: args.auditId,
        })),
      );
      if (e) return { ok: false, ...empty, error: e.message };
    }

    for (const u of plan.update) {
      await db
        .from('seo_tasks')
        .update({
          ...row(u.draft),
          last_audit_id: args.auditId,
          updated_at: now,
          ...(u.reopen ? { status: 'todo', verified_at: null } : {}),
        })
        .eq('id', u.id);
    }

    if (plan.verifyDone.length) {
      await db.from('seo_tasks').update({ status: 'done', verified_at: now, last_audit_id: args.auditId, updated_at: now }).in('id', plan.verifyDone);
    }
    if (plan.remove.length) {
      await db.from('seo_tasks').delete().in('id', plan.remove);
    }

    return {
      ok: true,
      inserted: plan.insert.length,
      updated: plan.update.length,
      reopened: plan.update.filter((u) => u.reopen).length,
      verifiedDone: plan.verifyDone.length,
      removed: plan.remove.length,
    };
  } catch (e) {
    return { ok: false, ...empty, error: e instanceof Error ? e.message : 'task sync failed' };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
