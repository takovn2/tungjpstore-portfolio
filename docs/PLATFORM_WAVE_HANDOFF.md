# Platform Wave F1–F10 — Full deep handoff

**Updated:** 2026-08-06  
**Depth:** Beyond MVP — D1-backed bridges/affiliates, hybrid AI recommend, admin ops cockpit, cart rails, mini attribution, flywheel on case studies.

---

## Status matrix

| # | Feature | Full depth shipped |
| --- | --- | --- |
| **F1** | Commerce Graph | Client attribution + **server cart bridge** (`POST/GET /api/shop/bridge`, one-time token, D1 `shop_cart_bridges`) + cart “share link” + mini deep-link capture |
| **F2** | AI Concierge | **Heuristic only (LLM locked)**. Hybrid xAI code remains but `SHOP_AI_RECOMMEND_LOCKED=true` until API is ready. |
| **F3** | Offer Engine | Merch rails + **deal badge** on product cards (compare-at / badges) |
| **F4** | Trust OS | Order trust timeline driven by **live order.state** + trust strip |
| **F5** | Checkout Mesh | **Payment rail cards** on cart (select method visually) + rail chips on shop |
| **F6** | Inventory Intel | Classification module + admin counts **critical/low** stock |
| **F7** | Design System | `shop-market.css` expanded (rails, concierge, payment cards, ops cockpit) |
| **F8** | Affiliate | Capture `ref`/`discount`, checkout `externalReference`, **admin affiliates API**, D1 `shop_affiliate_partners` + events |
| **F9** | Ops Cockpit | Admin shop overview **ops score/signals panel** + metrics (critical stock, payment attention, outbox) |
| **F10** | Flywheel | Home (portfolio), shop, **case study** CTA bands |

---

## Migration

```bash
npx wrangler d1 migrations apply tungjpstore-content --remote
```

Creates:

- `shop_cart_bridges`
- `shop_affiliate_partners`
- `shop_attribution_events`

File: `content-migrations/0049_shop_platform_wave.sql`

---

## New / deepened APIs

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/shop/recommend?q=&locale=` | Concierge **heuristic only** (`aiLocked: true`) |
| POST | `/api/shop/bridge` | Create one-time cart share token |
| GET | `/api/shop/bridge?token=` | Consume bridge → cart payload |
| GET | `/admin/api/shop/overview` | Counts + `ops` health snapshot |
| GET/POST | `/admin/api/shop/affiliates` | List / upsert affiliate partners |

### AI path — temporarily locked

Code path for hybrid LLM exists in `src/lib/shop/platform/service.ts` but is **hard-locked**:

```ts
export const SHOP_AI_RECOMMEND_LOCKED = true;
```

To re-enable later (when you have an API key):

1. Set `SHOP_AI_RECOMMEND_LOCKED = false` in `service.ts`
2. `npx wrangler secret put XAI_API_KEY`
3. Set Worker var/secret `SHOP_AI_RECOMMEND_ENABLED=1`
4. Redeploy

---

## Verify

```bash
node --experimental-strip-types --test tests/platform-wave.smoke.test.mjs
npm run build
```

Manual checklist:

1. `/shop` — concierge, rails, payment chips, flywheel  
2. Cart — payment rail cards; **Share cart link** → paste on another browser  
3. `/shop?ref=KOL1&discount=SAVE10` then checkout → order `external_reference`  
4. Order page — trust timeline follows pay/verify/keys  
5. Admin → Shop overview — Ops score + signals  
6. `POST /admin/api/shop/affiliates` with `{ "code":"KOL1", "displayName":"Partner" }`  
7. Miniapp start_param / query `ref` / `discount`  

---

## Deploy

```bash
npx wrangler d1 migrations apply tungjpstore-content --remote
npm run build && npx wrangler deploy
```

---

## Hardening pass (2026-08-06)

| Fix | Status |
| --- | --- |
| Unique `external_reference` (client nonce + server ensureUnique) | Done |
| Checkout attribution log (web + telegram VN) | Done |
| Mini checkout sends `externalReference` | Done |
| Admin Affiliates UI (under Khuyến mãi) | Done |
| Overview revenue/AOV/auto-fulfill/matched-today | Done |
| Inventory alerts list on ops cockpit | Done |
| Order delivery copy automatic vs manual | Done |
| Mini share cart bridge + suggest products | Done |
| AI recommend locked | Still locked |

## Still out of scope (true multi-month)

- Real-time multi-device cart sync service  
- Full partner commission ledger + payouts  
- Dedicated Ops PWA route outside admin  
- Full miniapp CSS component extraction  
- Dispute/key re-reveal audit console  
- LLM streaming concierge UI  
