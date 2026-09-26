import type { SupabaseClient } from '@supabase/supabase-js';
import { applyFix, detectFixNeeds, rollbackFix, type FixField, type FixRecord, type ShopifyPort } from '@/lib/fixEngine';
import { buildProposals, draftSeoCopy } from '@/lib/fixProposals';
import { clientIdEnvName, clientSecretEnvName, fetchProducts, hasShopifyCredentials, resolveCreds, shopifyPort, tokenEnvName } from '@/lib/shopify';

/**
 * Persistence + orchestration for the implementation queue (seo_fixes).
 * Every state change appends an evidence event (who, when, what was read
 * back) so the operator's second-check rule leaves an audit trail.
 */

export interface ClientRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  platform: string | null;
  shop_domain: string | null;
}

export const LIVE = ['proposed', 'applying', 'verified'] as const;
const MAX_PROPOSALS_PER_SCAN = 300;

export async function loadClient(db: SupabaseClient, slug: string): Promise<ClientRow | null> {
  const { data } = await db.from('seo_clients').select('id, slug, name, domain, platform, shop_domain').eq('slug', slug).maybeSingle();
  return (data as ClientRow) ?? null;
}

export function connection(client: ClientRow) {
  return {
    slug: client.slug,
    platform: client.platform,
    connected: client.platform === 'shopify' && hasShopifyCredentials(client),
    tokenEnv: `${clientIdEnvName(client.slug)} + ${clientSecretEnvName(client.slug)} (or legacy ${tokenEnvName(client.slug)})`,
  };
}

const event = (type: string, detail: Record<string, unknown> = {}) => ({ type, at: new Date().toISOString(), ...detail });

export async function proposeForClient(
  db: SupabaseClient,
  client: ClientRow,
  deps: { fetch?: typeof fetchProducts; draft?: typeof draftSeoCopy } = {},
): Promise<{ proposed: number; skipped: number; scanned: number }> {
  const creds = await resolveCreds(client);
  if (!creds) throw new Error(`Store not connected: set ${clientIdEnvName(client.slug)} + ${clientSecretEnvName(client.slug)} and shop_domain`);

  const products = await (deps.fetch ?? fetchProducts)(creds, { limit: 250 });
  const needs = detectFixNeeds(products);

  // Skip anything that already has a live fix (proposed / applying / verified).
  const { data: live } = await db
    .from('seo_fixes')
    .select('resource_id, field')
    .eq('domain', client.domain)
    .in('status', LIVE as unknown as string[]);
  const liveKeys = new Set((live ?? []).map((r: { resource_id: string; field: string }) => `${r.resource_id}:${r.field}`));
  const fresh = needs.filter((n) => !liveKeys.has(`${n.resourceId}:${n.field}`)).slice(0, MAX_PROPOSALS_PER_SCAN);

  const needCopy = new Set(fresh.filter((n) => n.field !== 'image_alt').map((n) => n.productId));
  const drafts = await (deps.draft ?? draftSeoCopy)(products.filter((p) => needCopy.has(p.id)), client.name);
  const proposals = buildProposals(fresh, products, drafts, client.name);

  if (proposals.length) {
    const { error } = await db.from('seo_fixes').insert(
      proposals.map((p) => ({
        client_id: client.id,
        domain: client.domain,
        platform: 'shopify',
        resource_type: p.field === 'image_alt' ? 'media_image' : 'product',
        resource_id: p.resourceId,
        product_id: p.productId,
        resource_label: p.productTitle,
        field: p.field,
        reason: p.reason,
        before_value: p.beforeValue,
        proposed_value: p.proposedValue,
        proposal_source: p.source,
        events: [event('proposed', { source: p.source })],
      })),
    );
    if (error) throw new Error(`Failed to store proposals: ${error.message}`);
  }
  return { proposed: proposals.length, skipped: needs.length - proposals.length, scanned: products.length };
}

type FixRow = {
  id: string; domain: string; client_id: string; resource_id: string; product_id: string | null; field: FixField;
  before_value: string | null; proposed_value: string; status: string; events: unknown[];
};

const FIX_COLUMNS =
  'id, client_id, domain, resource_type, resource_id, product_id, resource_label, field, reason, before_value, proposed_value, proposal_source, status, observed_value, error, applied_at, verified_at, rolled_back_at, events';

export async function actOnFix(
  db: SupabaseClient,
  fixId: string,
  action: 'approve' | 'reject' | 'rollback',
  opts: { operator: string; value?: string; port?: ShopifyPort },
) {
  const { data: row, error } = await db.from('seo_fixes').select(FIX_COLUMNS).eq('id', fixId).maybeSingle();
  if (error || !row) return { error: 'Fix not found', status: 404 as const };
  const fix = row as unknown as FixRow;

  if (action === 'reject') {
    if (fix.status !== 'proposed') return { error: `Cannot reject a ${fix.status} fix`, status: 409 as const };
    const { data } = await db
      .from('seo_fixes')
      .update({ status: 'rejected', updated_at: new Date().toISOString(), events: [...fix.events, event('rejected', { by: opts.operator })] })
      .eq('id', fixId).select(FIX_COLUMNS).single();
    return { fix: data };
  }

  let port = opts.port;
  if (!port) {
    const { data: client } = await db.from('seo_clients').select('id, slug, name, domain, platform, shop_domain').eq('id', fix.client_id).maybeSingle();
    const creds = client ? await resolveCreds(client as ClientRow).catch(() => null) : null;
    if (!creds) return { error: 'Store not connected', status: 412 as const };
    port = shopifyPort(creds);
  }

  const record: FixRecord = {
    id: fix.id,
    resourceId: fix.resource_id,
    productId: fix.product_id ?? fix.resource_id,
    field: fix.field,
    beforeValue: fix.before_value,
    proposedValue: fix.proposed_value,
  };
  const now = new Date().toISOString();

  if (action === 'approve') {
    if (fix.status !== 'proposed' && fix.status !== 'failed' && fix.status !== 'conflict') {
      return { error: `Cannot apply a ${fix.status} fix`, status: 409 as const };
    }
    const originalProposed = fix.proposed_value; // capture before the claim below rewrites it
    const value = opts.value?.trim();
    if (value) record.proposedValue = value;
    // Claim the row so a double-click can't apply twice.
    await db.from('seo_fixes').update({ status: 'applying', proposed_value: record.proposedValue, updated_at: now }).eq('id', fixId);

    const r = await applyFix(port, record);
    const { data } = await db
      .from('seo_fixes')
      .update({
        status: r.status,
        observed_value: r.observedValue ?? null,
        error: r.error ?? null,
        applied_by: opts.operator,
        applied_at: now,
        verified_at: r.status === 'verified' ? new Date().toISOString() : null,
        proposal_source: value && value !== originalProposed ? 'operator' : undefined,
        updated_at: new Date().toISOString(),
        events: [...fix.events, event('apply', { by: opts.operator, result: r.status, observed: r.observedValue ?? null, error: r.error ?? null })],
      })
      .eq('id', fixId).select(FIX_COLUMNS).single();
    return { fix: data };
  }

  // rollback
  if (fix.status !== 'verified') return { error: `Only verified fixes can be rolled back (is ${fix.status})`, status: 409 as const };
  const r = await rollbackFix(port, record);
  const { data } = await db
    .from('seo_fixes')
    .update({
      status: r.status === 'rolled_back' ? 'rolled_back' : fix.status,
      observed_value: r.observedValue ?? null,
      error: r.status === 'rolled_back' ? null : r.error ?? null,
      rolled_back_at: r.status === 'rolled_back' ? now : null,
      updated_at: now,
      events: [...fix.events, event('rollback', { by: opts.operator, result: r.status, observed: r.observedValue ?? null, error: r.error ?? null })],
    })
    .eq('id', fixId).select(FIX_COLUMNS).single();
  return { fix: data };
}

export { FIX_COLUMNS };
