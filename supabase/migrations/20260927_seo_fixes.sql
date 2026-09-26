-- Implementation engine (Tier 1): proposed → approved → verified fixes with
-- full before/after evidence and rollback. RLS on, no policies (service
-- role only; access via operator-gated API routes).

alter table seo_clients add column if not exists platform text;       -- 'shopify' | 'nextjs' | 'other'
alter table seo_clients add column if not exists shop_domain text;    -- xxx.myshopify.com

create table if not exists seo_fixes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  domain text not null,
  platform text not null default 'shopify',
  resource_type text not null,              -- 'product' | 'media_image'
  resource_id text not null,                -- Shopify gid
  product_id text,                          -- parent product gid (for alt text)
  resource_label text,                      -- product title, for humans
  field text not null check (field in ('seo_title', 'seo_description', 'image_alt')),
  reason text,                              -- missing | too_long | too_short
  before_value text,
  proposed_value text not null,
  proposal_source text not null default 'fallback', -- 'ai' | 'fallback' | 'operator'
  status text not null default 'proposed'
    check (status in ('proposed', 'applying', 'verified', 'failed', 'conflict', 'rejected', 'rolled_back')),
  observed_value text,                      -- what the second check read back
  error text,
  applied_by text,
  applied_at timestamptz,
  verified_at timestamptz,
  rolled_back_at timestamptz,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_fixes_client_status_idx on seo_fixes (client_id, status);
-- At most one live (not rejected / rolled back / failed) fix per resource field.
create unique index if not exists seo_fixes_live_uniq on seo_fixes (domain, resource_id, field)
  where status in ('proposed', 'applying', 'verified');

alter table seo_fixes enable row level security;

update seo_clients set platform = 'shopify', shop_domain = '1a049t-cy.myshopify.com' where slug = 'dark-fantasy';
update seo_clients set platform = 'nextjs' where slug in ('xark', 'xark-router', 'tope-ebike', 'allcomfy');
