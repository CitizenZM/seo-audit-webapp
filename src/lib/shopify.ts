import type { FixField, ProductSnapshot, ShopifyPort } from '@/lib/fixEngine';

/**
 * Shopify Admin GraphQL adapter for the implementation engine.
 *
 * Auth: a permanent Admin API access token per store, from a custom app
 * (scopes: read_products, write_products, read_files, write_files), stored as
 * the Vercel env var SHOPIFY_ADMIN_TOKEN_<CLIENT_SLUG>. The older Python
 * engine borrowed a 24h Shopify CLI session, which can't run server-side.
 *
 * Every mutation's userErrors and every top-level GraphQL error is surfaced
 * as a failure — the previous engine only checked the HTTP status, so
 * partial rejections were reported as success.
 */

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';

export interface ShopifyCreds {
  shop: string; // xxx.myshopify.com
  token: string;
}

const envSlug = (clientSlug: string) => clientSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
export const tokenEnvName = (clientSlug: string) => `SHOPIFY_ADMIN_TOKEN_${envSlug(clientSlug)}`;
export const clientIdEnvName = (clientSlug: string) => `SHOPIFY_CLIENT_ID_${envSlug(clientSlug)}`;
export const clientSecretEnvName = (clientSlug: string) => `SHOPIFY_CLIENT_SECRET_${envSlug(clientSlug)}`;

type ClientRef = { slug: string; shop_domain?: string | null };

/**
 * Two credential styles:
 *  - Legacy admin-created custom app token (SHOPIFY_ADMIN_TOKEN_<SLUG>) —
 *    still works, but Shopify stopped allowing new ones on 2026-01-01.
 *  - Dev Dashboard app (SHOPIFY_CLIENT_ID_<SLUG> + SHOPIFY_CLIENT_SECRET_<SLUG>)
 *    exchanged via the client credentials grant for a 24h token (app and
 *    store must be in the same organization, app installed on the store).
 */
export function hasShopifyCredentials(client: ClientRef): boolean {
  if (!client.shop_domain) return false;
  const env = process.env;
  return Boolean(
    env[tokenEnvName(client.slug)]?.trim() ||
      (env[clientIdEnvName(client.slug)]?.trim() && env[clientSecretEnvName(client.slug)]?.trim()),
  );
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
export const __resetTokenCache = () => tokenCache.clear();

export async function resolveCreds(client: ClientRef): Promise<ShopifyCreds | null> {
  if (!client.shop_domain) return null;
  const shop = client.shop_domain;
  const legacy = process.env[tokenEnvName(client.slug)]?.trim();
  if (legacy) return { shop, token: legacy };

  const id = process.env[clientIdEnvName(client.slug)]?.trim();
  const secret = process.env[clientSecretEnvName(client.slug)]?.trim();
  if (!id || !secret) return null;

  const cached = tokenCache.get(shop);
  if (cached && cached.expiresAt > Date.now()) return { shop, token: cached.token };

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed (HTTP ${res.status}) — check the app is installed on ${shop} and in the same organization`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Shopify token exchange returned no access_token');
  // Refresh 10 minutes before the 24h expiry.
  tokenCache.set(shop, { token: json.access_token, expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 86399) - 600) * 1000 });
  return { shop, token: json.access_token };
}

interface GqlUserError { field?: string[] | null; message: string }

async function gql<T>(creds: ShopifyCreds, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${creds.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': creds.token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  if (!json.data) throw new Error('Shopify returned no data');
  return json.data;
}

const fmtUserErrors = (errs: GqlUserError[]) =>
  errs.map((e) => (e.field?.length ? `${e.field.join('.')}: ${e.message}` : e.message)).join('; ');

const PRODUCTS_QUERY = `
query Products($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle description(truncateAt: 600)
      seo { title description }
      media(first: 20) { nodes { ... on MediaImage { id alt } } }
    }
  }
}`;

export async function fetchProducts(creds: ShopifyCreds, opts: { limit?: number } = {}): Promise<ProductSnapshot[]> {
  const limit = opts.limit ?? 250;
  const out: ProductSnapshot[] = [];
  let after: string | null = null;
  while (out.length < limit) {
    type Page = {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string; title: string; handle: string; description: string;
          seo: { title: string | null; description: string | null };
          media: { nodes: { id?: string; alt?: string | null }[] };
        }[];
      };
    };
    const data: Page = await gql<Page>(creds, PRODUCTS_QUERY, { first: Math.min(50, limit - out.length), after });
    for (const p of data.products.nodes) {
      out.push({
        id: p.id,
        title: p.title,
        handle: p.handle,
        description: p.description ?? '',
        seoTitle: p.seo?.title ?? null,
        seoDescription: p.seo?.description ?? null,
        // Non-image media (video, 3D) come back as {} from the inline fragment.
        images: (p.media?.nodes ?? []).filter((m) => m.id).map((m) => ({ id: m.id!, alt: m.alt ?? null })),
      });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return out;
}

export function shopifyPort(creds: ShopifyCreds): ShopifyPort {
  return {
    async readField(resourceId: string, field: FixField) {
      if (field === 'image_alt') {
        const d = await gql<{ node: { alt?: string | null } | null }>(
          creds,
          `query($id: ID!) { node(id: $id) { ... on MediaImage { id alt } } }`,
          { id: resourceId },
        );
        return d.node?.alt ?? null;
      }
      const d = await gql<{ product: { seo: { title: string | null; description: string | null } } | null }>(
        creds,
        `query($id: ID!) { product(id: $id) { id seo { title description } } }`,
        { id: resourceId },
      );
      if (!d.product) throw new Error('Product not found');
      return field === 'seo_title' ? d.product.seo.title : d.product.seo.description;
    },

    async writeField(resourceId: string, field: FixField, value: string) {
      try {
        if (field === 'image_alt') {
          const d = await gql<{ fileUpdate: { userErrors: GqlUserError[] } }>(
            creds,
            `mutation($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { files { id alt } userErrors { field message code } } }`,
            { files: [{ id: resourceId, alt: value }] },
          );
          const errs = d.fileUpdate?.userErrors ?? [];
          return errs.length ? { ok: false as const, error: fmtUserErrors(errs) } : { ok: true as const };
        }
        const seo = field === 'seo_title' ? { title: value } : { description: value };
        const d = await gql<{ productUpdate: { userErrors: GqlUserError[] } }>(
          creds,
          `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id seo { title description } } userErrors { field message } } }`,
          { product: { id: resourceId, seo } },
        );
        const errs = d.productUpdate?.userErrors ?? [];
        return errs.length ? { ok: false as const, error: fmtUserErrors(errs) } : { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
