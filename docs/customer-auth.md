# Customer account auth (OAuth + magic link)

Buyer accounts live on the same Workers Paid deployment as DigiStore. Admin
Cloudflare Access is unchanged and never trusts buyer cookies.

## Capabilities

- Google OAuth 2.0 + PKCE
- Email magic link via `SHOP_EMAIL`
- D1-backed sessions (`__Host-shop_session`)
- One-time localized welcome email through the durable email outbox
- Purchase history and on-demand license key reveal
- Guest checkout remains the default path

## Secrets

```bash
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put SHOP_CUSTOMER_SESSION_SECRET   # >= 32 chars
```

## Google Cloud Console

Production uses the dedicated external Google Cloud project `DigiStore Auth`
(`digistore-auth-prod`). The consent screen is published to production with
homepage `https://tung.codes/`, privacy URL
`https://tung.codes/privacy`, and authorized domain `tung.codes`.

The Web client contract is:

1. Authorized JavaScript origin: `https://tung.codes`
2. Authorized redirect URI:
   `https://tung.codes/api/shop/auth/oauth/google/callback`
3. Requested scopes: `openid email profile`

During migration, keep the old origin and callback registered until in-flight
OAuth state cookies and magic links have expired. Host-only cookies do not move
between domains, so users should expect to sign in again on `tung.codes`.

Keep exactly one active client secret after a successful rotation. Upload a
new secret to Cloudflare, complete a real sign-in, then disable and delete the
old Google secret. Never print or download secrets into the repository.

## D1 migration

Apply these migrations to `CONTENT_DB` before deploying the matching code:

- `0023_shop_customer_auth.sql` — identities, sessions, challenges and events
- `0026_shop_customer_welcome_email.sql` — welcome topic and customer aggregate
- `0027_backfill_customer_welcome_email.sql` — one-time pre-existing account backfill

Capture a Time Travel bookmark before structural migrations.

## Routes

| Path | Role |
| --- | --- |
| `/shop/account/login` | Google + magic link |
| `/shop/account` | Dashboard (session required) |
| `/shop/account/orders` | History |
| `/shop/account/orders/:id` | Detail + key reveal |
| `/api/shop/auth/oauth/google/start` | Start OAuth |
| `/api/shop/auth/oauth/google/callback` | OAuth callback |
| `/api/shop/auth/magic-link/request` | Issue magic link |
| `/api/shop/auth/magic-link/consume` | Consume magic link |
| `/api/shop/auth/logout` | Revoke session |
| `/api/shop/me` | Profile |
| `/api/shop/me/orders` | Order list |
| `/api/shop/me/orders/:id` | Order detail |
| `/api/shop/me/orders/:id/keys` | Decrypt keys (rate limited) |
| `/api/shop/me/orders/claim` | Attach guest order by access token |

## Security notes

- Keys stay encrypted at rest; reveal reuses shop inventory crypto.
- Auto-attach only for verified emails (Google `email_verified` or magic link).
- OAuth callback requires both a valid D1 challenge and an exact same-site
  `__Host-shop_oauth_state` cookie match; a missing cookie fails closed.
- Account responses, including localized routes, are `private, no-store` at
  both browser and Cloudflare CDN layers.
- Welcome email enqueue is retried on every verified login and deduplicated by
  `customer-welcome:<customer-id>`, so delivery remains one-time.
- Token claim uses possession of the guest order access token.
- Magic-link requests always return generic success for valid email shapes.
- Cron maintenance purges expired sessions and challenges.

The remaining upgrade roadmap is tracked in
[`customer-auth-upgrade-plan.md`](./customer-auth-upgrade-plan.md).
