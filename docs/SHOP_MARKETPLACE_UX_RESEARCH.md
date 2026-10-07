# TUNG Shop — Marketplace UX Research & Major Upgrade Blueprint

**Research inputs:** Eneba, G2G (digital goods / gaming marketplaces), ecommerce PDP best practices (Baymard-style decision zones).  
**Scope targets:** Web storefront + Telegram Mini Apps (VN/VND + GLB/USD).  
**Stance:** Phá layout cũ nếu cần; **không** đụng payment/inventory contracts trừ khi UI bắt buộc surface field mới từ data đã có.

---

## 1. Research: Eneba & G2G — patterns worth stealing

### 1.1 Discovery (PLP) — “find in 3 seconds”

| Pattern | Eneba-like | G2G-like | Apply to TUNG |
| --- | --- | --- | --- |
| Category / collection rails | Gift cards, top games, promos | Category browse + search | **Merchandising rails** (AI / Creative / Entertainment) + search-first |
| Heavy filters | Region, platform, type | Sort + filter + seller filters | **Category chips + availability + price sort** (single-seller: skip seller rank) |
| Dense product tiles | Cover-forward, price dominant | List/grid hybrid | **Cover full-bleed + price + stock badge + 1 primary CTA** |
| Trust at browse level | “Protect / instant” messaging | Fast delivery badges | **Instant / manual delivery badge** on card from variant metadata |
| Promo density | Banner carousels | Campaign modules | Optional later; **not** block catalog on mobile |

### 1.2 Product detail (PDP) — “remove doubt”

Digital-goods buyers hesitate without **plan clarity**. Market leaders surface:

1. **Hero decision zone (above fold)**  
   Cover · title · price · stock · primary CTA · key facts (duration / devices / delivery type).
2. **Offer / plan selector**  
   Eneba multi-seller ≈ TUNG **variant packages** (1 month / 3 month / API pack…).  
   Each plan: price, compare-at, stock, max per order, what you get.
3. **Specification / inclusion block**  
   “What you receive”, region/platform if any, activation notes.
4. **How delivery works**  
   Auto key after pay vs manual review (GLB crypto).
5. **Risk reducers**  
   Refund policy link, support channel, order tracking promise.
6. **Social / proof (optional)**  
   Ratings if real; otherwise **skip fake reviews** (aligns with TUNG editorial honesty).

### 1.3 Purchase flow — continuous logic

| Step | Marketplace norm | TUNG today | Target |
| --- | --- | --- | --- |
| Browse | Search → filter → tile | Catalog OK after cleanup | Keep + rails |
| Inspect | Full PDP / offer sheet | **Mini: thin modal** | **Rich product sheet** |
| Choose plan | Explicit offer row | Variants present but weak UI | **Plan cards with benefits** |
| Cart | Qty, line total, discount | Works | Visual polish + sticky checkout |
| Pay | Provider-specific | PayOS / crypto proof | Keep rails; **progress UI** |
| Fulfill | Key reveal + order history | Exists | **Guided “Keys ready” state** |

**Principle:** Every CTA has a next state that answers “what happens after I tap?”

### 1.4 Mobile / Mini App (G2G app, Eneba app lessons)

- Bottom tab shell: Shop · Cart · Orders (already have).
- **Product open = full-height sheet**, not a tiny dialog.
- Primary CTA sticky in sheet footer.
- Haptic + loading skeletons (VN mini already partial).
- Zero long marketing hero on home — **catalog density**.

---

## 2. Gap analysis — TUNG today

### 2.1 Web shop

| Strength | Weakness |
| --- | --- |
| Teal professional tokens, full-bleed covers | No category merchandising rails |
| Real PDP with description + variants | Still hybrid editorial density |
| SEO landing + FAQ | Catalog and trust UX not “marketplace grade” |
| Cart/checkout flow exists | Visual continuity header → cart → pay uneven |

### 2.2 Telegram Mini VN (`/telegram/shop`) — critical

**SSR product payload includes:** title, eyebrow, shortDescription, 1 image, variants (price, stock, max).  
**Does NOT include:** full `description`, badges, delivery type, category, SEO/FAQ snippets, multi-media.

**UX impact:** Tap product → modal with short blurb + plan list → customer **không đủ tin** để mua.

### 2.3 Telegram Mini GLB (`/telegram/glb`) — worse PDP

- **No product detail sheet** — only “Add” + optional `<select>`.
- Description = shortDescription only on card.
- Crypto flow has long copy at checkout; **product** remains opaque.

### 2.4 Design debt

- Dual CSS monoliths (shop.astro / glb.astro) + class mismatches historically.
- No shared design system component layer for mini.
- Web and mini do not share PDP information architecture.

---

## 3. North-star product vision

> **TUNG Shop = single-seller digital marketplace UI**  
> Eneba/G2G-level **clarity and density**, without multi-seller noise; teal professional brand; same IA on web + both minis.

### Non-goals

- Fake ratings / fake stock urgency.
- Redesign admin CMS (unless product attributes need new fields).
- Change PayOS / crypto verification backend in UI phase 1.

---

## 4. Information architecture (shared)

### 4.1 Product card (PLP)

```
[ Cover full-bleed ]
Title
Eyebrow / category · delivery badge
From {price} · stock
[ + / Chọn gói ]
```

### 4.2 Product detail (PDP / Mini sheet)

```
[ Cover large ]
Title · category · stock pill
Price of selected plan · compare-at
── Plan selector (cards) ──
  Plan name · price · stock · “what you get” line
── What’s included ──  (from description bullets or shortDescription + description)
── How you receive it ──  (auto key / manual)
── Need help ──  (support)
[ sticky: qty? ] [ Add to cart ] [ Buy now ]
```

### 4.3 Cart → Pay → Keys

Linear step rail (already on web): Cart → Auth/details → Pay → Keys.  
Mini: Cart dock → Checkout modal with **steps** + order status card.

---

## 5. Major upgrade workstreams

### Workstream A — Shared design system “Market”

New module (greenfield UI allowed):

```
src/styles/shop-market.css          # tokens + density scale
src/components/shop/market/         # web Astro primitives
  ProductTile.astro
  PlanPicker.astro
  TrustStrip.astro
  StickyBuyBar.astro
src/lib/shop/product-view.ts        # normalize PublicProduct → MarketProductView
```

Mini: extract `src/styles/telegram-market.css` + shared render helpers (not 1300-line one-offs).

**Permission to scrap:** old hero/editorial PDP chrome, mini “empty modal”, dual unstyled button systems.

### Workstream B — Rich product model for UI

Use existing CMS fields first:

| Field | PLP | PDP web | Mini sheet |
| --- | --- | --- | --- |
| title, media, minPrice | ✓ | ✓ | ✓ |
| shortDescription | teaser | lead | ✓ |
| description | — | full | ✓ **add to payload** |
| eyebrow, category | ✓ | ✓ | ✓ |
| badges | optional | ✓ | ✓ |
| variants.* | from | full plan UI | full plan UI |
| availability | badge | badge | badge |

If metadata has duration/devices later: surface as **spec chips**. Optional migration for structured `specs_json` only if content team needs it.

### Workstream C — Mini App PDP overhaul (highest conversion impact)

1. Expand SSR JSON: `description`, `badges`, `category`, `categorySlug`, all media (or 3).
2. Replace open-product modal with **ProductSheet**:
   - Full-bleed cover
   - Plan list as selectable cards (selected ring + price)
   - Description scroll section (clamp + “Xem thêm”)
   - Delivery explainer (VietQR auto vs GLB manual)
   - Sticky footer CTA: Add · (optional) Checkout now
3. GLB: **same ProductSheet** (en copy); plan select no longer only inline `<select>` on card.
4. Empty/loading skeletons; error states with retry.

### Workstream D — Web storefront marketplace density

1. Home of shop = search + category rails + grid (already product-first).
2. PDP: sticky buy column, plan cards, spec chips, delivery block, related products.
3. Cart: line-level plan name + trust mini-strip; primary CTA always visible.
4. Order status: timeline visual (created → paid → keys).

### Workstream E — Continuity & performance

- Same tokens teal professional.
- Image: cover full-bleed, `srcset` thumbs on mini.
- Prefetch product sheet data from already-bootstrapped catalog (no extra RTT if payload expanded carefully).
- Keep Telegram CSP / no-store behavior.

---

## 6. Purchase flow — target state machines

### Web

```
PLP → PDP (plan selected) → Add
  → Cart drawer | Cart page
  → Checkout (auth if needed)
  → Pay (QR / instructions)
  → Order status → Reveal keys
```

### Mini VN

```
Home grid → ProductSheet → Add
  → Cart tab + dock
  → Checkout (PayOS modal with steps)
  → Orders tab → Keys sheet
```

### Mini GLB

```
Home grid → ProductSheet → Add
  → Cart → Checkout (method pick)
  → Payment instructions + proof
  → Orders → Keys
```

Every state shows: **order total, what was bought, what to do next**.

---

## 7. Content requirements for “dare to buy”

Per product (CMS, 4 locales ideally; VI minimum for VN mini):

1. **shortDescription** — 1 sentence value.
2. **description** — 3–8 short paragraphs or bullets: duration, devices, how to activate, limitations.
3. **Variant titles** — human plans, not SKUs only (“1 tháng”, “API 100$”).
4. Optional badge: “Giao key tự động”, “Xử lý thủ công”.

Without content, UI can only polish empty shells — content pass is part of the upgrade.

---

## 8. PR Plan (incremental, shippable)

### PR-M1 — Product view model + expanded mini payload  
- `product-view.ts`  
- Expand SSR maps for shop + glb minis  
- Tests: payload contains description, badges  

### PR-M2 — Mini ProductSheet (VN)  
- New sheet UI/CSS/JS  
- Plan cards + sticky CTA + description  
- Remove thin open-product body  

### PR-M3 — Mini ProductSheet (GLB) parity  
- Shared CSS module  
- en copy, crypto delivery explainer  

### PR-M4 — Web PlanPicker + sticky buy + delivery block  
- ProductPage restructure (may scrap old gallery chrome)  
- Related products rail  

### PR-M5 — Cart/Checkout visual continuity  
- Shared step + trust components web + mini dock  

### PR-M6 — Merchandising rails + empty/skeleton polish  
- Category rails on PLP  
- Motion / reduced-motion audit  

### PR-M7 — Content seed pass  
- Refresh product descriptions for top 15 SKUs (VI + EN)  

---

## 9. Success metrics

| Metric | Baseline | Target after upgrade |
| --- | --- | --- |
| Mini product open → add rate | low (qualitative) | ↑ clear plan + description |
| Support questions “gói này là gì?” | high | ↓ |
| Time to first product inspect | — | &lt; 2 taps from home |
| Visual parity web ↔ mini | fragmented | one IA |
| Checkout drop after open product | — | measure via funnel later |

---

## 10. Key decisions (recommended defaults)

1. **Single-seller marketplace UI**, not multi-seller clone.  
2. **Scrap** thin mini modals; full ProductSheet is mandatory.  
3. **Expand catalog bootstrap payload** (description) rather than per-product fetch (simpler offline mini). Cap description length in payload if needed (~2–4k chars).  
4. **No fake reviews.** Trust = delivery clarity + policy links + stock truth.  
5. **Keep teal professional** palette; density marketplace, not candy.  
6. **Greenfield layout OK** for PDP/sheet; preserve API routes and cart keys.

---

## 11. Implementation status (2026-08-05)

| Milestone | Status | Notes |
| --- | --- | --- |
| M1 product-view + payload | **Shipped** | `src/lib/shop/product-view.ts`, mini SSR `serializeMiniCatalog` |
| M2 VN ProductSheet | **Shipped** | Plan cards, description, delivery, sticky add |
| M3 GLB ProductSheet | **Shipped** | Parity sheet + open from card |
| M4 Web PlanPicker + delivery | **Shipped** | `PlanPicker.astro`, sticky buy bar |
| M5 Cart continuity | **Shipped** | Trust strip on cart |
| M6 Category rails | **Shipped** | Horizontal chips on PLP |
| M7 Content + icons | **Shipped** | Migration `0048`, chrome icons via imagegen |
| M8 marketplace density polish | **Shipped** | Spec chips, TrustStrip, delivery journey on PDP; ProductCard delivery badge + CTA labels; CheckoutStepRail progress; Order live rail; mini trust strip restored |

Production deploy includes worker + D1 `0048`.

---

## References (external patterns)

- Eneba: category/collection density, protect/instant framing, filter-first discovery.  
- G2G: search/filter/sort, fast checkout, mobile app “few steps”, digital goods taxonomy.  
- Ecommerce PDP: above-fold decision zone (image, price, CTA, key attributes); below-fold consideration (details, FAQ, related).  
- Marketplace listing clarity: scannable detail without doubt (price, availability, delivery).
