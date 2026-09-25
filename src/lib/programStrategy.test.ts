import { describe, it, expect } from 'vitest';
import { buildStrategyBrief, ProgramStrategySchema } from './programStrategy';

const baseInput = {
  domain: 'totencarry.com',
  category: 'Luggage & Travel Bags',
  overallScore: 64,
  geoScore: 65,
  visibilityPct: 0,
  technicalIssues: ['No sitemap.xml found'],
  onPageIssues: ['Homepage has zero H1 tags'],
  geoIssues: ['Missing llms.txt'],
  citedDomains: ['travelandleisure.com', 'nytimes.com'],
  competitors: ['Away', 'Travelpro'],
  keywords: [{ keyword: 'carry on luggage', intent: 'transactional' }],
};

describe('buildStrategyBrief', () => {
  it('includes all scores and findings', () => {
    const brief = buildStrategyBrief({ ...baseInput, commerceScore: 40, projectedScore: 84 });
    expect(brief).toContain('SEO 64/100');
    expect(brief).toContain('AI visibility 0%');
    expect(brief).toContain('commerce 40/100');
    expect(brief).toContain('Projected SEO after fixes: 84/100');
    expect(brief).toContain('Away');
    expect(brief).toContain('travelandleisure.com');
    expect(brief).toContain('sitemap');
    expect(brief).toContain('carry on luggage');
  });

  it('omits empty finding lines and handles null scores', () => {
    const brief = buildStrategyBrief({
      domain: 'x.com',
      overallScore: null,
      geoScore: null,
      visibilityPct: null,
      technicalIssues: [],
      onPageIssues: [],
      geoIssues: [],
      citedDomains: [],
      competitors: [],
      keywords: [],
    });
    expect(brief).toContain('SEO n/a/100');
    expect(brief).not.toContain('Technical issues');
    expect(brief).not.toContain('Keyword opportunities');
  });

  it('surfaces top per-section fixes from sectionSolutions', () => {
    const brief = buildStrategyBrief({
      ...baseInput,
      sectionSolutions: {
        visibility: {
          problems: ['p'],
          solutions: [{ title: 'Launch llms.txt', steps: ['s'], effort: 'low', impact: 'high' }],
          roadmap: [{ phase: 'Now', focus: 'f' }],
        },
      },
    });
    expect(brief).toContain('visibility: Launch llms.txt');
  });
});

describe('ProgramStrategySchema', () => {
  const initiative = {
    title: 'Deploy llms.txt',
    priority: 'P0',
    effort: 'low',
    impact: 'high',
    timeframe: 'Week 1',
    successMetric: 'AI crawler hits > 0',
  };
  const valid = {
    northStar: 'Reach 15% AI visibility in 90 days',
    currentState: ['0% visibility', 'SEO 64/100'],
    workstreams: [
      { name: 'GEO', objective: 'o', kpi: 'visibility %', initiatives: [initiative] },
      { name: 'Technical', objective: 'o', kpi: 'score', initiatives: [initiative] },
      { name: 'PR', objective: 'o', kpi: 'citations', initiatives: [initiative] },
    ],
    phases: [
      { name: 'Foundation', timeframe: 'Days 0-30', goals: ['g'], milestones: ['m'], kpiTargets: ['k'] },
      { name: 'Growth', timeframe: 'Days 30-90', goals: ['g'], milestones: ['m'], kpiTargets: ['k'] },
    ],
    measurement: { cadence: 'weekly', coreKpis: ['visibility %', 'SEO score'] },
  };

  it('accepts a valid strategy', () => {
    expect(ProgramStrategySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects bad priority and too-few workstreams', () => {
    expect(
      ProgramStrategySchema.safeParse({
        ...valid,
        workstreams: [{ ...valid.workstreams[0], initiatives: [{ ...initiative, priority: 'P9' }] }],
      }).success,
    ).toBe(false);
    expect(
      ProgramStrategySchema.safeParse({ ...valid, workstreams: valid.workstreams.slice(0, 2) }).success,
    ).toBe(false);
  });
});

describe('normalizeStrategy (loose model output → strict schema)', () => {
  const init = (p: string, dep = '') => ({
    title: `t-${p}`, priority: p, effort: 'low', impact: 'high', timeframe: 'Week 1', successMetric: 'm', dependsOn: dep,
  });
  const ws = (n: number) => ({ name: `w${n}`, objective: 'o', kpi: 'k', initiatives: [init('P1'), init('P0', 'x'), init('P2'), init('P1'), init('P2')] });
  const phase = (n: number) => ({ name: `p${n}`, timeframe: 'Days', goals: ['a', 'b', 'c', 'd'], milestones: ['m'], kpiTargets: ['k'] });

  it('clamps over-long arrays to the strict limits and validates', async () => {
    const { normalizeStrategy } = await import('./programStrategy');
    const out = normalizeStrategy({
      northStar: 'n',
      currentState: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      workstreams: [ws(1), ws(2), ws(3), ws(4), ws(5), ws(6)],
      phases: [phase(1), phase(2), phase(3), phase(4)],
      measurement: { cadence: 'weekly', coreKpis: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
    });
    expect(out).not.toBeNull();
    expect(out!.currentState).toHaveLength(5);
    expect(out!.workstreams).toHaveLength(5);
    expect(out!.workstreams[0].initiatives).toHaveLength(4);
    expect(out!.phases).toHaveLength(3);
    expect(out!.phases[0].goals).toHaveLength(3);
    expect(out!.measurement.coreKpis).toHaveLength(6);
  });

  it('turns empty dependsOn into undefined and keeps real ones', async () => {
    const { normalizeStrategy } = await import('./programStrategy');
    const out = normalizeStrategy({
      northStar: 'n', currentState: ['a', 'b'],
      workstreams: [ws(1), ws(2), ws(3)], phases: [phase(1), phase(2)],
      measurement: { cadence: 'c', coreKpis: ['a', 'b'] },
    });
    expect(out!.workstreams[0].initiatives[0].dependsOn).toBeUndefined();
    expect(out!.workstreams[0].initiatives[1].dependsOn).toBe('x');
  });

  it('returns null when under the strict minimums (too few workstreams)', async () => {
    const { normalizeStrategy } = await import('./programStrategy');
    expect(normalizeStrategy({
      northStar: 'n', currentState: ['a', 'b'], workstreams: [ws(1)], phases: [phase(1), phase(2)],
      measurement: { cadence: 'c', coreKpis: ['a', 'b'] },
    })).toBeNull();
  });
});
