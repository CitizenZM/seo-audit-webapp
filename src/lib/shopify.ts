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

export const tokenEnvName = (clientSlug: string) => `SHOPIFY_ADMIN_TOKEN_${clientSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

export function credsForClient(client: { slug: string; shop_domain?: string | null }): ShopifyCreds | null {
  const token = process.env[tokenEnvName(client.slug)]?.trim();
  if (!token || !client.shop_domain) return null;
  return { shop: client.shop_domain, token };
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
