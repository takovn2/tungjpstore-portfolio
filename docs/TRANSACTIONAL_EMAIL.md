# Transactional email

The site uses Cloudflare Email Service through the native `SHOP_EMAIL`
`send_email` Worker binding. Email delivery is asynchronous: request handlers
only enqueue an aggregate reference in D1, and the existing five-minute Worker
cron dispatches pending rows for both `CONTENT_DB` and `CONTACT_DB`.

## Current messages

| Topic | Source database | Enqueued when |
| --- | --- | --- |
| `shop.order.created` | `CONTENT_DB` | Checkout, inventory reservation and order insert commit |
| `shop.order.payment_confirmed` | `CONTENT_DB` | A signed/reconciled payment changes the order to paid |
| `shop.order.fulfilled` | `CONTENT_DB` | The final deliverable allocation changes the full order to fulfilled |
| `shop.customer.welcome` | `CONTENT_DB` | A verified account is first seen; customer dedupe keeps it one-time |
| `contact.submission.confirmed` | `CONTACT_DB` | The public form and rate-limit claim commit |

The queue stores no recipient address, rendered HTML, payment payload, access
token or license key. The dispatcher loads the immutable order/contact snapshot
only after it owns a time-limited D1 lease. Fulfillment email deliberately does
not embed license keys by default; customers return to the protected
order-delivery flow. The email CTA opens the storefront rather than claiming
to authenticate an order on a new device; the protected order token remains in
the checkout browser session until a dedicated, revocable email-access flow is
designed.

## Optional license-key delivery

License-key email delivery is an explicit operational opt-in controlled by the
Worker variable `TRANSACTIONAL_EMAIL_DELIVER_KEYS`. The safe default is `"0"`.
Only the exact value `"1"` enables it. When enabled, the dispatcher re-reads
the order and requires `status = fulfilled`, `payment_status = paid`, and
`fulfillment_status = fulfilled`; it also verifies that every automatic,
tracked license-key quantity has a fulfilled allocation. It then decrypts keys
in memory using the server-only shop crypto binding and passes them directly to
the provider. Keys are never written to D1, outbox rows, provider IDs, logs, or
error messages. A mailbox is not a secure vault: forwarding, retention,
provider scanning, or an account compromise can expose a key. The protected
order-delivery page remains the preferred channel.

## Reliability model

- `dedupe_key` prevents duplicate lifecycle messages.
- `processing` leases can be reclaimed after a crashed Worker invocation.
- Provider message IDs and privacy-safe error codes are retained for audit.
- Transient failures use bounded backoff from 30 seconds to 24 hours.
- Permanent configuration/address failures and eight exhausted attempts move to
  `dead_letter` instead of retrying forever.
- Logs contain the outbox ID, source, topic and error code only. They do not
  include email addresses or message bodies.
- Cloudflare Email Service does not expose a documented provider idempotency
  key in this integration. D1 leases and dedupe prevent normal duplicates, but
  a Worker crash after a provider accepts a message and before D1 records
  `sent` can cause an at-least-once retry. This is especially important when
  optional key delivery is enabled.

## Cloudflare setup

The repository configuration temporarily keeps the verified sender
`orders@tungjpstore.net` while the site origin moves to `tung.codes`. Before
switching the sender to `orders@tung.codes`:

1. Onboard `tung.codes` as a sending domain in Cloudflare Email Service
   and complete the required DNS verification.
2. Confirm the account is on Workers Paid. Cloudflare documents arbitrary
   recipient sending as a Paid capability; verified test destinations are
   available on all plans.
3. Apply `content-migrations/0019_shop_email_outbox.sql` to `CONTENT_DB` and
   `migrations/0006_contact_email_outbox.sql` to `CONTACT_DB` before deploying
   code that enqueues messages.
4. Run `npx wrangler types src/worker-configuration.d.ts` after any binding or
   variable change.
5. Validate delivery first with verified non-production recipients and inspect
   Cloudflare Email Service logs/metrics. Do not use customer data in tests.

No API credential is stored for this integration. The Worker receives the
`SHOP_EMAIL` binding directly from Cloudflare.

Current references (retrieved 25 July 2026):

- <https://developers.cloudflare.com/email-service/api/send-emails/workers-api/>
- <https://developers.cloudflare.com/email-service/configuration/send-bindings/>
- <https://developers.cloudflare.com/email-service/platform/limits/>
- <https://developers.cloudflare.com/email-service/platform/pricing/>

## Local and automated tests

Unit/smoke tests inject `createFakeEmailProvider()` and never invoke the live
Cloudflare binding. The fake captures structured messages in memory and can be
configured to throw provider error codes for retry/dead-letter tests.

```sh
node --experimental-strip-types --test tests/transactional-email.smoke.test.mjs
```

## Authentication templates

Customer magic-link sign-in uses `buildMagicLinkEmail` and sends synchronously via
`SHOP_EMAIL` from `/api/shop/auth/magic-link/request` (not the order outbox). See
`docs/customer-auth.md`.

The localized `buildWelcomeEmail` template is wired to the durable shop outbox.
Standalone builders for signup verification, login alerts, and password reset
are available in `src/lib/email/auth-templates.ts`. They validate HTTPS links
(with localhost HTTP allowed only for local tests), escape dynamic values, and
do not persist tokens. They are intentionally not wired into a request route:
the project does not yet expose a trusted authentication state machine. When
that boundary exists, add dedicated topics and a separate auth aggregate
loader. Never enqueue a raw password, OTP, reset token, or full token-bearing
URL; persist a short-lived, single-use token hash and render the scoped link
only inside the authorized dispatcher.
