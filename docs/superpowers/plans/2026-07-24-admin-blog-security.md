# Admin, Blog and Security Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Cloudflare-Free, four-locale TUNG control desk with a second admin password gate, a polished About page, a canonical Blog publication, and verified production rollout.

**Architecture:** Cloudflare Access remains the first identity boundary. A Worker-side password/session boundary, backed by `CONTENT_DB` and `ADMIN_AUTH_SECRET`, gates every admin data/API operation. Public content continues to read only published D1 revisions; `meta.surface=blog` powers canonical `/blog`, while existing `meta.surface=lab` research remains on `/lab`, and public assets remain static-first with reviewed immutable media.

**Tech Stack:** Astro 7, TypeScript, Cloudflare Workers Static Assets, D1 (`CONTENT_DB` and `CONTACT_DB`), R2, Cloudflare Access, Turnstile, vanilla CSS/DOM, local 9Router image generation, Node test runner.

---

## File Map and Ownership

The implementation must preserve the current repository boundaries and avoid public source-location links.

| Area | Create | Modify | Tests |
| --- | --- | --- | --- |
| Admin security | `src/lib/admin/security.ts`, `content-migrations/0006_admin_security.sql` | `src/lib/admin/auth.ts`, `src/lib/admin/types.ts`, `src/pages/admin/api/[...path].ts`, `src/cloudflare.d.ts`, `src/worker-configuration.d.ts` | `tests/admin-security.smoke.test.mjs`, `tests/admin-cms.smoke.test.mjs` |
| Admin shell/editor | `src/styles/admin.css`, optional `src/components/admin/*`, optional `src/scripts/admin/*` | `src/pages/admin/index.astro`, `src/lib/admin/validation.ts`, `src/lib/admin/repository.ts` | `tests/admin-ui.smoke.test.mjs`, `tests/admin-responsive.smoke.test.mjs` |
| About | `public/images/tung-about-portrait.webp` and optional `.avif`, code-native icon component if needed | `src/components/pages/AboutPage.astro`, `src/styles/globals.css`, `src/i18n/dictionaries.ts` | `tests/about-page.smoke.test.mjs`, `tests/content-quality.smoke.test.mjs` |
| Blog and Lab routes | `src/pages/blog.astro`, `src/pages/blog/[slug].astro`, `src/pages/lab/rss.xml.ts`, `src/pages/[lang]/lab/rss.xml.ts` | `src/pages/[lang]/[...slug].astro`, `src/pages/lab.astro`, `src/pages/lab/[slug].astro`, `src/components/Header.astro`, `src/components/Footer.astro`, `src/components/pages/LabPage.astro`, `src/components/pages/PostPage.astro`, `src/i18n/blog.ts`, `src/lib/blog-feed.ts`, RSS/sitemap | `tests/blog-routes.smoke.test.mjs`, `tests/blog-seo.smoke.test.mjs`, `tests/i18n-routes.smoke.test.mjs` |
| Seed/content/media | `content-migrations/0007_seed_blog_series.sql`, `public/images/blog/*.webp` and optional `.avif`, image optimization script if needed | `scripts/seed-content.mjs`, `src/lib/blog.ts`, `src/lib/public-content.ts`, `src/components/pages/HomePage.astro` | `tests/content-seed.smoke.test.mjs`, `tests/content-quality.smoke.test.mjs` |
| SEO/analytics | `src/lib/analytics.ts` only if first-party event attributes are implemented | `src/layouts/BaseLayout.astro`, `src/components/pages/PostPage.astro`, `src/components/pages/HomePage.astro`, `src/styles/globals.css` | `tests/blog-seo.smoke.test.mjs`, `tests/analytics-privacy.smoke.test.mjs` |

The workspace has no Git repository at the time of planning. Use focused test/build checkpoints and preserve diffs; do not make commits a prerequisite for this plan.

## Task 1: Establish Failing Security and Routing Contracts

**Files:**

- Create: `tests/admin-security.smoke.test.mjs`
- Create: `tests/blog-routes.smoke.test.mjs`
- Create: `tests/admin-responsive.smoke.test.mjs`
- Create: `tests/about-page.smoke.test.mjs`
- Create: `tests/analytics-privacy.smoke.test.mjs`
- Modify: `tests/admin-cms.smoke.test.mjs`, `tests/admin-ui.smoke.test.mjs`, `tests/blog-seo.smoke.test.mjs`

- [ ] **Step 1: Write the failing security tests.**

  Add tests that read the source and assert the intended contracts before implementation:

  ```js
  test("admin data routes require the application password session after Access", () => {
    const source = readFileSync("src/pages/admin/api/[...path].ts", "utf8");
    assert.match(source, /verifyCloudflareAccess/);
    assert.match(source, /requireAdminPasswordSession/);
    assert.match(source, /security\/status/);
    assert.doesNotMatch(source, /return adminJson\(\{ ok: true, items: await listContent/); // before a session check
  });
  ```

  Also assert the migration names `admin_security_state`, `admin_sessions`, `admin_login_attempts`; cookie flags; lockout threshold; no password/token logging; and that the setup endpoint is atomic.

- [ ] **Step 2: Write the failing route tests.**

  Assert that the source contains `/blog` canonical paths, `meta.surface=blog`, localized `/en/blog`, `/ja/blog`, `/zh/blog`, unchanged `/lab` research routes, separate Blog/Lab feed filters and homepage article loading. Assert that a surface/route mismatch returns 404, and that `PostPage.astro` includes a required Article image and `https://tung.codes/#person`.

- [ ] **Step 3: Write the failing responsive/accessibility tests.**

  Assert that admin markup includes a skip link, a persistent error summary, a dedicated status element, a single mobile action bar, visible labels, contact detail drawer semantics and focus-return hooks. Assert that admin styling is imported globally rather than relying only on Astro-scoped style tags.

- [ ] **Step 4: Write the failing About/media/analytics tests.**

  Assert that About references `/images/tung-about-portrait.webp`, has localized alt data and `prefers-reduced-motion`; image files have no Downloads path in source. Assert analytics names are allowlisted and no contact fields or admin routes are instrumented.

- [ ] **Step 5: Run focused tests to confirm they fail.**

  Run:

  ```bash
  node --experimental-strip-types --test tests/admin-security.smoke.test.mjs tests/blog-routes.smoke.test.mjs tests/admin-responsive.smoke.test.mjs tests/about-page.smoke.test.mjs tests/analytics-privacy.smoke.test.mjs
  ```

  Expected: failures identify missing security gate, `/blog` route, image, persistent admin states and taxonomy. Do not weaken assertions to make the baseline pass.

## Task 2: Add the D1 Security State and Binding Contracts

**Files:**

- Create: `content-migrations/0006_admin_security.sql`
- Modify: `src/lib/admin/types.ts`, `src/cloudflare.d.ts`, `src/worker-configuration.d.ts`, `tests/admin-security.smoke.test.mjs`

- [ ] **Step 1: Define the migration.**

  Add `PRAGMA foreign_keys = ON`, then create:

  ```sql
  CREATE TABLE IF NOT EXISTS admin_security_state (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    verifier TEXT NOT NULL,
    salt TEXT NOT NULL,
    iterations INTEGER NOT NULL CHECK (iterations >= 100000 AND iterations <= 1000000),
    set_by_sub TEXT NOT NULL,
    set_by_email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    access_sub TEXT NOT NULL,
    access_email TEXT NOT NULL,
    user_agent_hash TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_login_attempts (
    key_hash TEXT PRIMARY KEY,
    window_started_at TEXT NOT NULL,
    failure_count INTEGER NOT NULL CHECK (failure_count >= 0 AND failure_count <= 20),
    lock_level INTEGER NOT NULL CHECK (lock_level >= 0 AND lock_level <= 3),
    locked_until TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(access_sub, expires_at, revoked_at);
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_admin_attempts_lock ON admin_login_attempts(locked_until, updated_at);
  ```

  Add no secrets, passwords, raw IPs or Access JWTs to the migration.

- [ ] **Step 2: Extend Worker binding types.**

  Add optional `ADMIN_AUTH_SECRET?: string` to `AdminBindings` and the generated environment declarations. Keep `wrangler.jsonc` free of the secret; the deploy step uses `wrangler secret put`.

- [ ] **Step 3: Add migration contract tests.**

  Assert the migration is in the CONTENT_DB chain, has no contact binding references, uses the exact singleton/indices/checks, and contains no `SECRET`, `PASSWORD` value or email address.

- [ ] **Step 4: Run the migration-focused test.**

  ```bash
  node --experimental-strip-types --test tests/admin-security.smoke.test.mjs
  ```

  Expected: schema assertions pass while crypto/API assertions remain failing.

## Task 3: Implement Password Verifier, Sessions and Lockout

**Files:**

- Create: `src/lib/admin/security.ts`
- Modify: `src/lib/admin/auth.ts`, `src/lib/admin/types.ts`, `tests/admin-security.smoke.test.mjs`

- [ ] **Step 1: Define pure policy and encoding helpers.**

  Export `validateAdminPassword`, `randomToken`, `base64url`, `derivePurposeKey`, `hashPassword`, `verifyPassword`, `hashSessionToken`, `hashFingerprint`, `parseAdminSessionCookie`, `adminSessionCookie`, and `expired`. Reject values outside 14-128 code points/512 bytes, accidental boundary whitespace, common/domain-derived values and repeated low-variety strings. Do not return or log the password.

- [ ] **Step 2: Implement purpose-separated Web Crypto.**

  Import `ADMIN_AUTH_SECRET` as HKDF input and derive labels `password-pepper-v1`, `session-token-v1`, `login-fingerprint-v1` and `audit-v1`. Use random salt per password verifier, PBKDF2-SHA-256, a recorded iteration count and a constant-time byte comparison. Keep the default at the benchmarked value between 100,000 and 1,000,000; fail deployment if the Worker CPU test cannot keep login within the documented Free-plan headroom.

- [ ] **Step 3: Implement sessions.**

  Create and validate random sessions against D1 using HMAC token hashes; enforce expiry, idle window, Access sub/email match and optional user-agent fingerprint. Update `last_seen_at` only after the 15-minute write interval. Revoke by id/current identity/all sessions. Set `Secure; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=28800`.

- [ ] **Step 4: Implement bounded lockout.**

  Atomically read/update identity and HMAC-IP attempt keys. Apply five failures per 15 minutes, then 15/30/60-minute lock levels, capped at one hour. Clear counters after success. Never store or emit raw IP, Access JWT, cookie token or password.

- [ ] **Step 5: Add security unit/source tests.**

  Test policy boundaries, distinct salts/verifiers, wrong-password failure, session expiry/revocation, Access identity mismatch, lockout progression, generic errors and cookie attributes. Test that audit payloads contain only actor/action/entity/request/time metadata.

- [ ] **Step 6: Run the security unit test.**

  ```bash
  node --experimental-strip-types --test tests/admin-security.smoke.test.mjs
  ```

  Expected: all crypto/session tests pass; API integration assertions remain failing until Task 4.

## Task 4: Gate Every Admin API and Add Security Endpoints

**Files:**

- Modify: `src/pages/admin/api/[...path].ts`, `src/lib/admin/auth.ts`, `src/lib/admin/http.ts`, `tests/admin-security.smoke.test.mjs`, `tests/admin-cms.smoke.test.mjs`

- [ ] **Step 1: Add security status/setup/login/logout/password/revoke handlers.**

  `GET /admin/api/security/status` returns only `{ configured, session: { authenticated, expiresAt } }`. `POST /setup` inserts the first verifier atomically; `POST /login` checks lockout and verifier, creates a session and clears counters; `POST /logout` revokes the current session; `POST /password` verifies current password and rotates the verifier/revokes other sessions; `POST /revoke-sessions` revokes all sessions for the Access identity.

- [ ] **Step 2: Bootstrap CSRF without returning data.**

  Keep `GET /admin/api/session` Access-protected. It may set the existing CSRF cookie and return the CSRF token plus security status, but must not return content, contacts, media, settings or audit data before application authentication.

- [ ] **Step 3: Enforce the gate before all data access.**

  In the API handler, verify Access first, resolve the path, handle the bootstrap security endpoints, then call `requireAdminPasswordSession` before `listContent`, `getContent`, `listContacts`, `getContact`, `getMedia`, settings, revisions, publish, upload or any data-bearing response. Keep mutation Origin/Fetch-Site/CSRF checks and existing body limits.

- [ ] **Step 4: Add fail-closed error behavior.**

  Missing `ADMIN_AUTH_SECRET` or `CONTENT_DB` security tables returns a generic `503 admin_security_not_configured` for data routes. Never fall back to Access-only mode. Generic `401/403` responses do not reveal whether a password was close to valid.

- [ ] **Step 5: Run endpoint source tests.**

  ```bash
  node --experimental-strip-types --test tests/admin-security.smoke.test.mjs tests/admin-cms.smoke.test.mjs
  ```

  Expected: bootstrap endpoints are callable behind Access; unauthenticated data/API paths fail; existing CMS/CRM CSRF and optimistic-lock assertions remain green.

## Task 5: Redesign the Admin Shell and Repair P0 Interaction Defects

**Files:**

- Create: `src/styles/admin.css`
- Create or modify: `src/components/admin/AdminShell.astro`, `src/components/admin/AdminSecurityGate.astro`, `src/components/admin/AdminStatus.astro`, `src/components/admin/AdminErrorSummary.astro`
- Modify: `src/pages/admin/index.astro`, `tests/admin-ui.smoke.test.mjs`, `tests/admin-responsive.smoke.test.mjs`

- [ ] **Step 1: Move admin styles to a global bundled stylesheet.**

  Import `src/styles/admin.css` from the admin entry/layout so JS-created rows, cards, editor blocks, drawers and status panels receive styles. Remove reliance on a scoped `<style>` selector for dynamic DOM. Keep inline script only for the minimum bootstrap or move it into bundled same-origin scripts so CSP can narrow `'unsafe-inline'`.

- [ ] **Step 2: Build the security gate UI.**

  Render setup/unlock states before the workspace. Add visible labels, `autocomplete="new-password"`/`"current-password"`, password guidance, show/hide control with an accessible name, lockout countdown and generic errors. Do not put the value in a data attribute, query string, local storage or analytics event.

- [ ] **Step 3: Build the operational shell.**

  Add skip link, sidebar/rail/drawer navigation, route heading, identity/security badge, production/local environment label from configuration and a single `role="status"` element. Navigation uses links and `aria-current`; locale controls remain complete tabs.

- [ ] **Step 4: Fix dirty state and publish race.**

  Track `savedRevisionId`, `savedVersion`, `dirty` and `savePromise`. Disable publish while dirty; publish calls save with the current serialized editor state, waits for the returned revision/version, then sends that exact revision ID to the review endpoint. Navigation/refresh warns when dirty. A failed save leaves publish disabled.

- [ ] **Step 5: Replace mobile sticky overflow.**

  Use one action row with `min-height: 44px`, `max-height: 88px`, `padding-bottom: env(safe-area-inset-bottom)`, `overflow-x: clip` and two primary controls. Move destructive actions to an overflow dialog. Test 320x568, 375x812 and 390x844 with no page horizontal overflow.

- [ ] **Step 6: Run admin UI tests.**

  ```bash
  node --experimental-strip-types --test tests/admin-ui.smoke.test.mjs tests/admin-responsive.smoke.test.mjs
  ```

  Expected: source/style/security gate assertions pass and the old P0 patterns are absent.

## Task 6: Finish Editor, Validation, Media and Contact Workflows

**Files:**

- Modify: `src/pages/admin/index.astro`, `src/lib/admin/validation.ts`, `src/lib/admin/repository.ts`, `src/pages/admin/api/[...path].ts`, `tests/admin-ui.smoke.test.mjs`, `tests/admin-cms.smoke.test.mjs`, `tests/contact-crm.smoke.test.mjs`
- Create if routes are split: `src/pages/admin/content/[type]/[id].astro`, `src/pages/admin/contacts/[id].astro`, `src/pages/admin/media.astro`

- [ ] **Step 1: Add server publish-readiness output.**

  Extend validation errors with locale, field, block index and human message. Keep `vi`, `en`, `ja`, `zh` required for project/post publishing. Reject unsafe URLs/repository references and unsupported blocks server-side even if the editor is bypassed.

- [ ] **Step 2: Build the persistent locale checklist.**

  Render a focusable summary after failed publish; each issue link focuses the exact input and activates its locale tab. Use one concise status announcement, not `aria-live` on a complete list.

- [ ] **Step 3: Preserve block focus.**

  After move/delete, restore focus by stable block ID, announce `Khối n/m`, disable first/last movement buttons and make Undo immediate and keyboard accessible.

- [ ] **Step 4: Add media picker and usage guard.**

  Implement bounded `GET /admin/api/media?cursor=...&q=...`, metadata preview, selection and usage links. Keep upload MIME/magic-byte/8 MB checks, immutable object keys and referenced-media deletion protection. Do not expose R2 credentials.

- [ ] **Step 5: Repair mobile contacts.**

  Keep `CONTACT_CRM.md` query/update contract, keyset pagination and privacy rules. Add detail drawer/dialog focus management, `aria-current` selection state, no PII in analytics/URL/local storage, and explicit `mailto:` copy.

- [ ] **Step 6: Run focused editor/CRM tests.**

  ```bash
  node --experimental-strip-types --test tests/admin-ui.smoke.test.mjs tests/admin-cms.smoke.test.mjs tests/contact-crm.smoke.test.mjs
  ```

  Expected: existing content/CRM contracts remain green while new readiness/focus/media assertions pass.

## Task 7: Redesign About with the Uploaded Portrait

**Files:**

- Create: `public/images/tung-about-portrait.webp` and optional `public/images/tung-about-portrait.avif`
- Modify: `src/components/pages/AboutPage.astro`, `src/styles/globals.css`, `src/i18n/dictionaries.ts`, `tests/about-page.smoke.test.mjs`, `tests/content-quality.smoke.test.mjs`

- [ ] **Step 1: Inspect and normalize the source image.**

  Read `/Users/tunbee27/Downloads/1pro.png` locally. Remove/simplify the background only if it improves subject separation, apply restrained graphite/lime grading, export responsive WebP (and AVIF when smaller), and record dimensions/byte size in the release notes. Never copy the Downloads path into public HTML.

- [ ] **Step 2: Implement the editorial About hero.**

  Add portrait + caption, a clear positioning statement, location/current focus and one contact CTA. Keep the existing proof-first tone; do not add generic CV claims, fake metrics or repository links.

- [ ] **Step 3: Add process, capability and principle modules.**

  Use localized dictionary keys for observe/define/build/validate/extend, capabilities, permissions/failure/evidence principles and current projects. Use a small inline SVG icon set only where an icon adds meaning; every informative icon has a label.

- [ ] **Step 4: Add controlled motion and responsive crop.**

  Animate only opacity/transform, use `prefers-reduced-motion`, preserve content without JS and verify 390/768/1440 crops. Do not introduce an always-running visual loop.

- [ ] **Step 5: Run About tests.**

  ```bash
  node --experimental-strip-types --test tests/about-page.smoke.test.mjs tests/content-quality.smoke.test.mjs
  ```

  Expected: all four locale keys, image path/alt, CTA, reduced-motion and no-source-leak assertions pass.

## Task 8: Add `/blog` Alongside the Existing `/lab` Research Surface

**Files:**

- Create: `src/pages/blog.astro`, `src/pages/blog/[slug].astro`
- Create: `src/pages/lab/rss.xml.ts`, `src/pages/[lang]/lab/rss.xml.ts`
- Modify: `src/pages/[lang]/[...slug].astro`, `src/pages/lab.astro`, `src/pages/lab/[slug].astro`, `src/components/pages/LabPage.astro`, `src/components/pages/PostPage.astro`, `src/components/Header.astro`, `src/components/Footer.astro`, `src/i18n/blog.ts`, `src/lib/blog-feed.ts`, `src/pages/rss.xml.ts`, `src/pages/[lang]/rss.xml.ts`, `src/pages/sitemap.xml.ts`, `wrangler.jsonc`
- Test: `tests/blog-routes.smoke.test.mjs`, `tests/blog-seo.smoke.test.mjs`, `tests/i18n-routes.smoke.test.mjs`, `tests/cloudflare-config.smoke.test.mjs`

- [ ] **Step 1: Add default and localized Blog routes.**

  Add `/blog`, `/blog/:slug`, `/en/blog`, `/en/blog/:slug`, `/ja/blog`, `/ja/blog/:slug`, `/zh/blog` and `/zh/blog/:slug`. Filter the published snapshot by `meta.surface === "blog"`. Keep `/` as Vietnamese default and keep slug identity shared across locales.

- [ ] **Step 2: Preserve the Lab surface and add explicit surface filtering.**

  Keep `/lab`, `/lab/:slug` and their localized variants as first-class research routes filtered by `meta.surface === "lab"`. Existing five seed posts remain on this surface. A Blog slug requested through a Lab route, or a Lab slug requested through a Blog route, returns 404; no route redirects between surfaces.

- [ ] **Step 3: Separate feeds and internal links.**

  Make `/rss.xml` and localized equivalents contain only `blog` surface posts. Add `/lab/rss.xml` and localized equivalents for `lab` notes. Update header/footer, breadcrumbs and CTAs so Blog links use `/blog` while research links use `/lab`; ensure `localizePath()` owns locale prefixing.

- [ ] **Step 4: Update Worker route allowlist.**

  Add `/blog*` and localized blog patterns to `assets.run_worker_first`; retain `/lab*` because Lab remains dynamic. Run the config smoke test to ensure `/admin`, `/api`, both surfaces, feeds and sitemap remain Worker-first.

- [ ] **Step 5: Run route tests.**

  ```bash
  node --experimental-strip-types --test tests/blog-routes.smoke.test.mjs tests/blog-seo.smoke.test.mjs tests/i18n-routes.smoke.test.mjs tests/cloudflare-config.smoke.test.mjs
  ```

  Expected: `/blog` and `/lab` return their own published surface, mismatched surface/slug routes return 404, Blog/Lab feeds are isolated, and localized canonical/hreflang/RSS/sitemap paths are consistent.

## Task 9: Seed Four Articles and Reviewed Illustrations

**Files:**

- Create: `content-migrations/0007_seed_blog_series.sql`, `public/images/blog/ai-workflow.webp`, `public/images/blog/cloudflare-rag.webp`, `public/images/blog/multilingual-product.webp`, `public/images/blog/safe-agents.webp`
- Modify: `scripts/seed-content.mjs`, `src/lib/blog.ts`, `src/i18n/blog.ts`, `tests/content-seed.smoke.test.mjs`, `tests/content-quality.smoke.test.mjs`

- [ ] **Step 1: Assign publication surfaces before drafting.**

  Extend the validated content metadata with `surface: "lab" | "blog"`. Preserve the five existing research seed entries as `lab`; set all four new article seed rows to `blog`. Existing admin edits keep their current surface unless the owner explicitly changes it and the route/SEO review confirms the consequence.

- [ ] **Step 2: Draft Vietnamese source copy.**

  Write the four article bodies from the specification topics. Each has a concrete problem, operating context, six or more meaningful sections, examples, limits, one primary CTA and no unverifiable metrics. Use structured blocks only.

- [ ] **Step 3: Edit EN/JA/ZH independently.**

  Preserve facts, body structure, CTA intent and SEO requirements while rewriting idiomatically. Run a four-locale completeness check; do not label machine output as final copy.

- [ ] **Step 4: Generate illustrations locally.**

  For each theme run the approved local pipeline without printing a real key:

  ```bash
  ROUTER_API_KEY=local ROUTER_IMAGE_OUTPUT=public/images/blog/ai-workflow.png npm run image:generate -- "Graphite editorial landscape ... human review point ... no text, no logo, no watermark"
  ```

  Repeat with the other three prompts and output names. Optimize the reviewed PNGs to WebP/AVIF using the installed image tool; verify dimensions, byte size, no fake text/logo and correct crop. If the local router is unavailable, retain an explicit non-publishable generated-artifact note rather than inventing a production image.

- [ ] **Step 5: Generate idempotent migration.**

  Add four deterministic post IDs, 16 localizations, `meta.surface=blog`, cover media references/alt text, SEO title/description, status and timestamps. Keep the five prior Lab rows at `meta.surface=lab`. Use `INSERT OR IGNORE`/guards so the migration cannot overwrite later admin revisions. Keep public metadata free of repository references.

- [ ] **Step 6: Add seed/content tests.**

  Assert exactly four new Blog slugs, 16 locale rows, `surface=blog`, 4/4 readiness, non-empty body/SEO/cover/alt, deterministic checksum, natural title lengths, five prior Lab rows with `surface=lab`, and no source-hosting reference. Run:

  ```bash
  npm run cms:seed:dry-run
  npm run cms:seed:check
  node --experimental-strip-types --test tests/content-seed.smoke.test.mjs tests/content-quality.smoke.test.mjs
  ```

  Expected: seed is reproducible and does not alter existing managed content.

## Task 10: Add Homepage Cards, About/Blog SEO and Privacy-Safe Analytics

**Files:**

- Create: `src/lib/analytics.ts` only when needed for allowlisted event dispatch
- Modify: `src/components/pages/HomePage.astro`, `src/components/pages/PostPage.astro`, `src/layouts/BaseLayout.astro`, `src/i18n/blog.ts`, `src/styles/globals.css`, `tests/blog-seo.smoke.test.mjs`, `tests/analytics-privacy.smoke.test.mjs`

- [ ] **Step 1: Load one public snapshot for homepage Blog articles.**

  Extend the homepage route/props so the latest three published posts with `meta.surface=blog` for the active locale are obtained from the existing snapshot, not one D1 query per card. Keep Lab research notes out of this module and preserve 503/no-store behavior when CMS is unavailable.

- [ ] **Step 2: Render the homepage article module.**

  Add one section heading, three responsive cards, covers/alt, category, date, reading time, localized title/excerpt and explicit Blog CTA. Do not display view counts or invented popularity.

- [ ] **Step 3: Repair surface-aware structured data.**

  Add stable Person `@id` and use it in all Person/Article references. Require Article `image`, cover alt, localized date/category, publisher, breadcrumbs and `inLanguage`. Use `/blog` canonical URLs for `surface=blog` and `/lab` canonical URLs for `surface=lab`; ensure `hreflang` contains only actually published locales for the same surface.

- [ ] **Step 4: Add immutable asset headers.**

  Version static image filenames and set long immutable cache headers in the static asset policy. Keep admin preview/R2 metadata responses private/no-store.

- [ ] **Step 5: Add allowlisted analytics attributes/events.**

  Instrument only public navigation/CTA/blog progress/language/contact success category events. Strip email, name, company, message, query strings, admin paths and draft IDs. Preserve Cloudflare Web Analytics as the production provider; do not install Mixpanel Headless because its runtime is absent.

- [ ] **Step 6: Run SEO/analytics tests.**

  ```bash
  node --experimental-strip-types --test tests/blog-seo.smoke.test.mjs tests/analytics-privacy.smoke.test.mjs
  ```

  Expected: stable Person ID, Article image, surface-correct canonical/hreflang/RSS/sitemap, immutable image policy and zero PII analytics assertions pass.

## Task 11: Cross-Audit, Browser QA and Full Verification

**Files:**

- Modify only tests/docs needed to record verified outcomes: `docs/PHASE_RELEASE_STATUS.md`, release note chosen by parent agent

- [ ] **Step 1: Run static/security audits.**

  Use Codex Security source/threat-model review against `src/lib/admin/*`, `src/pages/admin/*`, migration `0006`, public routing, generated assets and `dist/client`. Confirm no secrets, Access claims, raw IP, contact PII or repository URL appear in output. Record observed/inferred/residual risks in `docs/security/admin-hardening.md`.

- [ ] **Step 2: Run UI fallback audits.**

  Use MagicPath if authentication becomes available; otherwise use its documented fallback: inspect source and browser screenshots against `DESIGN_SYSTEM.md`, including generated DOM and mobile breakpoints. Do not block release on a missing MagicPath session.

- [ ] **Step 3: Run motion/i18n audits.**

  Verify Remotion is not bundled for normal page motion, all transforms/opacity honor reduced motion, and every public route/title/CTA/alt/SEO field exists in `vi`, `en`, `ja`, `zh`. Check Japanese/Chinese wrapping without spaces.

- [ ] **Step 4: Run browser QA.**

  Start the dev server only in background mode:

  ```bash
  astro dev --background
  astro dev status
  ```

  Check password setup/login/wrong-password/lockout/logout/password change/revoke-all, admin CRUD/publish/conflict/media/contact flows, About, Blog, Lab, surface mismatch 404s, separate RSS feeds, sitemap and all locales at 320x568, 375x812, 390x844, 768x1024, 1024x768 and 1440x900. Repeat key flows with keyboard, 200% zoom, JS disabled where applicable and reduced motion. Stop with `astro dev stop`.

- [ ] **Step 5: Run automated gates.**

  ```bash
  npm run test:smoke
  npm run check
  npm run build
  npx wrangler deploy --dry-run
  npm audit --audit-level=high
  ```

  Expected: all tests pass, Astro reports zero diagnostics, build and Wrangler dry-run succeed, and any audit warning is documented with a decision.

## Task 12: Apply Migrations, Configure Secret and Deploy Safely

**Files:**

- Runtime: Cloudflare D1 `CONTENT_DB`, Worker Secret `ADMIN_AUTH_SECRET`, deployed Worker
- Documentation: `docs/PHASE_RELEASE_STATUS.md` and private release record

- [ ] **Step 1: Capture recovery points.**

  Create fresh private Time Travel bookmarks/exports for `tungjpstore-contact` and `tungjpstore-content`; verify there are no pending migrations before applying `0006`/`0007`.

- [ ] **Step 2: Apply security migration.**

  ```bash
  npx wrangler d1 migrations apply tungjpstore-content --remote
  npx wrangler d1 migrations list tungjpstore-content --remote
  ```

  Expected: CONTENT head is `0007`, CONTACT head remains `0005`; no migration is applied to CONTACT_DB.

- [ ] **Step 3: Set the secret without displaying it.**

  ```bash
  npx wrangler secret put ADMIN_AUTH_SECRET
  ```

  Paste a locally generated high-entropy value into the hidden prompt. Never echo it, put it in a file, or include it in a release note.

- [ ] **Step 4: Deploy.**

  ```bash
  npm run deploy
  ```

  Record Worker version, previous stable version, migration heads and private recovery point.

- [ ] **Step 5: Complete production owner QA.**

  Through the Access-protected Chrome session, set the password, verify all admin routes require unlock, process a contact, save/publish a draft, test conflict and lockout, and revoke sessions. Publicly verify `/`, `/about`, `/blog`, `/lab`, all four locales, one Blog article and one Lab note per locale, surface-isolated RSS feeds, sitemap, canonical/hreflang, cover images and no source-location leak.

- [ ] **Step 6: Define rollback before acceptance.**

  Worker-only errors roll back to the previous Worker version. Content errors use unpublish/restore-as-new-draft. D1 recovery uses the captured bookmark/export; do not edit or reverse applied migrations. Image errors point revisions to previous immutable assets. If the security secret/migration is missing, admin remains fail-closed rather than reverting to Access-only.

## Self-Review Checklist

- [ ] Every requirement in the design spec maps to at least one task and test.
- [ ] No task relies on a generic “add validation” or “handle edge cases” instruction; paths, contracts and commands are named.
- [ ] Security data stays in CONTENT_DB; contact data stays in CONTACT_DB.
- [ ] `/blog` is canonical for `surface=blog`; `/lab` remains canonical for `surface=lab`; neither surface redirects to the other.
- [ ] Four locale publish readiness is enforced server-side.
- [ ] P0 admin defects are explicitly tested and cannot regress silently.
- [ ] MagicPath/Mixpanel/Remotion limitations are documented without adding unsupported dependencies.
- [ ] Deployment includes recovery, secret, migration, Access and rollback checks.
