import { describe, it, expect, vi, afterEach } from 'vitest';
import { shopifyPort, fetchProducts, tokenEnvName } from './shopify';

afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('tokenEnvName', () => {
  it('derives SHOPIFY_ADMIN_TOKEN_<SLUG>', () => {
    expect(tokenEnvName('dark-fantasy')).toBe('SHOPIFY_ADMIN_TOKEN_DARK_FANTASY');
  });
});

describe('fetchProducts', () => {
  it('pages through products and maps seo + image alt', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body.variables?.after ?? 'first');
      const page = calls.length;
      return ok({
        products: {
          pageInfo: { hasNextPage: page === 1, endCursor: page === 1 ? 'c1' : null },
          nodes: [{
            id: `gid://shopify/Product/${page}`, title: `P${page}`, handle: `p${page}`, description: 'd',
            seo: { title: page === 1 ? null : 'T', description: null },
            media: { nodes: [{ id: `gid://shopify/MediaImage/${page}`, alt: '' }, {}] },
          }],
        },
      });
    }));
    const products = await fetchProducts({ shop: 's.myshopify.com', token: 't' }, { limit: 10 });
    expect(calls).toEqual(['first', 'c1']);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ id: 'gid://shopify/Product/1', seoTitle: null, images: [{ id: 'gid://shopify/MediaImage/1', alt: '' }] });
  });
});

describe('shopifyPort', () => {
  it('writes an SEO title via productUpdate and surfaces userErrors as failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const q = String(JSON.parse(String(init.body)).query);
      if (q.includes('productUpdate')) return ok({ productUpdate: { product: null, userErrors: [{ field: ['seo', 'title'], message: 'Title is too long' }] } });
      return ok({});
    }));
    const port = shopifyPort({ shop: 's.myshopify.com', token: 't' });
    await expect(port.writeField('gid://shopify/Product/1', 'seo_title', 'x', 'gid://shopify/Product/1')).resolves.toEqual({ ok: false, error: 'seo.title: Title is too long' });
  });

  it('writes alt text via fileUpdate and reads it back via node()', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const q = String(JSON.parse(String(init.body)).query);
      if (q.includes('fileUpdate')) { seen.push('fileUpdate'); return ok({ fileUpdate: { files: [{ id: 'm1', alt: 'new' }], userErrors: [] } }); }
      if (q.includes('node(')) { seen.push('read'); return ok({ node: { id: 'm1', alt: 'new' } }); }
      return ok({});
    }));
    const port = shopifyPort({ shop: 's.myshopify.com', token: 't' });
    await expect(port.writeField('m1', 'image_alt', 'new', 'p1')).resolves.toEqual({ ok: true });
    await expect(port.readField('m1', 'image_alt', 'p1')).resolves.toBe('new');
    expect(seen).toEqual(['fileUpdate', 'read']);
  });

  it('treats top-level GraphQL errors and HTTP errors as failures, never success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'Access denied for productUpdate' }] }), { status: 200 })));
    const port = shopifyPort({ shop: 's.myshopify.com', token: 't' });
    const r = await port.writeField('p1', 'seo_description', 'x', 'p1');
    expect(r).toEqual({ ok: false, error: 'Access denied for productUpdate' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    await expect(port.readField('p1', 'seo_title', 'p1')).rejects.toThrow(/401/);
  });
});

describe('client credentials grant (Dev Dashboard apps, 2026+)', () => {
  const client = { slug: 'dark-fantasy', shop_domain: 'df.myshopify.com' };
  afterEach(() => {
    delete process.env.SHOPIFY_ADMIN_TOKEN_DARK_FANTASY;
    delete process.env.SHOPIFY_CLIENT_ID_DARK_FANTASY;
    delete process.env.SHOPIFY_CLIENT_SECRET_DARK_FANTASY;
  });

  it('reports configured from env presence without a network call', async () => {
    const { hasShopifyCredentials } = await import('./shopify');
    expect(hasShopifyCredentials(client)).toBe(false);
    process.env.SHOPIFY_CLIENT_ID_DARK_FANTASY = 'id';
    process.env.SHOPIFY_CLIENT_SECRET_DARK_FANTASY = 'secret';
    expect(hasShopifyCredentials(client)).toBe(true);
    expect(hasShopifyCredentials({ ...client, shop_domain: null })).toBe(false);
  });

  it('exchanges id/secret for a token with the documented form request, and caches it', async () => {
    const { resolveCreds, __resetTokenCache } = await import('./shopify');
    __resetTokenCache();
    process.env.SHOPIFY_CLIENT_ID_DARK_FANTASY = 'cid';
    process.env.SHOPIFY_CLIENT_SECRET_DARK_FANTASY = 'csecret';
    const calls: { url: string; body: string; ct: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), ct: String((init.headers as Record<string, string>)['Content-Type']) });
      return new Response(JSON.stringify({ access_token: 'tok_1', scope: 'read_products', expires_in: 86399 }), { status: 200 });
    }));
    const a = await resolveCreds(client);
    const b = await resolveCreds(client);
    expect(a).toEqual({ shop: 'df.myshopify.com', token: 'tok_1' });
    expect(b).toEqual(a);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://df.myshopify.com/admin/oauth/access_token');
    expect(calls[0].ct).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(calls[0].body).get('grant_type')).toBe('client_credentials');
    expect(new URLSearchParams(calls[0].body).get('client_id')).toBe('cid');
  });

  it('prefers a legacy admin token when present (no exchange)', async () => {
    const { resolveCreds, __resetTokenCache } = await import('./shopify');
    __resetTokenCache();
    process.env.SHOPIFY_ADMIN_TOKEN_DARK_FANTASY = 'shpat_x';
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(await resolveCreds(client)).toEqual({ shop: 'df.myshopify.com', token: 'shpat_x' });
    expect(f).not.toHaveBeenCalled();
  });

  it('throws a clear error when the exchange is rejected (e.g. app not installed)', async () => {
    const { resolveCreds, __resetTokenCache } = await import('./shopify');
    __resetTokenCache();
    process.env.SHOPIFY_CLIENT_ID_DARK_FANTASY = 'cid';
    process.env.SHOPIFY_CLIENT_SECRET_DARK_FANTASY = 'bad';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid_client"}', { status: 400 })));
    await expect(resolveCreds(client)).rejects.toThrow(/token exchange failed.*400/i);
  });
});
