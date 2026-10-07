# TUNG — Phase and Release Status

Status date: 2026-08-02  
Production: `https://tung.codes`  
Platform target: Cloudflare Workers Paid with bounded D1/R2 usage  
Default public locale: Vietnamese (`vi`, no URL prefix)  
Additional public locales: English (`en`), Japanese (`ja`), Simplified Chinese (`zh`)

## Release Baseline

The current production baseline is deployed on Cloudflare Workers with Static Assets. Cloudflare Access protects `/admin` and `/admin/*`; Turnstile protects contact submission; `CONTACT_DB` and `CONTENT_DB` are D1 databases; media uses R2 through `media.tung.codes`.

Admin chrome is Vietnamese. The editor manages and validates four public locales. This distinction is intentional: operational UI is not translated four times, while public content must be complete in `vi`, `en`, `ja`, `zh` before project/post publish.

Public portfolio pages must never disclose source-location information. Only verified product websites and intentionally public editorial links are allowed.

## Eight Phases

| Phase | Status | Artifacts | Exit criteria |
| --- | --- | --- | --- |
| 1. Discovery and evidence | Accepted | Product audit for LogiVN/Fball.vn, research boundary, content model, public-link policy | Claims map to observable product behavior; research is labelled; no source-location link is approved for public use |
| 2. Brand and interface system | Accepted | TUNG LogoKit, favicon/PWA/social assets, hero portrait, editorial tokens, responsive composition, CTA hierarchy and motion | Logo is consistent; hero/media are optimized; key layouts work on mobile/desktop; reduced motion keeps all content visible |
| 3. Localization and routing | Accepted | `vi` default, `/en`, `/ja`, `/zh`, `/vi` canonical redirects, locale switcher, localized metadata and Open Graph locales | Same content structure exists across four locales; canonical/hreflang are correct; localized routes and redirects do not return unintended 404 |
| 4. Public product experience | Accepted | Home, Work, case studies, About, Lab, Contact, Privacy, 404, CTA, project websites and research presentation | Navigation and CTA are clear; LogiVN/Fball links are correct; no unverified metric or source-location information appears |
| 5. CMS, blog and SEO backend | Accepted | `CONTENT_DB`, content/revision/localization model, site section/project/post CRUD, publish workflow, canonical `/blog`, four seeded Blog articles with production WebP covers, RSS, sitemap and structured data | CONTENT migrations through `0046` applied; manual crypto proof storage, currency pricing, payOS reconciliation guards and outbox lease fencing included; public reader serves published locale only; Blog/RSS/sitemap return successfully |
| 6. Admin, CRM and media | Implemented; owner password setup pending | Vietnamese Editorial Control Desk, Cloudflare Access plus password/session gate, four-locale editor, trash/restore, settings, R2 upload/cover selection, contact inbox/detail/search/filter/tags/notes/follow-up/activity and email handoff | Access-authorized owner must create the first password and then pass the password gate; missing migration or `ADMIN_AUTH_SECRET` fails closed; PII remains private/no-store |
| 7. Cloudflare security and operations | Accepted | Workers custom domains, Static Assets route allowlist, Access, Turnstile, `CONTACT_DB`, `CONTENT_DB`, R2, security headers, CSRF/JWT/Origin validation | Apex works; `www` redirects; `/admin` requires Access; Turnstile fails closed; both D1 chains show no pending migration; R2 URL resolves |
| 8. Verification and release | Accepted for current deployment | Smoke tests, Astro check/build, Wrangler dry-run, production route checks, repository-leak scan, release/rollback runbook | Automated gates pass; critical production routes pass; no public source-location leak; rollback target and D1 recovery point are identified before the next release |

“Accepted for production baseline” does not mean the roadmap is closed. Media delete/purge, draft preview/compare, direct email-provider sending and automated accessibility remain controlled enhancements. D1 maintenance query-budget guards are implemented and must be kept in sync with the current Paid-plan limits. Their absence must not be described as an existing capability.

Cloudflare Email Sending is not part of the accepted baseline. The account is now on Workers Paid, but sending remains disabled until sender identity, delivery flow and DNS changes are explicitly approved. Contact submissions are accepted into `CONTACT_DB`; `/admin` is the operational inbox and uses an explicit `mailto:` handoff for replies. Apex Email Routing must remain disabled because inbound mail is handled by Zoho.

## Migration Inventory

### CONTACT_DB — `tungjpstore-contact`

| Migration | Purpose | Production status |
| --- | --- | --- |
| `0001_contact_submissions.sql` | Submission table and base status/time indexes | Applied |
| `0002_contact_limits_and_context.sql` | Company, project website and IP/time index | Applied |
| `0003_contact_rate_limits.sql` | Atomic rate-limit window state | Applied |
| `0004_contact_crm.sql` | CRM fields, tags, notes and activity history | Applied |
| `0005_contact_search_indexes.sql` | Backfill supplementary project-website and locale indexes for an already-migrated CRM | Applied |

### CONTENT_DB — `tungjpstore-content`

| Migration | Purpose | Production status |
| --- | --- | --- |
| `0001_content_cms.sql` | Content, revision, localization, media, audit and site-state schema | Applied |
| `0002_revision_public_projection.sql` | Pin public slug/order/cover to published revision | Applied |
| `0003_seed_public_content.sql` | Idempotent seed: 10 items and 40 localizations | Applied |
| `0004_remove_public_repository_links.sql` | Remove source-link metadata and CTA from public content | Applied |
| `0005_remove_repository_text_references.sql` | Remove remaining source-location text references | Applied |
| `0006_admin_security.sql` | Add password state, session and login-attempt storage behind Cloudflare Access | Applied |
| `0007_seed_blog_series.sql` | Seed four deterministic Blog posts, 16 localizations and four WebP media records | Applied |
| `0008_atomic_admin_lockout.sql` | Upgrade admin login throttling to identity-wide atomic counters while retaining a source fingerprint | Applied |

Shop migrations `0041_shop_seo_catalog_cleanup.sql`, `0042_shop_crypto_payments.sql`, `0043_shop_currency_pricing.sql`, `0044_shop_telegram_bot_scopes.sql`, `0045_shop_crypto_storefront_scope.sql` and `0046_manual_crypto_payment_proofs.sql` are applied in production. `0043` seeds `1 USD = 25,500 VND`; VND remains the editable catalog source and USD/crypto amounts are derived at checkout. Crypto payment proof is reviewed manually; no Bybit/Binance API secret is required.

Before applying any content-cleanup or data-removal migration in another environment, create a D1 bookmark/export and inspect affected rows. Applied migrations are history, not a rollback mechanism.

`CONTENT 0005` now sanitizes list items individually so safe siblings remain. Production had already recorded the migration name before this source hardening; production content was audited after application, and any future corrective data operation must use a new forward migration rather than assuming an edited historical file will run again.

## Latest Release

- Final deploy timestamp: `2026-08-02T07:30Z` (`2026-08-02 16:30 JST`).
- Final release Worker version: `430d6000-2381-4a23-aaf1-b13d55f1ac91`.
- D1 heads: CONTACT `0005`, CONTENT `0046`; Wrangler reports no pending migrations.
- D1 recovery point: Time Travel bookmarks were captured for both databases at `2026-07-23T17:28:00Z` (`2026-07-24 02:28 JST`). Bookmark identifiers are stored privately; the current recovery window is expected to expire at `2026-07-30T17:28:00Z`.
- Verification: 319 smoke tests, Astro check (0 diagnostics), production build, remote migration verification, four production payment QR assets, legacy PayOS/web scope isolation and GLB manual-crypto runtime checks.
- GLB payment methods: Bybit UID (`389068072`) is a separate `internal_uid` method with no network/QR; four Bybit USDT wallet methods remain `onchain_deposit` and manual-review only.
- Owner action: `admin_security_state` is intentionally empty. The Access-authenticated `/admin/` tab is left at the one-time password setup form; the owner must enter a private password that is never copied into chat or logs.
- Migration note: forward migrations through `0046_manual_crypto_payment_proofs.sql` are applied. A recovery export/bookmark remains required before any future destructive or data-removal migration.

## Release Gate

### Code and build

- [x] `npm run test:smoke` passes (319/319).
- [x] `npm run check` reports no errors (only the existing framework diagnostics).
- [x] `npm run build` succeeds.
- [x] `npx wrangler deploy --dry-run` succeeds with expected `CONTACT_DB`, `CONTENT_DB`, `MEDIA` and Turnstile bindings.
- [x] Bulk publish still rejects a fifth item; limit remains `4` unless a query-budget test justifies a change.

### Data and recovery

- [x] `wrangler d1 migrations list` shows CONTACT `0001`–`0005` and CONTENT through `0046` applied with nothing pending.
- [x] Time Travel recovery bookmarks exist for both production D1 databases; identifiers are retained privately and expiry is recorded before release work continues.
- [x] CONTENT has the expected seeded baseline of 14 items and 56 localizations, adjusted only for intentional admin additions.
- [x] An authenticated owner session completed create/save/publish/unpublish/trash/restore/trash across all four locales without losing revision history; the exact-ID QA fixture was then hard-deleted and all related counts returned to zero.
- [x] An isolated CRM fixture completed status/stage/priority, assignee, follow-up, tags and note updates; activity recorded both `contact.updated` and `note.created`, then exact-ID cleanup returned submissions/tags/notes/activities to zero.

### Admin authentication

- [x] Cloudflare Access remains the outer identity gate for exact `/admin` and wildcard `/admin/*` routes.
- [x] Access-authorized sessions must pass the additive password/session gate introduced by `0006_admin_security.sql`.
- [x] `ADMIN_AUTH_SECRET` exists as a Worker Secret; its value is never printed, committed or copied into documentation.
- [x] Missing `ADMIN_AUTH_SECRET`, missing security tables or invalid session state fails closed instead of bypassing the second gate.
- [x] `0008_atomic_admin_lockout.sql` is applied so failed-login throttling uses an atomic identity-wide counter while retaining a keyed source fingerprint for incident review.
- [ ] The owner has completed the one-time password setup in the Access-authenticated `/admin/` tab. This cannot be completed safely by placing the password in automation output or chat.

### Turnstile

- [x] `TURNSTILE_SITE_KEY` is present as public Worker config.
- [x] `TURNSTILE_SECRET_KEY` exists as a Worker Secret; its value is never printed, committed or copied into documentation.
- [x] `CONTACT_HASH_SECRET` exists as a strong, stable Worker Secret; its value is never printed, committed or copied into documentation, and it is not placed in `wrangler.jsonc`.
- [x] Allowed hostnames include apex, `www` and `profile`.
- [x] Widget loads under CSP and adapts to the contact form width.
- [x] Missing token returns `challenge_required`; invalid-token and mismatch handling are covered by smoke tests.
- [x] Site-key/secret mismatch returns `challenge_not_configured` instead of bypassing verification.
- [x] Source fails closed with `contact_hash_not_configured` before Turnstile verification or D1 writes when production Turnstile is active without the HMAC secret.
- [x] Token resets after success, validation error, expiry and timeout so the next submission receives a fresh token.

### Email notification and DNS safety

- [x] Cloudflare Email Sending eligibility was checked after upgrading to Workers Paid; it remains disabled until sender identity, provider flow and DNS preflight are approved.
- [x] Contact success copy promises receipt into the D1 inbox, not automated email delivery; owner replies continue through the explicit `mailto:` handoff in `/admin`.
- [x] Apex Email Routing remains disabled and the existing Zoho MX/SPF configuration remains unchanged.
- [ ] Automated owner notification remains a controlled enhancement requiring a separately approved provider/secret and sender/DNS configuration.

### Production routes and content

- [x] `/`, `/about`, `/privacy`, `/robots.txt`, `/sitemap.xml`, canonical `/blog` and all four RSS feeds return the intended status.
- [x] `/vi` redirects to `/`; `/vi/about` redirects to `/about` while preserving query data where applicable.
- [x] `www` redirects to apex and cannot bypass Access or canonical policy.
- [x] `/admin` and `/admin/api/session` redirect unauthenticated requests through Cloudflare Access.
- [x] At least one Home, Work, case-study, Lab/post and Contact page is visually checked on desktop and mobile.
- [x] Turnstile missing-token rejection and no-JavaScript/native fallback are covered by production/source checks.
- [x] Public HTML, RSS, sitemap, seed/CMS projection and `dist/client` contain no URL, CTA or metadata revealing source location.
- [x] `public/images/blog/ai-workflow-system.webp` exists and is used by the seeded AI workflow article.
- [x] `public/images/blog/cloudflare-rag-edge.webp` exists and is used by the seeded Cloudflare RAG article.
- [x] `public/images/blog/multilingual-product-system.webp` exists and is used by the seeded multilingual product article.
- [x] `public/images/blog/agentic-ai-security-gates.webp` exists and is used by the seeded agentic AI security article.

## Residual Risks and Controlled Gaps

- CSP still includes `'unsafe-inline'` in both `script-src` and `style-src` in `src/middleware.ts`. Removing it requires a separate bundling/nonce hardening pass and must not be claimed as complete.
- Cloudflare Email Sending is available on the account but remains disabled. Automated owner notification has no approved sender/provider configuration; the production handoff remains `mailto:` from the private admin inbox.
- Mixpanel is neither installed nor approved. Cloudflare Web Analytics remains the only intended aggregate analytics provider.
- Fball modules that depend on AI, maps, media, messaging or other provider-cost services remain gated. They must not be presented as enabled production capabilities without verified configuration and release evidence.

## Deploy Record

For each release, record these values in the release note or operations log, not in client-visible content:

| Field | Required value |
| --- | --- |
| UTC/JST timestamp | Exact deploy time |
| Worker version | Version ID returned by Wrangler |
| Previous stable version | Rollback target |
| CONTACT migration head | Expected `0005` |
| CONTENT migration head | Expected `0008` |
| D1 recovery point | Bookmark/export identifier stored privately |
| Verification | Test/check/build/dry-run and production QA result |

## Rollback Runbook

1. Stop further content publishing and record the failing route, request ID and current Worker version.
2. If the failure is Worker-only, restore the previous stable Worker version through Cloudflare Dashboard or `wrangler rollback` after verifying account and version ID.
3. If public content is wrong but schema is healthy, unpublish or restore a known revision in `/admin`; do not roll back the whole deployment.
4. If D1 data was damaged, use the pre-release bookmark/Time Travel or private export. Do not improvise a reverse migration against production.
5. R2 objects are immutable by policy. Point the revision/settings back to the previous object; do not overwrite or broadly delete the bucket.
6. Re-run the production route, Access, Turnstile, RSS/sitemap, locale and source-leak checks before reopening publishing.
7. Document cause, affected data/time window, recovery action and prevention work.

## Release Blockers

- Access does not protect either exact `/admin` or wildcard `/admin/*`.
- Turnstile verification can be bypassed, its secret is absent while the widget is active, or its secret appears in source/output.
- Either D1 database has an unexpected pending/failed migration or lacks a recovery point before destructive change.
- A public route has an unintended 404/5xx, locale/canonical mismatch or stale CMS projection.
- Contact PII appears in public cache, analytics, URLs or logs.
- Public output reveals source-location information.
- Smoke, type/content check, build or Wrangler dry-run fails.
