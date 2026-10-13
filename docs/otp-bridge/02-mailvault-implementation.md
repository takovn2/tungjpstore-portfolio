# TUNG OTP BRIDGE V1: mailvault implementation

Repository ID: `1409362372`; canonical `takovn2/tungjpstore-portfolio`.
Main base SHA: `3edeed73f45a3dba1a15cae057035e5aa51ed242`. Prior-reviewed HEAD SHA: `14e45e68517a638ff08624fb02fc48c91c4d1a35`. Remediation HEAD is recorded in the external acceptance/PR receipt.
Branch: `codex/otp-bridge-v1`; remediation starts from the clean prior-reviewed HEAD. Final clean worktree and exact heads are verified in the acceptance/PR receipt; final review HEAD, PR URL and CI run URLs are recorded in the PR receipt/final agent output (avoids a self-referential commit hash inside its own tree).
Author review only; independent reviewer not assigned/approved. Flags OFF; production mutations NONE.

## MailVault changes

`0020_customer_otp_rpc_nonces.sql` adds only `customer_otp_rpc_nonces(request_id PRIMARY KEY, expires_at)` and its expiry index. No payload, MAC, code, sender or credentials are persisted. Existing dynamic migration-ledger deployment gate automatically requires this migration; no production migration was run.

New customer-otp modules separate strict contract, HMAC/nonces, compiled policy, trust/classification, scoped lookup and named entrypoint. `index.ts` adds one named re-export; its existing handlers are unchanged. `env.ts` declares the flag and optional secret name; Wrangler defaults `MAILVAULT_CUSTOMER_OTP_ENABLED` to string `false`. Generated Cloudflare bindings were produced by Wrangler, not manually edited. Node regression import compatibility uses a test-only WorkerEntrypoint shim; actual RPC is independently tested inside native workerd, never certified by that shim.

Errors are reduced to safe states, with no error/body/OTP logging. Reader creates nonce metadata only and does not consume, mark read, delete or copy customer mail into Shop. Existing retention remains authoritative. HTML-only or unsupported messages fail closed until a separately reviewed template supports them.

`0021_customer_otp_routing_readiness.sql` adds dedicated domain readiness proof. Discovery cannot set it. Provisioner/watchdog must verify MX, routing, exact MailVault catch-all and all bounded ordinary routing rules before certifying it; unreadable/conflicting rules invalidate proof. A cold alias does not require a recent provider email to become ready. Actual lookup retains independent cryptographic sender/purpose/freshness and visibility checks. See report 07 for F-03 and native first-code evidence.

## Review receipt references

The exact file manifest is [00-preflight.md](00-preflight.md); RPC/auth decisions are [01-architecture-contract.md](01-architecture-contract.md), schema/state details are reports 02/03, commands/counts/security negatives and CI receipts are [04-security-test-matrix.md](04-security-test-matrix.md), remaining runtime prerequisites are [05-staging-certification.md](05-staging-certification.md), and operator-only recovery is [06-release-and-rollback.md](06-release-and-rollback.md). These references apply to this deliverable.

PRs: [MailVault #13](https://github.com/takovn2/mailvault/pull/13), [Portfolio #1](https://github.com/takovn2/tungjpstore-portfolio/pull/1). Independent reviewer: unassigned, not approved; drafts await separate P5 review. Initial exact-head CI: [MailVault](https://github.com/takovn2/mailvault/actions/runs/38433814625), [Portfolio](https://github.com/takovn2/tungjpstore-portfolio/actions/runs/38434002462). Final head receipts are attached to the PRs; flags OFF and production mutations NONE.

## Independent review remediation

F-01 through F-04 implementation changes and current evidence are documented in [07-review-remediation.md](07-review-remediation.md). Companion provenance is pinned in [mailvault-companion.json](mailvault-companion.json) and enforced by the native test gate. These remediation sections supersede earlier descriptions/counts. External P5 review remains required; production flags stay OFF.
