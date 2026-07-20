import { describe, it, expect } from 'vitest';
import { sanitizeBranding } from './branding';

describe('sanitizeBranding', () => {
  it('returns {} for non-object input', () => {
    expect(sanitizeBranding(null)).toEqual({});
    expect(sanitizeBranding(undefined)).toEqual({});
    expect(sanitizeBranding('nope')).toEqual({});
    expect(sanitizeBranding(42)).toEqual({});
  });

  it('returns {} for an empty object', () => {
    expect(sanitizeBranding({})).toEqual({});
  });

  it('passes through valid fields', () => {
    const result = sanitizeBranding({
      agencyName: 'Acme SEO Co',
      logoUrl: 'https://cdn.example.com/logo.png',
      accentColor: '#16a34a',
      contactEmail: 'hello@acme.io',
      hidePoweredBy: true,
    });
    expect(result).toEqual({
      agencyName: 'Acme SEO Co',
      logoUrl: 'https://cdn.example.com/logo.png',
      accentColor: '#16a34a',
      contactEmail: 'hello@acme.io',
      hidePoweredBy: true,
    });
  });

  it('trims agencyName', () => {
    expect(sanitizeBranding({ agencyName: '  Acme  ' })).toEqual({ agencyName: 'Acme' });
  });

  it('accepts 3-digit and 6-digit hex accent colors', () => {
    expect(sanitizeBranding({ accentColor: '#fff' })).toEqual({ accentColor: '#fff' });
    expect(sanitizeBranding({ accentColor: '#ffAA00' })).toEqual({ accentColor: '#ffAA00' });
  });

  it('drops an invalid accent color but keeps other valid fields', () => {
    const result = sanitizeBranding({ agencyName: 'Acme', accentColor: 'not-a-color' });
    expect(result).toEqual({ agencyName: 'Acme' });
  });

  it('drops a non-https logoUrl', () => {
    expect(sanitizeBranding({ logoUrl: 'http://insecure.example.com/logo.png' })).toEqual({});
    expect(sanitizeBranding({ logoUrl: 'javascript:alert(1)' })).toEqual({});
    expect(sanitizeBranding({ logoUrl: 'not a url' })).toEqual({});
  });

  it('drops an invalid contactEmail', () => {
    expect(sanitizeBranding({ contactEmail: 'not-an-email' })).toEqual({});
  });

  it('rejects an agencyName over the length cap', () => {
    const long = 'a'.repeat(81);
    expect(sanitizeBranding({ agencyName: long })).toEqual({});
  });

  it('accepts an agencyName at the length cap', () => {
    const max = 'a'.repeat(80);
    expect(sanitizeBranding({ agencyName: max })).toEqual({ agencyName: max });
  });

  it('ignores unknown keys', () => {
    expect(sanitizeBranding({ agencyName: 'Acme', evil: '<script>' })).toEqual({ agencyName: 'Acme' });
  });

  it('ignores non-boolean hidePoweredBy', () => {
    expect(sanitizeBranding({ hidePoweredBy: 'yes' })).toEqual({});
  });

  it('treats empty strings as absent', () => {
    expect(sanitizeBranding({ agencyName: '', logoUrl: '' })).toEqual({});
  });
});
