-- One-click Shopify connections (OAuth authorization code grant).
-- Tokens are AES-256-GCM encrypted by the app (SHOPIFY_TOKEN_ENC_KEY);
-- the database never sees plaintext. RLS on, no policies (service role only).
create table if not exists seo_shop_connections (
  client_id uuid primary key references seo_clients(id) on delete cascade,
  shop_domain text not null unique,
  access_token_enc text not null,
  access_expires_at timestamptz,
  refresh_token_enc text,
  refresh_expires_at timestamptz,
  scopes text,
  auto_apply boolean not null default true,
  status text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  last_run_at timestamptz,
  last_run jsonb,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table seo_shop_connections enable row level security;
