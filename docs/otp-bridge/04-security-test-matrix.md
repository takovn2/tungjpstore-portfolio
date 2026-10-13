# TUNG OTP BRIDGE V1: security test matrix

Repository ID: `1409362372`; canonical `takovn2/tungjpstore-portfolio`.
Main base SHA: `3edeed73f45a3dba1a15cae057035e5aa51ed242`. Prior-reviewed HEAD SHA: `14e45e68517a638ff08624fb02fc48c91c4d1a35`. Remediation HEAD is recorded in the external acceptance/PR receipt.
Branch: `codex/otp-bridge-v1`; remediation starts from the clean prior-reviewed HEAD. Final clean worktree and exact heads are verified in the acceptance/PR receipt; final review HEAD, PR URL and CI run URLs are recorded in the PR receipt/final agent output (avoids a self-referential commit hash inside its own tree).
Author review only; independent reviewer not assigned/approved. Flags OFF; production mutations NONE.

## Executed validation (synthetic local data only)

| Command | Result | Evidence |
|---|---|---|
| MailVault `pnpm install --frozen-lockfile` | PASS, lock unchanged | local install |
| MailVault `pnpm typecheck`, `pnpm lint` | PASS | all packages |
| MailVault `pnpm test` | 542 Worker + 106 web PASS; 0 FAIL/SKIP | 37 Worker + 17 web files, includes 12 true-workerd DKIM tests |
| MailVault focused unit/integration customer OTP | 80 PASS, 0 FAIL/SKIP | 33 unit + 47 D1/R2 integration |
| MailVault `pnpm build` | PASS | SPA build + Worker deploy dry-run only |
| MailVault `pnpm test:e2e` | 60 PASS | built owner SPA, local Worker/D1/R2; desktop/mobile |
| MailVault `pnpm audit --prod --audit-level high` | PASS | zero known vulnerabilities |
| Portfolio `npm ci` | PASS | lockfile reproducible |
| Portfolio `npm run types`, `npm run check` | PASS | 0 errors, 0 warnings; 43 existing/tooling hints |
| Portfolio `npm run test:all` | 498 smoke + 17 E2E PASS, 0 FAIL/SKIP | includes 44 original/extended OTP smoke, 15 entitlement, 6 recovery/status and 16 Chromium/WebKit browser tests |
| Portfolio native `MAILVAULT_REPO_PATH=<canonical checkout> npm run test:otp:integration` | 9 PASS, 0 FAIL/SKIP | production reader/Shop endpoint bundles linked in workerd, isolated actual D1/R2 |
| Portfolio `npm run build` and `node scripts/assert-otp-review-build.mjs` | PASS | named binding and OFF flag checked in dist/server/wrangler.json |
| Portfolio `npm audit --json` | PASS | zero known vulnerabilities after remediation |
| Both `git diff --check` | PASS | no whitespace errors |

## Security-negative matrix

| Boundary | Covered cases | Outcome |
|---|---|---|
| Ownership | swapped owner/order/allocation, guest identity unverified, browser alias/email/grant/extra keys | denied before RPC |
| Lifecycle | unpaid, refund/partial refund/cancelled, blocked/deleted customer, held allocation, wrong variant, expired proof/grant, disabled binding/revoked unit | denied |
| Concurrency | 20/50 requests, rolling five-minute/day quota, 50 nonce replay calls, 20 provisioning racers, simultaneous reconciliation, repeat delivery | exactly one eligible winner; lifetime uniqueness |
| During RPC | refund or session revoke completed before final check | no code; final proof/session also joins entitlement SQL |
| During private read | alias disable, deletion, competing new mail | final snapshot fences found |
| MAC | wrong MAC, all signed-field tampering, stale/future issue/window, replay, extra fields, missing secret/OFF | unavailable/denied |
| Email trust | forged Authentication-Results, wrong signer/From, noncryptographic evidence, SPF-only, UNVERIFIED/SPOOFED | never found |
| Code/purpose | reset/recovery/billing, multiple codes/messages, digit-only/order subject, stale/preactivation, malformed JSON, >20 scan candidates | fail closed |
| Mail lifecycle | committed visibility, pending deletion, durable tombstone, uncommitted staging, cross alias | excluded |
| Privacy | minimal response, malformed RPC, no mailRef/alias/body/MAC, audit row fields, no storage/URL code, no public reader HTTP | PASS |
| Browser | mobile Chromium/WebKit, all four locales, Tab/Enter, aria-live, clipboard, stop at 120s, hidden/pagehide/logout/other tab | PASS |
| Regression | owner auth/mailbox, ingest retry/queue/DLQ, cryptographic verifier, sending, scheduler; Shop payments/inventory/customer login/key reveal/admin | full suites PASS |

The native reader fixture installs synthetic cryptographic-evidence metadata; full MailVault verifier/ingest suites separately verify genuine signature behavior. Browser OTP calls use synthetic server responses; the separate native suite verifies real RPC transport. Neither constitutes real third-party provider/production receiving certification. No screenshots containing OTP are committed. Original failures (Node cannot import cloudflare:workers; test locator matched output implicit status; Miniflare API change; test fixture column/session names) were fixed without skipping assertions or weakening production checks.

Raw local logs are transient `/tmp/otp-*` files; repository contains counts/commands and CI links rather than MIME bodies, mappings, OTP screenshots or secret values. CI receipts at the final PR SHA are linked in the PR; CI failures, if any, must be resolved before acceptance. Author review does not satisfy independent P5 review.

Additional actual default-handler boundary test: POST to `/api/customer/otp`, `/api/otp`, `/api/customer-otp/lookupLoginOtp` returns 404 for authenticated owner context despite the OTP flag ON; production unauthenticated GET returns 401. This uses `src/index.ts` and the actual router, not the RPC harness HTTP fixture. Worker regression total is now 542 after complete routing-readiness remediation.

GitHub CI receipts: [MailVault initial exact head](https://github.com/takovn2/mailvault/actions/runs/38433814625), [Portfolio initial exact head](https://github.com/takovn2/tungjpstore-portfolio/actions/runs/38434002462); final receipts are recorded in each PR.

## Review receipt references

The exact file manifest is [00-preflight.md](00-preflight.md); RPC/auth decisions are [01-architecture-contract.md](01-architecture-contract.md), schema/state details are reports 02/03, commands/counts/security negatives and CI receipts are [04-security-test-matrix.md](04-security-test-matrix.md), remaining runtime prerequisites are [05-staging-certification.md](05-staging-certification.md), and operator-only recovery is [06-release-and-rollback.md](06-release-and-rollback.md). These references apply to this deliverable.

PRs: [MailVault #13](https://github.com/takovn2/mailvault/pull/13), [Portfolio #1](https://github.com/takovn2/tungjpstore-portfolio/pull/1). Independent reviewer: unassigned, not approved; drafts await separate P5 review. Initial exact-head CI: [MailVault](https://github.com/takovn2/mailvault/actions/runs/38433814625), [Portfolio](https://github.com/takovn2/tungjpstore-portfolio/actions/runs/38434002462). Final head receipts are attached to the PRs; flags OFF and production mutations NONE.

## Independent review remediation

F-01 through F-04 implementation changes and current evidence are documented in [07-review-remediation.md](07-review-remediation.md). Companion provenance is pinned in [mailvault-companion.json](mailvault-companion.json) and enforced by the native test gate. These remediation sections supersede earlier descriptions/counts. External P5 review remains required; production flags stay OFF.
