import { describe, it, expect } from 'vitest';
import { parseClaimsResponse } from '@/lib/claimsAccuracy';

describe('parseClaimsResponse', () => {
  it('parses a well-formed claims JSON payload', () => {
    const raw = JSON.stringify({
      claims: [
        { claim: 'Offers free shipping over $50', verdict: 'supported', evidence: 'Site says free shipping over $50' },
        { claim: 'Founded in 1995', verdict: 'contradicted', evidence: 'Site says founded in 2010' },
        { claim: 'Has a store in Paris', verdict: 'unverifiable' },
      ],
    });
    const claims = parseClaimsResponse(raw);
    expect(claims).toHaveLength(3);
    expect(claims?.[0]).toEqual({
      claim: 'Offers free shipping over $50',
      verdict: 'supported',
      evidence: 'Site says free shipping over $50',
    });
    expect(claims?.[2]).toEqual({ claim: 'Has a store in Paris', verdict: 'unverifiable' });
  });

  it('handles prose-wrapped or fenced JSON', () => {
    const raw = 'Here you go:\n```json\n{"claims":[{"claim":"x","verdict":"supported"}]}\n```';
    const claims = parseClaimsResponse(raw);
    expect(claims).toEqual([{ claim: 'x', verdict: 'supported' }]);
  });

  it('drops entries with invalid verdicts', () => {
    const raw = JSON.stringify({
      claims: [
        { claim: 'ok', verdict: 'supported' },
        { claim: 'bad verdict', verdict: 'maybe' },
      ],
    });
    const claims = parseClaimsResponse(raw);
    expect(claims).toEqual([{ claim: 'ok', verdict: 'supported' }]);
  });

  it('returns null for unparseable text', () => {
    expect(parseClaimsResponse('not json at all')).toBeNull();
  });

  it('returns null when claims field is missing', () => {
    expect(parseClaimsResponse(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('caps claims at 20', () => {
    const claims = Array.from({ length: 30 }, (_, i) => ({ claim: `c${i}`, verdict: 'supported' }));
    const raw = JSON.stringify({ claims });
    const parsed = parseClaimsResponse(raw);
    expect(parsed).toHaveLength(20);
  });
});
