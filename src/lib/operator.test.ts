import { describe, it, expect } from 'vitest';
import { isOperatorEmail } from './operator';

describe('isOperatorEmail', () => {
  it('rejects missing email', () => {
    expect(isOperatorEmail(undefined, 'a@x.com')).toBe(false);
    expect(isOperatorEmail(null, 'a@x.com')).toBe(false);
  });
  it('matches allowlist case-insensitively with whitespace', () => {
    expect(isOperatorEmail('Barron@X.com', ' a@x.com , barron@x.com ')).toBe(true);
    expect(isOperatorEmail('eve@x.com', 'a@x.com,barron@x.com')).toBe(false);
  });
  it('denies everyone when the allowlist is unset or empty (fail closed)', () => {
    expect(isOperatorEmail('a@x.com', undefined)).toBe(false);
    expect(isOperatorEmail('a@x.com', '  ')).toBe(false);
  });
});
