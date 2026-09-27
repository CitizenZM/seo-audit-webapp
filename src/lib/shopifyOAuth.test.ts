import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  isValidShopDomain,
  buildAuthorizeUrl,
  verifyCallbackHmac,
  signState,
  verifyState,
  encryptSecret,
  decryptSecret,
  SHOPIFY_SCOPES,
} from './shopifyOAuth';

const KEY = crypto.randomBytes(32).toString('base64');

describe('isValidShopDomain', () => {
  it('accepts only *.myshopify.com hostnames', () => {
    expect(isValidShopDomain('1a049t-cy.myshopify.com')).toBe(true);
    expect(isValidShopDomain('evil.com')).toBe(false);
    expect(isValidShopDomain('x.myshopify.com.evil.com')).toBe(false);
    expect(isValidShopDomain('https://x.myshopify.com')).toBe(false);
    expect(isValidShopDomain('-bad.myshopify.com')).toBe(false);
  });
});

describe('buildAuthorizeUrl', () => {
  it('builds the documented authorize URL with least-privilege scopes', () => {
    const u = new URL(buildAuthorizeUrl({ shop: 's.myshopify.com', clientId: 'cid', redirectUri: 'https://app/cb', state: 'st' }));
    expect(u.origin + u.pathname).toBe('https://s.myshopify.com/admin/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('scope')).toBe(SHOPIFY_SCOPES);
    expect(SHOPIFY_SCOPES).toBe('write_products,write_files');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app/cb');
    expect(u.searchParams.get('state')).toBe('st');
  });
});

describe('verifyCallbackHmac', () => {
  const secret = 'shpss_test';
  const sign = (params: Record<string, string>) => {
    const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    return crypto.createHmac('sha256', secret).update(msg).digest('hex');
  };
  it('accepts a correctly signed callback and rejects tampering', () => {
    const p = { code: 'c1', shop: 's.myshopify.com', state: 'st', timestamp: String(Math.floor(Date.now() / 1000)) };
    const q = new URLSearchParams({ ...p, hmac: sign(p) });
    expect(verifyCallbackHmac(q, secret)).toBe(true);
    q.set('shop', 'other.myshopify.com');
    expect(verifyCallbackHmac(q, secret)).toBe(false);
  });
  it('rejects a missing or malformed hmac and a stale timestamp', () => {
    expect(verifyCallbackHmac(new URLSearchParams({ code: 'c', shop: 's.myshopify.com' }), secret)).toBe(false);
    const old = { code: 'c1', shop: 's.myshopify.com', state: 'st', timestamp: String(Math.floor(Date.now() / 1000) - 3600) };
    expect(verifyCallbackHmac(new URLSearchParams({ ...old, hmac: sign(old) }), secret)).toBe(false);
  });
});

describe('state', () => {
  it('round-trips the client slug and rejects tampering or expiry', () => {
    const s = signState('dark-fantasy', KEY);
    expect(verifyState(s, KEY)).toEqual({ clientSlug: 'dark-fantasy' });
    expect(verifyState(s.slice(0, -2) + 'xx', KEY)).toBeNull();
    const expired = signState('dark-fantasy', KEY, Date.now() - 11 * 60 * 1000);
    expect(verifyState(expired, KEY)).toBeNull();
  });
});

describe('secret encryption', () => {
  it('AES-256-GCM round-trips and fails closed on tampering or wrong key', () => {
    const enc = encryptSecret('shpat_abc123', KEY);
    expect(enc).not.toContain('shpat_abc123');
    expect(decryptSecret(enc, KEY)).toBe('shpat_abc123');
    const other = crypto.randomBytes(32).toString('base64');
    expect(() => decryptSecret(enc, other)).toThrow();
    const parts = enc.split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), KEY)).toThrow();
  });
});
