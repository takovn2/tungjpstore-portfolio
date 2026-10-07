# Shop integrations

## Data boundaries

Cloudflare D1 (`CONTENT_DB`) is the source of truth for products sold, live prices, inventory keys, customers, orders, payments, fulfillment and audit history. Notion is an editorial planning surface. Shop Key AI runs directly as a Cloudflare Worker webhook and never receives an admin cookie or a database credential.

Never place license keys, payment secrets, customer PII, bearer tokens or webhook secrets in Notion, git, `wrangler.jsonc`, logs or the outbox payload.

## Payment infrastructure: Bybit and Binance crypto

The `GLB Store` Telegram Mini App is English-first and displays USD. VND
integer đồng is the single catalog source price: `/admin` edits only VND,
while USD cents and the crypto amount are derived from the stored `USD/VND`
rate. The only new GLB checkout rails are Bybit and Binance for `USDT`/`USDC`.
The legacy Vietnam bot remains Vietnamese, VND and PayOS/VietQR; it never
reads GLB crypto methods. The global customer sees
the selected provider, network, wallet address, memo/tag, exact USD amount and
six-decimal crypto amount with copy buttons. The customer can enter a
transaction reference and upload a proof file. Payment is never marked `paid`
automatically; an authenticated admin must inspect the address, network, amount
and submitted evidence before confirming with a reason.

Apply `content-migrations/0042_shop_crypto_payments.sql`,
`content-migrations/0043_shop_currency_pricing.sql`,
`content-migrations/0044_shop_telegram_bot_scopes.sql`,
`content-migrations/0045_shop_crypto_storefront_scope.sql` and
`content-migrations/0046_manual_crypto_payment_proofs.sql` to `CONTENT_DB`
before creating an active method. The migrations are additive and idempotent.
Manual crypto review does not require Bybit/Binance API credentials or a
crypto reconciliation cron secret. Keep any unrelated Worker secrets out of
`vars`, D1 values and admin form fields.

Create methods in `/admin` with:

- `provider`: `bybit` or `binance`.
- `rail`: `onchain_deposit` for wallet addresses.
- `asset`: `USDT` or `USDC`.
- `network`: `ETHEREUM` (`ERC20`), `BSC` (`BEP20`), `SOLANA` (`SOL`) or
  `POLYGON`, or `TRON` (`TRC20`).
- `destinationType` and `destinationValue`: `wallet_address` + address.
- `expiryMinutes`, optional `memoOrTag`, and active status.

The Worker does not call Bybit/Binance APIs for verification. It creates a
pending crypto attempt, accepts the customer reference/proof, and exposes the
evidence to the authenticated admin. The admin checks the receiving account,
network, amount, transaction reference and proof file, then uses the manual
confirmation action. Provider adapter files remain dormant only for backwards
compatible smoke coverage.

Production activation checklist:

1. Apply migrations `0042` through `0046` remotely and verify there are no pending migrations.
2. Keep `SHOP_ORDER_TOKEN_SECRET`, `SHOP_KEY_ENCRYPTION_SECRET`, the Telegram
   encryption root and legacy PayOS secrets in the Worker secret store. No
   Bybit/Binance API secret is needed for the manual crypto flow.
3. Confirm the seeded `USD/VND` rate in `/admin` (the migration seeds `25,500`
  VND per USD) and edit every active sellable variant's VND source price. New
  English catalog projections, quotes and crypto orders use the current rate;
  existing orders retain their pricing snapshot.
4. Create one `disabled` method per real Bybit/Binance destination in `/admin`,
   verify the address and network, then toggle each method to `active`.
   The current GLB seed is idempotent in `scripts/seed-glb-crypto-methods.sql`
   and contains only the owner-supplied Bybit USDT destinations.
5. Test exact amount/network/address, customer reference, proof upload,
   duplicate submissions and idempotent manual confirmation.
6. Publish inventory only after a low-value test reaches proof submission,
   admin confirmation and fulfillment.

PayOS/VietQR remains the active payment path for the legacy Vietnam Telegram
bot, the public web cart and compatible historical orders. It is not exposed by
the GLB Mini App; GLB checkout only reads active methods with
`storefront_scope='glb'`.

## Notion Plus

Configure these values outside git:

- `NOTION_SHOP_TOKEN` — Worker secret for the Notion integration.
- `NOTION_SHOP_DATABASE_ID` — optional override for Product Planning; the configured workspace data source is `6f4f3b83-4fed-436c-ba4a-b6066d51a7da`.
- `NOTION_EDITORIAL_DATABASE_ID` — optional override for Editorial & SEO; the configured workspace data source is `70d27093-15e5-49b4-a544-a7b18f50f06b`.

The admin endpoints are deliberately read-only previews:

- `GET /admin/api/shop/integrations/notion/status`
- `POST /admin/api/shop/integrations/notion/test`
- `POST /admin/api/shop/integrations/notion/sync`

`sync` means fetch and normalize a reviewable Product Planning + Editorial preview. It does not write `shop_products`, inventory, orders or payments. A future apply action must be an explicit admin publish step keyed by a non-secret `Product Ref`/slug and protected by optimistic version checks.

The adapter accepts Notion `data_sources` and falls back to the legacy `databases` query endpoint. It reads only the first 100 rows and caps the response at 512 KiB.

## Telegram bot registry — thay bot từ `/admin`

The canonical Telegram runtime is the Worker route below. It receives Telegram updates directly, verifies the bot-specific Telegram secret header before parsing the body, scopes duplicate `update_id` values to the originating bot in D1, and responds with localized catalog/menu links. No VPS or long-polling process is required.

```text
POST https://tung.codes/api/telegram/webhook
```

Before enabling the registry, configure a dedicated encryption root as a hidden Cloudflare Worker secret. Never place its value in `wrangler.jsonc`, D1, an admin response, git, logs or chat messages:

- `TELEGRAM_TOKEN_ENCRYPTION_SECRET` — exactly 32 random bytes encoded as canonical base64url.
- `TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION` — non-secret version label for current-write encryption, for example `v1`.
- `TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS` — temporary secret JSON keyring used only while rewrapping rows from an older version.

For key rotation, first place the old version/root in the temporary keyring,
switch the current-write root/version, and call the protected admin rewrap
endpoint for every bot row. Remove the previous key only after a D1 query shows
no row with the old `key_version`. Changing either one without this bounded
rewrap process intentionally makes existing credentials unreadable and stops
bot traffic; this is a fail-closed recovery event, not a routine bot rotation.

Generate the root without printing it to the terminal history:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' | npx wrangler secret put TELEGRAM_TOKEN_ENCRYPTION_SECRET
```

BotFather remains responsible only for creating a bot and issuing or revoking its token. After that token is supplied to the authenticated `/admin` registry, the Worker performs `getMe`, encrypts the token with AES-GCM, generates and encrypts a separate webhook secret, installs localized commands, configures the Mini App menu button and registers the bot-specific webhook. Neither token, webhook secret, IV nor ciphertext is returned by the admin API.

The safe rotation flow is:

1. Create the next bot in BotFather and copy its newly issued token.
2. In `/admin` → `Bot Telegram`, validate and save the bot as `standby`.
3. Activate it. The existing active bot becomes `previous` for a short rollback window while orders, customers, inventory and keys remain in the shared D1 source of truth.
4. Run a private-chat smoke test: open Mini App, load shared order history, create a controlled order if required, and verify key access for the same numeric Telegram user ID.
5. Roll back within the grace window if validation fails. Revoke the old bot only after the new bot is stable.

The Mini App URL and webhook URL are recomputed from trusted `SHOP_PUBLIC_ORIGIN` during activation and include `?bot=<config-id>`. Telegram sessions, orders, encrypted recipients and notification dispatch stay pinned to that bot configuration; customer ownership remains globally keyed by the verified numeric Telegram user ID, never by username.

The legacy `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_BOT_USERNAME` bindings are migration-only. They may serve traffic only while the registry has no active bot. Once a registry bot is active, webhook and Mini App authentication fail closed instead of falling back to the environment token.

If a bot token has appeared in source control, logs, tickets or chat, revoke it in BotFather before deployment. Do not reuse it for local verification. Production registry activation requires a newly generated BotFather token; the Worker generates the bot-specific webhook secret internally.

Production rollout order:

1. Set `TELEGRAM_TOKEN_ENCRYPTION_SECRET` and verify only its name appears in `wrangler secret list`.
2. Deploy the Worker version that understands both the environment fallback and registry schema.
3. Apply `0037_shop_telegram_bot_registry.sql`, `0038_shop_telegram_bot_scoped_updates.sql` and `0039_shop_telegram_bot_scope.sql` to `CONTENT_DB`.
4. Apply `0044_shop_telegram_bot_scopes.sql` before activating more than one bot scope.
5. Register and activate the legacy bot from `/admin`, then verify Vietnamese/VND/PayOS E2E.

## GLB Store Telegram bot

The global bot is a separate registry scope and does not reuse the legacy
webhook or Mini App route:

```text
POST https://tung.codes/api/telegram/glb-webhook
GET  https://tung.codes/telegram/glb?bot=<config-id>
```

Choose `GLB Store · Global · USD · Bybit/Binance` when saving the BotFather
token in `/admin`. Activation installs English commands, the `Open GLB Store`
menu button and the scoped webhook. The GLB API authenticates against only
active/previous GLB credentials, stores `botConfigId` on every Telegram order,
and exposes only `storefront_scope='glb'` crypto methods. Apply migration
`0045_shop_crypto_storefront_scope.sql` and `0046_manual_crypto_payment_proofs.sql`
before creating or activating those methods. Customer proof/reference submission
only moves the attempt to `needs_review`; the admin `manual-confirm` action is
required before fulfillment.

## In-chat commerce (full storefront on Telegram)

The bot is a full buy/pay/key surface bound to the Telegram private-chat user id.
No website form is required for Telegram-native purchases.

| Command / action | Behavior |
| --- | --- |
| `/start` | Main menu: catalog, cart, my orders, keys |
| `/shop`, `/products` | In-chat catalog; product detail with qty ×1/×2/×3, add-to-cart, buy now |
| `/cart` | Multi-line cart: qty +/−, remove, checkout |
| `/discount CODE` or cart “Discount” | Apply coupon (stored on cart; applied at checkout) |
| Buy / checkout | `source_channel=telegram` order; binds Telegram identity; VietQR photo + payOS |
| `/orders` | Recent orders for this Telegram customer id |
| Status refresh | Payment state + QR while unpaid |
| `/keys` | Print license keys in chat for paid orders |
| Paid push (cron) | One-tap **Show keys** |
| Locale | From Telegram `language_code` (en/ja/zh/vi + regional tags like `zh-Hans`, `en-US`) |

Customer model:

- Synthetic email `tg{telegramUserId}@telegram.tungjpstore.local` (no form)
- Identity `provider=telegram`, `external_subject={userId}`
- Orders always attach `customer_id` so `/orders` and `/keys` work across devices for that Telegram account

Only private chats receive order/key data. Group updates get a privacy-safe notice. Callback data stays ≤64 bytes (`cat:`, `pd:`, `buy:`, `os:`, `rf:`, `ko:`, `my`, `keys`, `menu`). Website links remain optional secondary actions.

## Legacy Telegram channel contract

The route below remains only for backward compatibility with an older external channel worker. It is not required by Shop Key AI Bot and should not be enabled for a new deployment. Prefer the direct Worker webhook above.

Configure one high-entropy Worker secret, never a value in `wrangler.jsonc`:

- `SHOP_TELEGRAM_VPS_SECRET`

Every request uses `Authorization: Bearer <secret>` over HTTPS. The bearer is separate from the per-order `orderAccessToken` and from the admin session.

### Catalog

`GET /api/shop/telegram/catalog?locale=vi&featuredOnly=true&limit=24`

Returns the same public catalog projection as the storefront. It never returns encrypted inventory, customer data or internal repository links.

### Checkout

`POST /api/shop/telegram/checkout`

Body is the normal checkout shape plus a required Telegram subject:

```json
{
  "customer": {
    "email": "buyer@example.com",
    "displayName": "Buyer",
    "telegramSubject": "telegram-user-or-chat-id",
    "locale": "vi"
  },
  "items": [{ "variantId": "variant-id", "quantity": 1 }],
  "locale": "vi",
  "idempotencyKey": "telegram-order-unique-key-20260724"
}
```

The API validates `sourceChannel=telegram`, uses a separate `checkout:telegram` idempotency namespace, rate-limits by a pseudonymous Telegram subject, and returns a one-time `orderAccessToken`. The bot should store that token only in its private session store and send it as `X-Order-Access-Token` for status/delivery requests.

### Order status and delivery

- `GET /api/shop/telegram/order` with `X-Order-Access-Token: <token>` returns payment/fulfillment state only.
- `POST /api/shop/telegram/delivery` with the same header returns keys only after payment is confirmed. The response is `no-store`; the Worker never logs the key.

Delivery is retry-safe. Repeating the request returns already-fulfilled allocations instead of reserving another key. Fulfillment events are tagged with the `telegram` channel.

### Legacy outbox retired

The old `/api/shop/telegram/outbox` polling surface is retired and returns `410 legacy_outbox_retired`. New payment confirmations create `telegram_worker` outbox rows only for orders whose `source_channel` is `telegram`; normal web orders do not create unreachable Telegram backlog. The five-minute Worker maintenance dispatches those rows directly through the Bot API with lease fencing, retry scheduling and dead-letter state in D1.

## Cloudflare Paid operating notes

- D1 Paid allows up to 1,000 queries per Worker invocation. The maintenance sweep is intentionally capped at 867 worst-case statements (`24` payOS checks, `100` payment expiries and `50` reservation releases) to retain 133 statements of headroom.
- Workers Paid allows 10,000 subrequests per invocation and six simultaneous outbound connections. payOS reconciliation uses concurrency `4`, processing the 24-item page in bounded waves.
- The five-minute Cron trigger keeps its work inside the documented 30-second CPU and 15-minute wall-time envelope; provider requests remain individually timeout-bounded.
- Remove any legacy VPS outbox poller before release; the endpoint is intentionally retired.
- Run `/admin/api/shop/maintenance` periodically to release expired reservations, payment attempts and stale idempotency records.
- Set the Worker secrets with `wrangler secret put`; do not add them to `vars`.
- Back up/export D1 before applying migrations or changing integration behavior.
