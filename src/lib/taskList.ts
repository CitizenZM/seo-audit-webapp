/**
 * SEO/GEO task list engine — the "agent" layer between an audit and the
 * work. Turns every actionable finding (page issues, GEO/commerce checks,
 * per-section solutions, Program Strategy initiatives) into a trackable
 * task, and reconciles tasks across audits so the list is closed-loop:
 *
 *  - stable dedupe keys → a weekly re-audit updates tasks, never duplicates
 *  - auto-verifiable tasks (deterministic checks) close themselves as
 *    verified when the finding disappears from a fresh audit, and reopen
 *    as regressions if it comes back
 *  - absence of evidence isn't evidence: page-issue tasks are never
 *    auto-closed from a blocked/empty crawl
 *  - AI-suggestion tasks the operator hasn't touched are replaced by the
 *    latest audit's suggestions; engaged ones (in progress / done) are kept
 *
 * Pure functions; DB application lives in taskSync.ts.
 */

export type Track = 'seo' | 'geo';
export type TaskSource = 'page-issue' | 'geo-check' | 'section' | 'strategy';
export type Priority = 'P0' | 'P1' | 'P2';
export type Level = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'dismissed';

export interface TaskDraft {
  dedupeKey: string;
  track: Track;
  source: TaskSource;
  section?: string;
  title: string;
  detail?: string;
  priority: Priority;
  effort?: Level;
  impact?: Level;
  autoVerifiable: boolean;
  verify?: string;
  affectedUrls: string[];
  affectedCount: number;
}

/** Sections whose findings are about AI-answer visibility rather than classic SEO. */
const GEO_SECTIONS = new Set([
  'visibility', 'persona-heatmap', 'sentiment-drivers', 'claims-accuracy',
  'citations', 'citation-gap', 'geo', 'commerce-readiness',
]);

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';

const severityToPriority = (s: string): Priority => (s === 'critical' ? 'P0' : s === 'high' ? 'P1' : 'P2');
const isLevel = (v: unknown): v is Level => v === 'low' || v === 'medium' || v === 'high';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function buildTaskList(data: any): TaskDraft[] {
  const out = new Map<string, TaskDraft>();
  const add = (t: TaskDraft) => { if (!out.has(t.dedupeKey)) out.set(t.dedupeKey, t); };

  // 1. Page-level technical issues (deterministic → auto-verifiable).
  for (const issue of data?.siteCrawl?.issues ?? []) {
    if (!issue?.id) continue;
    add({
      dedupeKey: `issue:${issue.id}`,
      track: 'seo',
      source: 'page-issue',
      title: issue.title ?? issue.id,
      detail: issue.fix,
      priority: severityToPriority(issue.severity),
      autoVerifiable: true,
      verify: 'Re-audit: issue no longer detected on any crawled page',
      affectedUrls: (issue.affectedUrls ?? []).slice(0, 20),
      affectedCount: issue.count ?? (issue.affectedUrls ?? []).length,
    });
  }

  // 2. GEO readiness — failing commerce checks + technical GEO recommendations.
  for (const c of data?.geo?.commerce?.checks ?? []) {
    if (!c || c.passed) continue;
    add({
      dedupeKey: `commerce:${c.id}`,
      track: 'geo',
      source: 'geo-check',
      section: 'commerce-readiness',
      title: `Fix: ${c.label}`,
      detail: c.detail,
      priority: c.impact === 'high' ? 'P1' : 'P2',
      impact: isLevel(c.impact) ? c.impact : undefined,
      autoVerifiable: true,
      verify: 'Re-audit: commerce readiness check passes',
      affectedUrls: [],
      affectedCount: 1,
    });
  }
  for (const rec of data?.geo?.recommendations ?? []) {
    if (typeof rec !== 'string' || !rec.trim()) continue;
    add({
      dedupeKey: `geo:${slug(rec)}`,
      track: 'geo',
      source: 'geo-check',
      section: 'geo',
      title: rec.length > 120 ? `${rec.slice(0, 117)}…` : rec,
      detail: rec,
      priority: 'P1',
      autoVerifiable: true,
      verify: 'Re-audit: recommendation no longer raised by the GEO check',
      affectedUrls: [],
      affectedCount: 1,
    });
  }

  // 3. Per-section AI solutions.
  for (const [section, sol] of Object.entries<any>(data?.sectionSolutions ?? {})) {
    for (const s of sol?.solutions ?? []) {
      if (!s?.title) continue;
      const priority: Priority = s.impact === 'high' && s.effort !== 'high' ? 'P1' : 'P2';
      add({
        dedupeKey: `section:${section}:${slug(s.title)}`,
        track: GEO_SECTIONS.has(section) ? 'geo' : 'seo',
        source: 'section',
        section,
        title: s.title,
        detail: (s.steps ?? []).map((st: string, i: number) => `${i + 1}. ${st}`).join('\n'),
        priority,
        effort: isLevel(s.effort) ? s.effort : undefined,
        impact: isLevel(s.impact) ? s.impact : undefined,
        autoVerifiable: false,
        verify: (sol?.problems ?? [])[0] ? `Resolves: ${sol.problems[0]}` : undefined,
        affectedUrls: [],
        affectedCount: 0,
      });
    }
  }

  // 4. Program Strategy initiatives.
  for (const ws of data?.programStrategy?.workstreams ?? []) {
    const geoStream = /geo|ai|citation|visib|llm|answer/i.test(`${ws?.name ?? ''} ${ws?.kpi ?? ''}`);
    for (const i of ws?.initiatives ?? []) {
      if (!i?.title) continue;
      add({
        dedupeKey: `strategy:${slug(i.title)}`,
        track: geoStream ? 'geo' : 'seo',
        source: 'strategy',
        section: ws.name,
        title: i.title,
        detail: [i.timeframe && `Timeframe: ${i.timeframe}`, i.dependsOn && `Depends on: ${i.dependsOn}`].filter(Boolean).join('\n') || undefined,
        priority: i.priority === 'P0' || i.priority === 'P1' ? i.priority : 'P2',
        effort: isLevel(i.effort) ? i.effort : undefined,
        impact: isLevel(i.impact) ? i.impact : undefined,
        autoVerifiable: false,
        verify: i.successMetric,
        affectedUrls: [],
        affectedCount: 0,
      });
    }
  }

  const order: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };
  return [...out.values()].sort((a, b) => order[a.priority] - order[b.priority]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ExistingTask {
  id: string;
  dedupeKey: string;
  source: TaskSource;
  status: TaskStatus;
  autoVerifiable: boolean;
}

export interface ReconcilePlan {
  insert: TaskDraft[];
  update: { id: string; draft: TaskDraft; reopen: boolean }[];
  /** Auto-verified: finding gone from the fresh audit → status done + verified_at. */
  verifyDone: string[];
  /** Untouched AI suggestions superseded by the fresh audit. */
  remove: string[];
}

export function reconcileTasks(
  existing: ExistingTask[],
  fresh: TaskDraft[],
  opts: { crawlTrusted: boolean },
): ReconcilePlan {
  const freshByKey = new Map(fresh.map((t) => [t.dedupeKey, t]));
  const existingByKey = new Map(existing.map((t) => [t.dedupeKey, t]));
  const plan: ReconcilePlan = { insert: [], update: [], verifyDone: [], remove: [] };

  for (const draft of fresh) {
    const cur = existingByKey.get(draft.dedupeKey);
    if (!cur) plan.insert.push(draft);
    // Regression: a task we verified done has resurfaced. Dismissed stays dismissed.
    else plan.update.push({ id: cur.id, draft, reopen: cur.status === 'done' && draft.autoVerifiable });
  }

  for (const cur of existing) {
    if (freshByKey.has(cur.dedupeKey)) continue;
    const open = cur.status === 'todo' || cur.status === 'in_progress';
    if (cur.autoVerifiable) {
      if (!open) continue;
      // Page issues need a trustworthy crawl to prove absence; GEO checks don't use the crawl.
      if (cur.source === 'page-issue' && !opts.crawlTrusted) continue;
      plan.verifyDone.push(cur.id);
    } else if (cur.status === 'todo') {
      plan.remove.push(cur.id);
    }
  }
  return plan;
}
