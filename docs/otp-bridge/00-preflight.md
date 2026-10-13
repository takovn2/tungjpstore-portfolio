# TUNG OTP BRIDGE V1: preflight

Repository ID: `1409362372`; canonical `takovn2/tungjpstore-portfolio`.
Main base SHA: `3edeed73f45a3dba1a15cae057035e5aa51ed242`. Implementation HEAD SHA: `e56bb6f7ed24b61e755ef11157e56e44d178a68f`.
Branch: `codex/otp-bridge-v1`; code worktree clean after implementation commit. Reports and CI are documented successors; final review HEAD, PR URL and CI run URLs are recorded in the PR receipt/final agent output (avoids a self-referential commit hash inside its own tree).
Author review only; independent reviewer not assigned/approved. Flags OFF; production mutations NONE.

## Verified preflight (P0)

GitHub stable-ID lookup resolves both canonical repositories; historical vn-tak names redirect. Initial CLI identity hello-tako was read-only: no code was written under unconfirmed authority. User explicitly requested login to admin takovn2; completed device flow, `gh api user` verifies takovn2 and both stable-ID responses show push/admin true. Fresh main HEADs match the bases recorded here, rechecked before commits. Main protection API reports false; no rules/settings were changed. Work proceeded in a fresh canonical MailVault clone and exact-base Portfolio checkout; stale MailVault checkout was not modified.

Audit read actual source, migrations, configs, tests and fulfillment/auth calls, not only README. MailVault `apps/worker/src/index.ts:24` adds export alongside existing handlers; `mail/ingest.ts`, `mail/dkim.ts`, `mail/auth.ts`, `mail/otp.ts`, D1 ingest/visibility/deletions and migrations through 0019 were inspected. Actual enum values ACTIVE, READY/READY/OURS, COMMITTED and pending ingest states drove queries. Existing independently verified DKIM metadata is reused; MIME auth headers cannot establish trust.

Portfolio `src/lib/shop/customer-auth.ts:194` resolves secure sessions; `customer-account.ts` requires order ownership; core/inventory/customer migrations and fulfillment code were read. Existing encrypted inventory is not parsed as email/password/TOTP. Actual order item/allocation/unit foreign keys drive immutable entitlements. Postbuild wrapper was checked and generated named binding is asserted. Astro routing/components/framework/i18n and Cloudflare RPC documentation were consulted.

Findings addressed: no existing customer entitlement; old session is not recent auth; no distributed D1 transaction; normal owner message visibility is insufficient for login-only code; alias lifetime reuse unsafe; rate count-then-write unsafe; build-generated service type cannot infer source from separate repository. Implemented narrow fixes are described in reports 01-03. Existing owner/customer/payment systems are retained. Runtime/provider/routing review conditions are listed in report 05; they stop activation, not safe local implementation.

## Exact implementation changed files

| File | Why |
|---|---|
| `.gitignore` | ignore secret-free temporary type generation config |
| `content-migrations/0062_shop_otp_bridge.sql` | additive immutable grant/nonce schema and lifecycle fences |
| `package-lock.json` | declared test tooling and audited compatible dependency locks |
| `package.json` | declared test tooling and audited compatible dependency locks |
| `scripts/generate-worker-types.mjs` | reproducible type generation isolated from developer secrets |
| `src/components/pages/AccountDashboardPage.astro` | per-allocation order panel or transient cross-tab logout clearing |
| `src/components/pages/AccountOrderDetailPage.astro` | per-allocation order panel or transient cross-tab logout clearing |
| `src/components/shop/otp/CustomerOtpCard.tsx` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/components/shop/otp/customer-otp.css` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/i18n/shop-otp.ts` | all four existing customer locales |
| `src/lib/admin/router/shop-routes.ts` | register OTP under existing protected admin router |
| `src/lib/admin/router/shop/otp.ts` | scoped implementation and boundary validation |
| `src/lib/shop/magic-link.ts` | reuse existing identity/session flow for same-session step-up |
| `src/lib/shop/oauth-google.ts` | reuse existing identity/session flow for same-session step-up |
| `src/lib/shop/otp/authorization.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/bindings.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/contract.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/endpoint.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/google-reauth.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/grant-repository.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/inventory-binding.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/rate-limit.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/reauth.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/reconciliation.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/lib/shop/otp/rpc-client.ts` | isolated entitlement/authentication/RPC/UI V1 implementation |
| `src/pages/api/shop/auth/magic-link/consume.ts` | reuse existing identity/session flow for same-session step-up |
| `src/pages/api/shop/auth/oauth/google/callback.ts` | reuse existing identity/session flow for same-session step-up |
| `src/pages/api/shop/auth/reauth.ts` | reuse existing identity/session flow for same-session step-up |
| `src/pages/api/shop/maintenance.ts` | bounded pending grant and attempt reconciliation |
| `src/pages/api/shop/me/orders/[orderId]/otp.ts` | scoped implementation and boundary validation |
| `src/runtime-bindings.d.ts` | optional secret NAME and typed boundary; no provisioned value |
| `src/worker-configuration.d.ts` | canonical Wrangler-generated binding/runtime declarations |
| `tests/helpers/otp-harness.mjs` | synthetic security/concurrency/regression/runtime validation |
| `tests/otp-bridge.integration.test.mjs` | synthetic security/concurrency/regression/runtime validation |
| `tests/shop-glb-manual-payment.e2e.test.mjs` | synthetic security/concurrency/regression/runtime validation |
| `tests/shop-otp-ui.e2e.test.mjs` | synthetic security/concurrency/regression/runtime validation |
| `tests/shop-otp.smoke.test.mjs` | synthetic security/concurrency/regression/runtime validation |
| `wrangler.jsonc` | feature OFF default and scoped named service configuration |

Reporting successors add these seven required reports; Portfolio also adds review-only `.github/workflows/otp-bridge.yml` and `scripts/assert-otp-review-build.mjs` for repeatable final-SHA evidence. CI has no production credentials/deploy job. No generated screenshots, real mapping file, credentials or email body are committed.
