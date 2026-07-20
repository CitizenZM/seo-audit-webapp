import { describe, it, expect } from 'vitest';
import { personaTopicHeatmap, distributeAcrossTargets, type PromptResult } from '@/lib/visibility';

function mkPrompt(overrides: Partial<PromptResult>): PromptResult {
  return {
    prompt: 'p',
    persona: 'General buyer',
    topic: 'Best in category',
    model: 'test-model',
    mentioned: false,
    brands: [],
    citations: [],
    ...overrides,
  };
}

describe('personaTopicHeatmap', () => {
  it('returns empty personas/topics/cells for no prompts', () => {
    const h = personaTopicHeatmap({ prompts: [] });
    expect(h.personas).toEqual([]);
    expect(h.topics).toEqual([]);
    expect(h.cells).toEqual([]);
  });

  it('computes visibility pct per persona/topic cell', () => {
    const prompts: PromptResult[] = [
      mkPrompt({ persona: 'Jetsetter', topic: 'Best in category', mentioned: true }),
      mkPrompt({ persona: 'Jetsetter', topic: 'Best in category', mentioned: false }),
      mkPrompt({ persona: 'Jetsetter', topic: 'Comparison', mentioned: true }),
      mkPrompt({ persona: 'Commuter', topic: 'Best in category', mentioned: false }),
    ];
    const h = personaTopicHeatmap({ prompts });
    expect(h.personas).toEqual(['Jetsetter', 'Commuter']);
    expect(h.topics).toEqual(['Best in category', 'Comparison']);
    expect(h.cells).toHaveLength(3);

    const jetsetterBest = h.cells.find((c) => c.persona === 'Jetsetter' && c.topic === 'Best in category');
    expect(jetsetterBest).toEqual({ persona: 'Jetsetter', topic: 'Best in category', visibilityPct: 50, prompts: 2 });

    const jetsetterCompare = h.cells.find((c) => c.persona === 'Jetsetter' && c.topic === 'Comparison');
    expect(jetsetterCompare?.visibilityPct).toBe(100);

    const commuterBest = h.cells.find((c) => c.persona === 'Commuter' && c.topic === 'Best in category');
    expect(commuterBest?.visibilityPct).toBe(0);
  });

  it('handles persona/topic labels containing delimiter-like characters without collision', () => {
    const prompts: PromptResult[] = [
      mkPrompt({ persona: 'A B', topic: 'C', mentioned: true }),
      mkPrompt({ persona: 'A', topic: 'B C', mentioned: false }),
    ];
    const h = personaTopicHeatmap({ prompts });
    expect(h.cells).toHaveLength(2);
    const cell1 = h.cells.find((c) => c.persona === 'A B' && c.topic === 'C');
    const cell2 = h.cells.find((c) => c.persona === 'A' && c.topic === 'B C');
    expect(cell1?.visibilityPct).toBe(100);
    expect(cell2?.visibilityPct).toBe(0);
  });
});

describe('distributeAcrossTargets', () => {
  it('returns empty array when there are no targets', () => {
    expect(distributeAcrossTargets([1, 2, 3], [])).toEqual([]);
  });

  it('round-robins prompts across targets, one assignment per prompt', () => {
    const plan = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const targets = ['engineA', 'engineB'];
    const assigned = distributeAcrossTargets(plan, targets);
    expect(assigned).toHaveLength(plan.length);
    expect(assigned.map((a) => a.prompt)).toEqual(plan);
    expect(assigned.map((a) => a.target)).toEqual(['engineA', 'engineB', 'engineA', 'engineB', 'engineA']);
  });

  it('assigns every prompt to the single target when only one engine is configured', () => {
    const plan = ['p1', 'p2', 'p3'];
    const targets = ['onlyEngine'];
    const assigned = distributeAcrossTargets(plan, targets);
    expect(assigned.every((a) => a.target === 'onlyEngine')).toBe(true);
  });
});
