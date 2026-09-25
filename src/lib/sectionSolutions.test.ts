import { describe, it, expect } from 'vitest';
import { buildFindings, SectionSolutionSchema } from './sectionSolutions';

describe('buildFindings', () => {
  it('returns empty object for empty audit', () => {
    expect(buildFindings({ domain: 'x.com' })).toEqual({});
  });

  it('compacts visibility with rivals', () => {
    const f = buildFindings({
      domain: 'x.com',
      visibility: {
        visibilityPct: 0,
        totalPrompts: 8,
        targetBrand: 'Tote&Carry',
        leaderboard: [
          { brand: 'Away', visibilityPct: 100, isYou: false },
          { brand: 'Tote&Carry', visibilityPct: 0, isYou: true },
        ],
      },
    });
    expect(f.visibility).toContain('0% of 8');
    expect(f.visibility).toContain('Away 100%');
    expect(f.visibility).not.toContain('Tote&Carry 0%');
  });

  it('picks weakest heatmap cells and flags unsupported claims', () => {
    const f = buildFindings({
      domain: 'x.com',
      visibilityExtras: {
        heatmap: {
          cells: [
            { persona: 'A', topic: 't1', visibilityPct: 80 },
            { persona: 'B', topic: 't2', visibilityPct: 0 },
          ],
        },
        claims: {
          claims: [
            { claim: 'ships worldwide', verdict: 'contradicted' },
            { claim: 'founded 2015', verdict: 'supported' },
          ],
        },
      },
    });
    expect(f['persona-heatmap']).toMatch(/^Weakest.*B\/t2 0%/);
    expect(f['claims-accuracy']).toContain('1 not supported');
    expect(f['claims-accuracy']).toContain('contradicted');
  });

  it('includes commerce failing checks and technical issues', () => {
    const f = buildFindings({
      domain: 'x.com',
      geo: {
        score: 65,
        recommendations: ['Add llms.txt'],
        commerce: {
          score: 40,
          checks: [
            { label: 'Product schema', passed: false, impact: 'high' },
            { label: 'HTTPS', passed: true, impact: 'low' },
          ],
        },
      },
      technicalIssues: ['No sitemap.xml found'],
    });
    expect(f.geo).toContain('65/100');
    expect(f['commerce-readiness']).toContain('Product schema (high)');
    expect(f['commerce-readiness']).not.toContain('HTTPS');
    expect(f.technical).toContain('sitemap');
  });
});

describe('SectionSolutionSchema', () => {
  it('accepts a valid solution and rejects bad enums', () => {
    const good = {
      problems: ['p'],
      solutions: [{ title: 't', steps: ['s1'], effort: 'low', impact: 'high' }],
      roadmap: [{ phase: 'Now', focus: 'f' }],
    };
    expect(SectionSolutionSchema.safeParse(good).success).toBe(true);
    expect(
      SectionSolutionSchema.safeParse({ ...good, solutions: [{ title: 't', steps: [], effort: 'low', impact: 'high' }] }).success,
    ).toBe(false);
    expect(
      SectionSolutionSchema.safeParse({ ...good, roadmap: [{ phase: 'someday', focus: 'f' }] }).success,
    ).toBe(false);
  });
});

describe('normalizeSections (loose model output → strict per-section map)', () => {
  const sec = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    problems: ['p1', 'p2', 'p3', 'p4'],
    solutions: [
      { title: 's1', steps: ['a', 'b', 'c', 'd', 'e'], effort: 'low', impact: 'high' },
      { title: 's2', steps: ['a'], effort: 'medium', impact: 'medium' },
      { title: 's3', steps: ['a'], effort: 'high', impact: 'low' },
      { title: 's4', steps: ['a'], effort: 'low', impact: 'low' },
    ],
    roadmap: [
      { phase: 'Now', focus: 'f' }, { phase: '30 days', focus: 'f' }, { phase: '90 days', focus: 'f' }, { phase: 'Now', focus: 'x' },
    ],
    ...extra,
  });

  it('keys by id, clamps arrays, and keeps only requested sections', async () => {
    const { normalizeSections } = await import('./sectionSolutions');
    const out = normalizeSections({ sections: [sec('geo'), sec('technical'), sec('bogus')] }, ['geo', 'technical']);
    expect(Object.keys(out).sort()).toEqual(['geo', 'technical']);
    expect(out.geo.problems).toHaveLength(3);
    expect(out.geo.solutions).toHaveLength(3);
    expect(out.geo.solutions[0].steps).toHaveLength(4);
    expect(out.geo.roadmap).toHaveLength(3);
  });

  it('drops a section that fails strict validation without losing the others', async () => {
    const { normalizeSections } = await import('./sectionSolutions');
    const out = normalizeSections({ sections: [sec('geo', { solutions: [] }), sec('technical')] }, ['geo', 'technical']);
    expect(Object.keys(out)).toEqual(['technical']);
  });

  it('accepts the legacy keyed-object shape from the CLI path', async () => {
    const { normalizeSections } = await import('./sectionSolutions');
    const { id: _id, ...body } = sec('geo');
    void _id;
    const out = normalizeSections({ geo: body }, ['geo']);
    expect(out.geo?.solutions).toHaveLength(3);
  });

  it('returns {} for garbage', async () => {
    const { normalizeSections } = await import('./sectionSolutions');
    expect(normalizeSections(null, ['geo'])).toEqual({});
    expect(normalizeSections('x', ['geo'])).toEqual({});
  });
});
