# seo-audit-webapp

An SEO + GEO (generative engine optimization) audit and implementation platform for affiliate and e-commerce sites. It crawls a site, audits it, probes how AI answer engines cite the brand, turns findings into a prioritized task list, and — for Shopify stores — proposes and applies Tier-1 fixes automatically, with a second check on every write and one-click rollback.

- **Repository:** `CitizenZM/seo-audit-webapp`
- **Stack:** Next.js 16 (App Router), TypeScript (strict), Tailwind CSS, Supabase (Postgres), Vercel (Fluid Compute), Vitest
- **Status:** production on Vercel; Shopify Tier-1 auto-fix pilot verified on a live storefront

---

## 中文简介

这是一个面向联盟营销和电商站点的 SEO + GEO 审计与执行平台：抓取站点、生成审计报告、探测 AI 搜索引擎对品牌的引用情况，把问题转成优先级任务清单；对于 Shopify 店铺，授权一次后自动生成并应用一级修复（SEO 标题、Meta 描述、图片 alt），每次写入都经过回读比对的二次校验，并可在队列中一键回滚。

---

## Table of contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Repository layout](#repository-layout)
4. [Getting started](#getting-started)
5. [Environment variables](#environment-variables)
6. [Database migrations](#database-migrations)
7. [Scheduled jobs](#scheduled-jobs)
8. [Shopify one-click connection and auto mode](#shopify-one-click-connection-and-auto-mode)
9. [Safety model](#safety-model)
10. [API reference](#api-reference)
11. [Testing](#testing)
12. [Deployment](#deployment)
13. [Operating rules](#operating-rules)

---

## What it does

| Area | Capability |
| --- | --- |
| **Audit** | Single-page and site-wide audits; per-section action plans; program strategy; stored audits viewable with `/dashboard?id=<auditId>`. |
| **Crawler** | Polite crawler, up to 150 pages per site. Concurrency 4, 150 ms batch delay, throttles on HTTP 429 with `Retry-After` honored, and detects Cloudflare bot challenges (`cf-mitigated`) instead of hammering them. Crawl health is scored by issue prevalence (critical 40, high 20, medium 10, low 4, +10 per critical issue type). |
| **GEO visibility** | Probes AI answer engines for brand citations: Gemini (direct), plus NVIDIA Nemotron via OpenRouter (free tier) and Qwen 3.5 via Matrix. Paid OpenAI and Perplexity models are blocked by a policy filter in `resolveCompatEngines`. A probe budget (`PROBE_BUDGET_MS`, default 120 s) bounds each run. |
| **Task list** | Closed-loop SEO/GEO task list (`seo_tasks`). Tasks auto-verify when the underlying condition clears, reopen on regression, and are semantically de-duplicated across audits. |
| **Weekly ops** | Scheduled re-audits, a weekly digest, and a daily auto-fix run (see [Scheduled jobs](#scheduled-jobs)). |
| **Shopify fixes** | Tier-1 product fixes: SEO title (15–60 chars), meta description (70–160 chars), image alt text. Merchant edits are never overwritten; every write is re-read and compared; failures are reported, not hidden. |
| **Client workspaces** | Per-client pages (`/client/<slug>`) with the connection card, the Implementation queue, and the task list. Operator-gated. |

---

## Architecture

```
                        ┌──────────────────────────────┐
  Operator browser ───▶ │  Next.js App Router (Vercel) │
                        │  pages + /api route handlers │
                        └──────┬───────────┬───────────┘
                               │           │
              ┌────────────────┘           └───────────────────┐
              ▼                                                ▼
  ┌────────────────────────┐                     ┌────────────────────────────┐
  │ Supabase (Postgres)    │                     │ External services          │
  │ service role, RLS on,  │                     │ • Shopify Admin GraphQL    │
  │ no public policies     │                     │ • Gemini / OpenRouter /    │
  │ seo_clients, audits,   │                     │   Matrix (AI probes)       │
  │ seo_tasks, seo_fixes,  │                     │ • Serper (SERP)            │
  │ seo_shop_connections   │                     │ • Resend (email, optional) │
  └────────────────────────┘                     └────────────────────────────┘

  Vercel Cron ──▶ /api/cron/*  ──▶ /api/jobs/*  (fan-out, 202 + chained hops)
```

Key design decisions:

- **Long work runs as jobs.** Audits and auto-fix batches are created as jobs and executed by `/api/jobs/run` and `/api/jobs/autofix`. Each function is time-boxed (`maxDuration` 300 s on Fluid Compute). Batches that do not finish report `remaining` and chain another hop (up to 10).
- **Structured AI outputs use loose wire schemas.** Model responses are validated with `zodResponseFormat`, then normalized locally (`normalizeStrategy`, `normalizeSections`). This keeps the provider schema simple while the app stays strict.
- **Secrets are encrypted at rest.** Shopify access and refresh tokens are stored with AES-256-GCM (`SHOPIFY_TOKEN_ENC_KEY`). Comparisons for secrets are constant-time.
- **Writes are never trusted on the API's word.** A Shopify `productUpdate` / `fileUpdate` only counts when a fresh read matches the intended value.

---

## Repository layout

```
src/
  app/
    page.tsx                  Landing / entry
    login/                    Supabase magic-link sign-in
    dashboard/                Audit dashboard (?id=<auditId> for stored audits)
      ShopifyConnectCard.tsx  One-click connect + auto mode
      FixQueueCard.tsx        Implementation queue (approve / reject / rollback)
    clients/, client/[slug]/  Client list and per-client workspace
    report/[id]/, reports/    Stored reports
    api/
      analyze/                Run an audit
      audits/                 Audit CRUD, proposal generation
      clients/                Client CRUD
      fixes/                  Propose, list, act on, bulk, autorun
      shopify/                install, callback, connection (status + autoApply)
      tasks/                  Task list CRUD and sync
      jobs/run, jobs/autofix  Background workers
      cron/reaudit, digest, autofix  Scheduled entry points
      health/                 Liveness
  lib/
    probeEngines.ts           Engine resolution, policy filter, retries, limiter, deadlines
    visibility.ts             GEO probe targets and scoring
    siteCrawler.ts            Polite crawler and throttling
    siteIssues.ts             Issue detection and crawl-health scoring
    programStrategy.ts        Strategy schema + normalization
    sectionSolutions.ts       Per-section action plans
    taskList.ts, taskSync.ts  Closed-loop SEO/GEO task list
    fixEngine.ts              Fix needs, validators, fallback copy, applyFix, rollbackFix
    fixProposals.ts           Proposal builder and AI copy drafting (batches of 10)
    fixStore.ts               Proposal persistence and approve / reject / rollback
    shopify.ts                Admin GraphQL port (read / write seo_title, seo_description, image_alt)
    shopifyOAuth.ts           Authorize URL, HMAC, signed state, AES-256-GCM helpers
    shopConnections.ts        Stored connections, token refresh, credential resolution
    autoFix.ts                Time-boxed auto-apply batches with failure halting
    autoFixDispatch.ts        Hop-chained dispatch of auto-fix batches
    auditJobs.ts              Job creation, execution, digest building
    operator.ts               requireOperator (fail-closed on OPERATOR_EMAILS)
  ...                         Other analyzers (GEO, citations, claims accuracy, trends, branding)
supabase/
  migrations/                 Ordered SQL migrations (see below)
```

---

## Getting started

### Prerequisites

- Node.js 22 or later (Node 24 LTS is the Vercel default)
- pnpm (preferred) or npm
- A Supabase project (URL, anon key, service role key)

### Install and run

```bash
pnpm install
cp .env.example .env.local   # then fill in the values listed below
pnpm dev                     # http://localhost:3000
```

> If port 3000 is taken on your machine, run `pnpm dev -- -p 3001`.

### Useful scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build (run before every release) |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest, single run |

Never commit `.env.local`. Use the Vercel project environment (Sensitive variables) for production values.

---

## Environment variables

All variables live in `.env.example`. Required values are marked **(required)**.

### Core

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL **(required)** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key, used by the sign-in flow **(required)** |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side data access; RLS is enabled with no public policies **(required)** |
| `CRON_SECRET` | Bearer token for cron and internal job calls **(required)** |
| `OPERATOR_EMAILS` | Comma-separated operator emails. Operator routes fail closed when empty **(required)** |
| `CRAWLER_LOGS_SECRET` | Protects the crawler-logs endpoint |

### AI and search

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude-backed analysis |
| `GEMINI_API_KEY` | Gemini, used for direct GEO probes and fix copy drafting |
| `OPENROUTER_API_KEY` | Free-tier probe engines via OpenRouter |
| `OPENROUTER_PROBE_MODELS` | Default `nvidia/nemotron-3-super-120b-a12b:free` |
| `MATRIX_API_KEY` | Matrix gateway for the Qwen probe |
| `MATRIX_PROBE_MODELS` | Default `qwen/qwen3.5-397b-a17b` |
| `SERPER_API_KEY` | SERP data |
| `PERPLEXITY_API_KEY`, `AGNES_API_KEY`, `AGNES_MODEL` | Optional. Note: OpenAI and Perplexity models are excluded from GEO probing by policy |
| `PROBE_BUDGET_MS` | Time budget per GEO probe run (default `120000`) |

> Policy: GEO probing uses **free or self-hosted engines only** (Gemini, Nemotron via OpenRouter, Qwen via Matrix). Paid OpenAI and Perplexity engines are filtered out in `resolveCompatEngines` and must not be added to probe lists.

### Shopify

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_VERSION` | Admin API version, default `2026-04` |
| `SHOPIFY_APP_CLIENT_ID`, `SHOPIFY_APP_CLIENT_SECRET` | Dev Dashboard app credentials used by the one-click authorization code grant **(required for connect)** |
| `SHOPIFY_TOKEN_ENC_KEY` | Base64 32-byte key for AES-256-GCM token encryption **(required for connect)** |
| `SHOPIFY_CLIENT_ID_<SLUG>`, `SHOPIFY_CLIENT_SECRET_<SLUG>` | Optional per-client client-credentials fallback for org-owned stores |

Generate the encryption key once and store it as a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Optional

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_FROM` | Email delivery for digests and reports |
| `PAGESPEED_API_KEY` | PageSpeed Insights data (not yet configured in production) |

---

## Database migrations

Migrations are plain SQL in `supabase/migrations/`, applied in filename order:

| File | Adds |
| --- | --- |
| `20260720_branding.sql` | Branding analysis storage |
| `20260720_trends_crawler.sql` | Trends and crawler analytics |
| `20260926_seo_tasks.sql` | `seo_tasks` (closed-loop task list) |
| `20260927_seo_fixes.sql` | `seo_fixes` (proposals, events, evidence) and `seo_clients.platform` / `shop_domain` |
| `20260928_shop_connections.sql` | `seo_shop_connections` (encrypted tokens, status, `auto_apply`, last run stats) |

Apply to the linked project with the Supabase CLI:

```bash
supabase db query --linked -f supabase/migrations/<file>.sql
```

Do not edit a migration that has already been applied; add a new file instead.

---

## Scheduled jobs

Defined in `vercel.json`:

| Path | Schedule (UTC) | Purpose |
| --- | --- | --- |
| `/api/cron/reaudit` | `0 9 * * 1` (Mondays 09:00) | Fans out re-audits through `/api/jobs/run` (returns 202 per job) |
| `/api/cron/digest` | `0 11 * * 1` (Mondays 11:00) | Builds the weekly digest |
| `/api/cron/autofix` | `0 13 * * *` (daily 13:00) | Scans connected stores and applies pending Tier-1 fixes |

Cron routes accept only `Authorization: Bearer <CRON_SECRET>` for internal calls.

---

## Shopify one-click connection and auto mode

Goal: the merchant authorizes the app **once**; the platform then scans the store and fixes SEO issues automatically, without per-item approvals.

### Flow

1. **Connect.** On `/client/<slug>`, enter the store domain (`your-store.myshopify.com`) and click **Connect Shopify**. The operator-gated `GET /api/shopify/install` redirects to Shopify's authorize page with scopes `write_products` and `write_files`.
2. **Authorize.** The merchant approves on Shopify.
3. **Callback.** `GET /api/shopify/callback` validates the signed, expiring state (10 minutes), verifies the HMAC, validates the shop domain, exchanges the code for an **expiring** offline token plus refresh token, stores both encrypted, and dispatches the first auto run.
4. **Auto run.** Products are scanned (only active, published products unless `includeUnpublished` is set). Proposals are generated, then applied one by one through `applyFix`.
5. **Ongoing.** The daily cron re-scans and applies anything new. Access tokens (1 h) refresh automatically within 5 minutes of expiry; if the refresh token is gone, the connection is marked `error` and the UI asks for reconnection.

### Auto mode

`auto_apply` can be toggled from the connection card (`PATCH /api/shopify/connection`). When off, proposals wait in the Implementation queue for manual approval.

### Batch behavior

- Each run is time-boxed to fit a 300 s function. Unfinished work is reported as `remaining` and continued in the next hop.
- Five consecutive failures halt the batch (`halted`), so a revoked token or store-side problem does not burn through hundreds of writes.

---

## Safety model

Every automatic write must pass all of these gates:

1. **Validation.** Title 15–60 characters; description 70–160 characters; plain text after HTML entity decoding; no brand name in SEO titles.
2. **Conflict protection.** The current value is read before writing. If a merchant has edited the field since the proposal, the fix is marked `conflict` and skipped.
3. **Shopify userErrors.** Any `userErrors` in the mutation response mark the fix `failed`.
4. **Second check.** The platform re-reads the product or file from Shopify and compares the stored field with the intended value. Only a match marks the fix `verified`. A tool's success response alone never counts.
5. **Rollback.** Every applied fix keeps its previous value. `rollbackFix` restores it and runs the same second check.
6. **Operator gate.** All `/api/fixes/*` and `/api/shopify/*` routes require an operator (`requireOperator`, fail-closed).

Fix lifecycle: `proposed` → `applying` → `verified` | `failed` | `conflict` | `rejected` | `rolled_back`. Every transition is recorded as an event with evidence.

---

## API reference

Operator-gated unless noted. Cron and job routes require `CRON_SECRET`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/analyze` | Start an audit |
| `GET` | `/api/audits/list`, `/api/audits/[id]` | List and read audits |
| `POST` | `/api/audits/[id]/proposal` | Generate an action proposal |
| `GET`, `POST` | `/api/clients`, `/api/clients/[slug]` | Client workspaces |
| `GET`, `POST` | `/api/tasks`, `/api/tasks/[id]`, `/api/tasks/sync` | Task list and reconciliation |
| `GET` | `/api/fixes` | Fix queue |
| `POST` | `/api/fixes/propose` | Propose fixes for a client |
| `POST` | `/api/fixes/[id]` | Approve, reject, or roll back one fix |
| `POST` | `/api/fixes/bulk` | Bulk action on fixes |
| `POST` | `/api/fixes/autorun` | Run a scan-and-fix batch now |
| `GET` | `/api/shopify/install` | Redirect to Shopify authorize |
| `GET` | `/api/shopify/callback` | OAuth callback (public, validated by state and HMAC) |
| `GET`, `PATCH` | `/api/shopify/connection` | Connection status; toggle `autoApply` |
| `POST` | `/api/jobs/run`, `/api/jobs/autofix` | Background workers (internal, `CRON_SECRET`) |
| `GET` | `/api/cron/reaudit`, `/api/cron/digest`, `/api/cron/autofix` | Scheduled entry points (internal) |
| `GET` | `/api/health` | Liveness (public) |

---

## Testing

```bash
pnpm test            # full Vitest suite
pnpm build           # type-check and production build
```

The suite covers the crawler (including throttling), issue detection and crawl-health scoring, probe engine resolution and deadlines, task list reconciliation, program strategy and section normalization, fix validators and copy, the fix store (against a fake database), Shopify GraphQL shaping, OAuth HMAC and state, encrypted connection storage and refresh, auto-fix batching and halting, operator gating, and the job pipeline.

Run tests and build before every commit. Do not claim a change is done without both passing.

---

## Deployment

- **Platform:** Vercel, Fluid Compute, default function timeout 300 s (`maxDuration` set on long routes).
- **Environment:** set every variable above in the Vercel project for Production and Preview. Mark secrets as Sensitive.
- **Crons:** defined in `vercel.json`; Vercel calls them with `CRON_SECRET`.
- **Database:** apply new migrations to the linked Supabase project before deploying code that depends on them.

---

## Operating rules

These rules come from the project's operating policy and apply to any automation touching client platforms:

- **Second check on every platform write.** Sending, scheduling, changing rates, creating codes, inviting publishers, and changing settings are reported as done only after an independent re-read matches the intended result.
- **Scope of programs.** Only the operated programs are included in loops, reports, and files. Programs not under operation are excluded by name.
- **No secrets in the repository.** Keys live in `.env.local` (gitignored), Vercel Sensitive variables, or the Supabase vault.

---

## Commit conventions

`<type>: <description>` with type one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
