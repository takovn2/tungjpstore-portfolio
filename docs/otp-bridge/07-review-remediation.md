# Independent review remediation: F-01 through F-04

Repository ID `1409362372`, canonical `takovn2/tungjpstore-portfolio`, main base `3edeed73f45a3dba1a15cae057035e5aa51ed242`, branch `codex/otp-bridge-v1`. Prior-reviewed head `14e45e68517a638ff08624fb02fc48c91c4d1a35`. The external PR/acceptance receipt records the successor exact head and clean worktree, avoiding a self-referential hash in this tree. Draft PR: https://github.com/takovn2/tungjpstore-portfolio/pull/1.

Companion MailVault ID `1409350639`, base `9865506ba44bceb9747a1c4f5343a8467f43c120`, exact head `04f8f751cb8b0ba4236714b7257b452f352ef40a`, draft PR https://github.com/takovn2/mailvault/pull/13. Flags OFF; production mutations NONE. This is author remediation evidence, not independent P5 approval.

## F-01: recoverable bounded validation

Migration `0064_shop_otp_validation_recovery.sql` preserves the lifetime attempts, cycle number, safe last failure code/time, next due time, and owner requeue audit. Each cycle admits at most twenty calls, with exponential backoff from 60 seconds to one hour; each execution examines at most ten due grants. A versioned lease prevents cron, page and status races from duplicating calls or stale completions from overwriting revoke/extension/requeue. Exhaustion has a 15-minute cooldown and never resumes automatically in a hot loop.

Protected POST `/api/admin/shop/otp/revalidate` accepts only `{inventoryUnitId,reason}`. Existing Cloudflare Access, password-session and CSRF gates apply; a password session younger than 30 minutes and a bounded safe reason code are required. The atomic batch requeues only a live eligible pending grant after cooldown and appends actor/reason/cycle. It retains total attempts and previous failure metadata; the requeue audit cannot be updated or deleted. Refunded, revoked, expired and legacy misconfigured grants cannot requeue or resurrect. Customer status requests cannot reset exhaustion.

Tests exercise twenty actual failures followed by dependency recovery and the supported requeue path, twenty concurrent requeues, repeated parallel reconciliations, cooldown rejection, refunds and redacted errors. The linked workerd test uses real D1 and named RPC for every routing failure and successful recovery.

## F-02: explicit sold service terms

Audit found `termMonths`, human-readable duration options, catalog titles and Kiro `expiresOn` metadata, but they are not consistently authoritative: later titles conflict with seeded terms, checkout records did not snapshot service access terms, and inventory has no access-expiry column. Neither title parsing nor `shop_orders.expires_at` (payment deadline) can safely define entitlement.

Migration `0063_shop_otp_entitlement_policy.sql` introduces explicit variant policy and immutable policy history. A recent admin configures a reviewed `duration` (integer seconds, 60 to 315360000), `until` (canonical UTC ISO expiry) or explicit `perpetual` policy through POST `/api/admin/shop/otp/policy`. Input includes variantId, expectedRevision and safe reason code, plus durationSeconds or expiresAt only for the applicable kind. Policy changes use compare-and-swap and affect future purchases only.

An order-item INSERT trigger freezes the sold policy inside the existing checkout transaction. The fulfilled allocation/reconciler snapshots service term start, ownership/message start, original expiry and policy version per allocated unit. Duration starts at max(paid_at, fulfilled_at); the message fence also includes verified email, account activation and recorded order ownership linkage. Late verification or delayed readiness cannot lengthen service terms or admit mail from before customer ownership. Only an explicitly sold perpetual policy can have null expiry.

Missing or invalid terms create no entitlement. Migration suspends/version-fences legacy grants without a trustworthy sold snapshot; configuring a later policy cannot rewrite historical rights. Legacy data requires a separately reviewed operator repair based on authoritative sale evidence. V1 does not guess or reassign aliases.

POST `/api/admin/shop/otp/extend` accepts inventoryUnitId, expectedVersion, expiresAt and safe reason. A guarded audit INSERT triggers an atomic effective-expiry/version update for an eligible, unexpired term grant only. Original sold expiry and alias ownership stay immutable. At most one concurrent extension wins; terminal or wall-clock expired grants cannot renew/resurrect. Renewal must be recorded before expiry; an expired alias is never automatically resold.

Real D1 reports triggered rows in meta.changes. The policy and extension paths use SQL RETURNING to identify their guarded statement result rather than assuming changes=1. Native tests caught and verified this distinction.

## F-03: cold alias and first login

MailVault migration `0021_customer_otp_routing_readiness.sql` adds dedicated routing_verified_at. Only a verified provisioning/watchdog delivery path can set it; generic zone discovery cannot refresh it. Readiness requires ACTIVE alias, active/full zone, READY mail/routing, OURS enabled catch-all with exactly one MailVault Worker action, safe complete ordinary-rule enumeration, and routing proof not older than two hours. Disabled routing/catch-all, missing/foreign MX, other Worker, missing/stale/future/malformed proof fail closed. Legacy rows begin with null proof until a fresh legitimate verification. The Cloudflare client reads all ordinary rules with strict stable pagination, unique rule IDs and a maximum of twenty pages/fifty rows per page. Enabled forward/drop/foreign-Worker or malformed rules fail the entire domain closed; even takeover cannot silently override them. An unreadable, changing or truncated enumeration clears the dedicated proof. Disabled rules and a single exact MailVault Worker action are safe. These checks make no Cloudflare mutation.

validateAlias no longer requires a provider message within 24 hours. Actual OTP lookup still requires trusted cryptographic aligned DKIM, exact approved sender/envelope/alias, login purpose, fresh committed visible mail, R2 content corroboration, ambiguity checks and final race fences. A readiness grant does not weaken provider classification.

Activation sets activated_at to the immutable ownership/message start, not validation time. The first fresh post-entitlement message remains eligible after delayed validation; pre-payment, pre-fulfillment, pre-ownership and stale mail remain excluded.

The React card performs bounded POST `/api/shop/me/orders/:orderId/otp-status` refresh every five seconds for at most 120 seconds and supports explicit setup retry. The endpoint resolves session and exact owned allocation before any validation. For an eligible pending grant it invokes the existing due/backoff/version lease reconciler, then rereads minimal state. It never reads an OTP, exposes alias/provider/failure detail or bypasses step-up for actual lookup. This handles a transient initial routing/RPC failure without waiting for the five-minute cron. Hidden/navigation/logout abort status and lookup loops; no browser storage is used. All four locales include the setup retry action.

## F-04: exact companion provenance

Workflow checkout pins MailVault `04f8f751cb8b0ba4236714b7257b452f352ef40a`. `scripts/assert-otp-companion.mjs` checks workflow repository/ref against `mailvault-companion.json`, then verifies the actual companion checkout is clean at that exact SHA. Native tests invoke the same gate. The guard was also exercised against the dirty companion checkout and rejected it before any runtime tests ran, as intended. A future companion revision requires updating both the receipt and workflow and rerunning the joint test evidence. The final PR receipt pairs both heads and their matching GitHub CI URLs.

## Validation evidence

Synthetic local data only; no customer mail or production secret was read. Latest commands/counts appear in report 04 and the final PR receipt. At this remediation source:

| Command | Result |
|---|---|
| MailVault install/typecheck/lint/test/build/test:e2e/audit | PASS: 542 Worker +106 web, 60 E2E; audit zero |
| MailVault focused customer-otp suites | PASS: 80 (33 unit +47 D1/R2) |
| Portfolio npm run types/check | PASS: generated declarations unchanged; 0 errors, 0 warnings, 43 existing hints |
| Portfolio npm run test:all | PASS: 498 smoke +17 E2E, zero skipped |
| Portfolio native named RPC, actual D1/R2 | PASS: 9; includes 20 failure recovery, first pre-activation mail, scoped status recovery and concurrent extension/expiry |
| Portfolio build + assert-otp-review-build | PASS: named binding and OFF default |
| Portfolio audit | PASS: zero known vulnerabilities |
| Both git diff --check | PASS |

Browser suites use actual React with synthetic responses on mobile Chromium/WebKit and test copying, locale strings, timeout/explicit recovery, storage absence and logout. Native tests include a real D1 upgrade from 0062 with historical indefinite grants, then use actual Workers with a test-only clock/registry wrapper and synthetic cryptographic-evidence metadata; MailVault verifier regression separately covers real signature verification. These are local runtime proofs, not live Cloudflare/provider certification or physical Safari evidence.

Existing security-negative coverage remains: cross-customer order/allocation, guest bearer-only access, arbitrary browser alias/email, feature OFF, step-up/session expiry/revoke, refund/reversal, immutable alias ownership, expired terms, concurrent quota/revoke, malformed/replayed MAC, unverified/spoofed/reset/recovery mail, deletion/staging and privacy-safe no-store output. Additional review by a non-author agent is a development sanity check; it does not assign external P5 approval.

## Release gates and rollback

P5 must recheck both exact revised diffs and evidence, especially policies/legacy migration, twenty-failure recovery, chronology, first-code flow and concurrent revoke/expiry. P6 still requires separate operator approval for backups/migrations, service binding/secret deployment, provider samples, actual routing/receipt, physical Safari/latency and flag activation. Both PRs remain draft. No merge, production deployment, DNS/MX changes, secret provisioning, real customer mailbox access or live flag activation occurred.

Apply additive migrations before new code with flags OFF. Rollback disables Portfolio then MailVault flags; retain ownership/history/extension tables and routing proof. Do not roll back to pre-remediation nullable entitlement semantics while flags are ON. Expired/revoked grants remain terminal; unknown legacy rights must not be restored by manual SQL. Cross-D1 and HTTP response delivery are non-atomic; code already delivered to browser/clipboard cannot be withdrawn. That residual boundary still needs explicit product/operator acceptance.

## Exact remediation file manifest

This manifest is the change from prior-reviewed Portfolio head `14e45e68517a638ff08624fb02fc48c91c4d1a35`; report 00 retains the original implementation manifest. Every required report references this supplement.

| File | Why |
|---|---|
| `.github/workflows/otp-bridge.yml` | Check out and enforce the exact final MailVault companion before native tests |
| `content-migrations/0063_shop_otp_entitlement_policy.sql` | Immutable sold policy/ownership chronology, safe legacy suspension, guarded extension history |
| `content-migrations/0064_shop_otp_validation_recovery.sql` | Lifetime/cycle failure metadata and immutable requeue audit |
| `docs/otp-bridge/00-preflight.md` | Preserve prior audit and reference revised authority/evidence |
| `docs/otp-bridge/01-architecture-contract.md` | Explain revised private readiness and RPC chronology |
| `docs/otp-bridge/02-mailvault-implementation.md` | Document dedicated routing proof and unchanged mail trust boundary |
| `docs/otp-bridge/03-shop-implementation.md` | Document sold terms and authorized validation recovery |
| `docs/otp-bridge/04-security-test-matrix.md` | Revised regression/native/negative evidence |
| `docs/otp-bridge/05-staging-certification.md` | Local evidence, legacy prerequisites and remaining P5/P6 gates |
| `docs/otp-bridge/06-release-and-rollback.md` | Additive migration order and safe rollback restrictions |
| `docs/otp-bridge/07-review-remediation.md` | Finding-by-finding reasoning, evidence and exact remediation manifest |
| `docs/otp-bridge/mailvault-companion.json` | Machine-readable canonical companion SHA receipt |
| `scripts/assert-otp-companion.mjs` | Reject workflow/receipt/checkout mismatch or dirty companion |
| `src/components/shop/otp/CustomerOtpCard.tsx` | Bounded setup refresh/retry and cleanup of transient state |
| `src/i18n/shop-otp.ts` | Setup retry strings for all four existing locales |
| `src/lib/admin/router/shop/otp.ts` | Extend existing protected API with reviewed policy/requeue/extension operations |
| `src/lib/shop/otp/entitlement-policy.ts` | Explicit policy compare-and-swap and live-term extension guards |
| `src/lib/shop/otp/grant-repository.ts` | Immutable sold entitlement and ownership/expiry authorization |
| `src/lib/shop/otp/reconciliation.ts` | Versioned lease, bounded backoff and activation at safe entitlement start |
| `src/lib/shop/otp/status-endpoint.ts` | Minimal ownership-scoped readiness refresh without OTP/mail data |
| `src/lib/shop/otp/validation-recovery.ts` | Authorized atomic cycle requeue retaining lifetime attempts |
| `src/pages/api/shop/me/orders/[orderId]/otp-status.ts` | Wire scoped POST through existing Astro customer API |
| `tests/helpers/otp-harness.mjs` | Real migration/policy fixtures and RETURNING-compatible D1 adapter |
| `tests/otp-bridge.integration.test.mjs` | Native two-Worker recovery/chronology/expiry/upgrade counterexamples |
| `tests/shop-glb-manual-payment.e2e.test.mjs` | Explicit sold policy fixture in existing payment/fulfillment regression |
| `tests/shop-otp-entitlement.smoke.test.mjs` | Sold policy, extension, legacy, ownership and expiry races |
| `tests/shop-otp-recovery.smoke.test.mjs` | Exhaustion/requeue/lease/security/status recovery cases |
| `tests/shop-otp-ui.e2e.test.mjs` | Real React mobile setup refresh/retry/first-code cleanup scenarios |
| `tests/shop-otp.smoke.test.mjs` | Expiry fixture and extension-during-RPC version fence regression |

## Residual regression observation

A non-author development run observed one failure in the existing checkout release-discount assertion. The targeted rerun and 300 instrumented repetitions passed; the subsequent complete 498-smoke/17-E2E root run passed. No reproducible cause was found, no assertion was weakened and no unrelated checkout code was changed. This observation is retained for reviewer transparency; final CI must still pass at the exact revised head.
