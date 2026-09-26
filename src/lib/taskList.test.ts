import { describe, it, expect } from 'vitest';
import { buildTaskList, reconcileTasks, type TaskDraft, type ExistingTask } from './taskList';

const audit = {
  siteCrawl: {
    summary: { pagesCrawled: 120 },
    botBlocked: false,
    issues: [
      { id: 'MISSING_META', severity: 'high', title: 'Missing meta descriptions', affectedUrls: ['https://a.com/x'], count: 12, fix: 'Write 120-160 char metas.' },
      { id: 'NO_JSONLD', severity: 'medium', title: 'No structured data', affectedUrls: [], count: 40, fix: 'Add JSON-LD.' },
      { id: 'SERVER_ERROR', severity: 'critical', title: '5xx pages', affectedUrls: ['https://a.com/y'], count: 1, fix: 'Fix server errors.' },
    ],
  },
  geo: {
    recommendations: ['Add an llms.txt file at the site root.'],
    commerce: { checks: [
      { id: 'product-schema', label: 'Product schema', passed: false, detail: 'No Product JSON-LD', impact: 'high' },
      { id: 'https', label: 'HTTPS', passed: true, detail: '', impact: 'low' },
    ] },
  },
  sectionSolutions: {
    'citation-gap': { problems: ['p'], solutions: [{ title: 'Pitch Wirecutter', steps: ['Email editor', 'Send samples'], effort: 'medium', impact: 'high' }], roadmap: [] },
    technical: { problems: ['p'], solutions: [{ title: 'Ship sitemap', steps: ['Generate'], effort: 'low', impact: 'high' }], roadmap: [] },
  },
  programStrategy: {
    workstreams: [
      { name: 'AI Visibility (GEO)', objective: 'o', kpi: 'k', initiatives: [
        { title: 'Launch FAQ hub', priority: 'P0', effort: 'medium', impact: 'high', timeframe: 'Week 1', successMetric: 'Cited in 2+ AI answers' },
      ] },
      { name: 'Technical SEO', objective: 'o', kpi: 'k', initiatives: [
        { title: 'Fix titles', priority: 'P2', effort: 'low', impact: 'medium', timeframe: 'Week 2', successMetric: 'All titles < 60 chars' },
      ] },
    ],
  },
};

describe('buildTaskList', () => {
  const tasks = buildTaskList(audit);
  const byKey = Object.fromEntries(tasks.map((t) => [t.dedupeKey, t]));

  it('turns page issues into auto-verifiable SEO tasks with severity → priority', () => {
    expect(byKey['issue:SERVER_ERROR']).toMatchObject({ track: 'seo', source: 'page-issue', priority: 'P0', autoVerifiable: true });
    expect(byKey['issue:MISSING_META']).toMatchObject({ priority: 'P1', affectedCount: 12, detail: 'Write 120-160 char metas.' });
    expect(byKey['issue:NO_JSONLD'].priority).toBe('P2');
  });

  it('turns failing GEO / commerce checks into GEO tasks and skips passing ones', () => {
    expect(byKey['commerce:product-schema']).toMatchObject({ track: 'geo', source: 'geo-check', priority: 'P1', autoVerifiable: true });
    expect(byKey['commerce:https']).toBeUndefined();
    expect(tasks.some((t) => t.source === 'geo-check' && /llms\.txt/.test(t.title))).toBe(true);
  });

  it('maps section solutions to the right track and keeps steps in the detail', () => {
    const gap = tasks.find((t) => t.section === 'citation-gap')!;
    expect(gap).toMatchObject({ track: 'geo', source: 'section', autoVerifiable: false, effort: 'medium', impact: 'high' });
    expect(gap.detail).toContain('Email editor');
    expect(tasks.find((t) => t.section === 'technical')!.track).toBe('seo');
  });

  it('maps strategy initiatives with their priority, track and success metric as the verify criterion', () => {
    const faq = tasks.find((t) => t.title === 'Launch FAQ hub')!;
    expect(faq).toMatchObject({ source: 'strategy', track: 'geo', priority: 'P0', verify: 'Cited in 2+ AI answers' });
    expect(tasks.find((t) => t.title === 'Fix titles')!.track).toBe('seo');
  });

  it('produces unique dedupe keys and tolerates an empty audit', () => {
    expect(new Set(tasks.map((t) => t.dedupeKey)).size).toBe(tasks.length);
    expect(buildTaskList({})).toEqual([]);
  });
});

const existing = (over: Partial<ExistingTask>): ExistingTask => ({
  id: over.dedupeKey ?? 'id', dedupeKey: 'k', source: 'page-issue', status: 'todo', autoVerifiable: true, ...over,
});
const draft = (key: string, source: TaskDraft['source'] = 'page-issue'): TaskDraft => ({
  dedupeKey: key, track: 'seo', source, title: key, priority: 'P1', autoVerifiable: source === 'page-issue' || source === 'geo-check',
  affectedUrls: [], affectedCount: 1,
});

describe('reconcileTasks', () => {
  it('inserts new, updates existing, and preserves the operator status', () => {
    const plan = reconcileTasks(
      [existing({ id: 'a', dedupeKey: 'issue:A', status: 'in_progress' })],
      [draft('issue:A'), draft('issue:B')],
      { crawlTrusted: true },
    );
    expect(plan.insert.map((t) => t.dedupeKey)).toEqual(['issue:B']);
    expect(plan.update).toEqual([{ id: 'a', draft: expect.objectContaining({ dedupeKey: 'issue:A' }), reopen: false }]);
  });

  it('auto-closes an open auto-verifiable task whose issue disappeared', () => {
    const plan = reconcileTasks([existing({ id: 'a', dedupeKey: 'issue:A' })], [], { crawlTrusted: true });
    expect(plan.verifyDone).toEqual(['a']);
  });

  it('does NOT auto-close page issues when the crawl was blocked/empty (absence of evidence)', () => {
    const plan = reconcileTasks([existing({ id: 'a', dedupeKey: 'issue:A' })], [], { crawlTrusted: false });
    expect(plan.verifyDone).toEqual([]);
  });

  it('still auto-closes geo checks on an untrusted crawl (they do not depend on the crawl)', () => {
    const plan = reconcileTasks([existing({ id: 'g', dedupeKey: 'commerce:x', source: 'geo-check' })], [], { crawlTrusted: false });
    expect(plan.verifyDone).toEqual(['g']);
  });

  it('reopens a verified-done task when the issue comes back (regression)', () => {
    const plan = reconcileTasks([existing({ id: 'a', dedupeKey: 'issue:A', status: 'done' })], [draft('issue:A')], { crawlTrusted: true });
    expect(plan.update).toEqual([{ id: 'a', draft: expect.anything(), reopen: true }]);
  });

  it('never reopens a dismissed task', () => {
    const plan = reconcileTasks([existing({ id: 'a', dedupeKey: 'issue:A', status: 'dismissed' })], [draft('issue:A')], { crawlTrusted: true });
    expect(plan.update[0].reopen).toBe(false);
  });

  it('replaces untouched AI suggestions but keeps ones the operator engaged with', () => {
    const plan = reconcileTasks(
      [
        existing({ id: 's1', dedupeKey: 'section:x:old', source: 'section', autoVerifiable: false, status: 'todo' }),
        existing({ id: 's2', dedupeKey: 'section:x:kept', source: 'section', autoVerifiable: false, status: 'in_progress' }),
      ],
      [draft('section:x:new', 'section')],
      { crawlTrusted: true },
    );
    expect(plan.remove).toEqual(['s1']);
    expect(plan.insert.map((t) => t.dedupeKey)).toEqual(['section:x:new']);
    expect(plan.verifyDone).toEqual([]);
  });
});
