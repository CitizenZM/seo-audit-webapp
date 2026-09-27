import crypto from 'crypto';

/**
 * Shopify OAuth (authorization code grant) primitives for one-click store
 * connection from the dashboard. Security-critical, so kept pure and tested:
 * shop-domain validation (no open redirect), HMAC verification of the
 * callback (constant-time), signed/expiring state (CSRF), and AES-256-GCM
 * encryption for tokens at rest.
 */

/** Least privilege: write implies read for these resources. */
export const SHOPIFY_SCOPES = 'write_products,write_files';

export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

export function buildAuthorizeUrl(a: { shop: string; clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(`https://${a.shop}/admin/oauth/authorize`);
  u.searchParams.set('client_id', a.clientId);
  u.searchParams.set('scope', SHOPIFY_SCOPES);
  u.searchParams.set('redirect_uri', a.redirectUri);
  u.searchParams.set('state', a.state);
  return u.toString();
}

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/** HMAC-SHA256 over the sorted query (minus hmac/signature), plus a 10-min freshness window. */
export function verifyCallbackHmac(query: URLSearchParams, secret: string, maxAgeSec = 600): boolean {
  const hmac = query.get('hmac');
  if (!hmac || !/^[a-f0-9]{64}$/i.test(hmac)) return false;
  const ts = Number(query.get('timestamp'));
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > maxAgeSec) return false;
  const msg = [...query.entries()]
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const digest = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  return safeEqual(digest, hmac.toLowerCase());
}

const keyBytes = (b64: string) => {
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error('SHOPIFY_TOKEN_ENC_KEY must be 32 bytes (base64)');
  return k;
};

/** state = base64url(payload).base64url(hmac) — carries the client slug; valid 10 minutes. */
export function signState(clientSlug: string, keyB64: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ c: clientSlug, t: now, n: crypto.randomBytes(12).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', keyBytes(keyB64)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyState(state: string, keyB64: string, maxAgeMs = 10 * 60 * 1000): { clientSlug: string } | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', keyBytes(keyB64)).update(payload).digest('base64url');
  if (!safeEqual(expect, sig)) return null;
  try {
    const { c, t } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof c !== 'string' || typeof t !== 'number' || Date.now() - t > maxAgeMs || t > Date.now() + 60_000) return null;
    return { clientSlug: c };
  } catch {
    return null;
  }
}

/** AES-256-GCM: "v1.<iv>.<ciphertext>.<tag>" (base64url parts). */
export function encryptSecret(plain: string, keyB64: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyBytes(keyB64), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), ct.toString('base64url'), c.getAuthTag().toString('base64url')].join('.');
}

export function decryptSecret(enc: string, keyB64: string): string {
  const [v, iv, ct, tag] = enc.split('.');
  if (v !== 'v1' || !iv || !ct || !tag) throw new Error('bad ciphertext');
  const d = crypto.createDecipheriv('aes-256-gcm', keyBytes(keyB64), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
