-- White-label report branding (#10 agency feature).
--
-- One row per user, holding their agency branding as jsonb (agencyName,
-- logoUrl, accentColor, contactEmail, hidePoweredBy — see src/lib/branding.ts
-- for the validated shape). Read/written exclusively via
-- src/app/api/branding/route.ts using the service-role client, matching the
-- seo_watchlist pattern: RLS is enabled with zero policies, so the app-level
-- route is the only access path and it filters by user_id on every query.
--
-- This file is documentation of the expected schema for this project (no
-- migration runner is wired up here) — apply it manually via the Supabase
-- SQL editor or CLI before enabling persistence.

create table if not exists agency_branding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  branding jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table agency_branding enable row level security;
-- No policies defined intentionally: access goes exclusively through the
-- service-role key in src/app/api/branding/route.ts, which enforces
-- user_id === session.user.id at the application layer.
