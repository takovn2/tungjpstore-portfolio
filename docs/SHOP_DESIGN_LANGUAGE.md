# TUNG Shop Design Language — Soft Teal Professional

Shop là **surface thương mại riêng** trên `tung.codes`. Portfolio giữ dark editorial lime; shop dùng palette pastel tươi, sans-first, bo tròn mềm.

Chi tiết kế hoạch triển khai: session plan *Shop Soft Teal Professional redesign*.

## Positioning

**Soft teal digital market** — cửa hàng số dễ gần, pastel tươi, illustration nhẹ. Không kawaii excess (không mascot che UI), không glassmorphism/bento/gradient tím SaaS.

## Surfaces

| Surface | Brand | Notes |
| --- | --- | --- |
| Web shop (`body.chrome-store`) | TUNG Shop | Full system |
| Telegram `/telegram/shop` | TUNG STORE · mark `T` | vi / VND / PayOS — cùng tokens |
| Telegram `/telegram/glb` | GLB STORE · mark `G` | en / USD / crypto — cùng tokens, payment UI khác |
| Portfolio home featured | Dark shell | `ProductCard` variant portfolio — không ép pastel toàn home |

## Tokens

Nguồn: `src/styles/shop-tokens.css`.

| Token | Value | Role |
| --- | --- | --- |
| `--shop-bg` | `#f4faf9` | Page background |
| `--shop-bg-soft` | `#eaf5f3` | Soft panels |
| `--shop-surface` | `#FFFFFF` | Cards |
| `--shop-ink` | `#2A2430` | Primary text |
| `--shop-ink-soft` | `#7A6F7C` | Secondary text |
| `--shop-accent` | `#2a9d8f` | Primary CTA (soft teal) |
| `--shop-accent-hover` | `#218578` | CTA hover |
| `--shop-accent-2` | `#7C9CFF` | Secondary highlight |
| `--shop-mint` | `#2FC48A` | In stock / success |
| `--shop-sun` | `#FFC857` | Featured / promo |
| `--shop-danger` | `#FF5C6C` | Errors |

Legacy aliases (`--ink`, `--accent`, …) are remapped **only** under `body.chrome-store` and `:root.tg-mini` so existing component CSS picks up the palette without a mass rewrite.

## Typography

- **Sans-first** for catalog, cards, cart, miniapp, PDP titles.
- System stacks only (no runtime web fonts): Avenir Next / Helvetica Neue / SF Mono.
- Mono for order IDs, SKUs, technical status — not long uppercase CTAs.
- Avoid editorial serif billboards on shop surfaces.

## Shape & density

- Card radius `1rem–1.25rem`, chips pill, buttons `~0.85rem`.
- Soft colored shadows (`--shop-shadow`).
- Catalog grid: 3–4 columns desktop, 2 mobile; roomier gaps than the old 5-col market density.
- Product media: pastel frame + `object-fit: contain`.

## Motion

- Hover: slight lift + soft shadow; image scale ≤ 1.03.
- Honor `prefers-reduced-motion`.
- Telegram mini: spring dock/sheet; haptics on VN shop where already wired.

## Primitives

Optional shared classes in `shop-tokens.css`:

- `.shop-btn` / `--primary` / `--secondary` / `--ghost`
- `.shop-chip`, `.shop-badge*`, `.shop-card-shell`, `.shop-empty`

## Assets

- Covers: `public/images/shop/{slug}.webp` (1200×900)
- Thumbs: `public/images/shop/thumbs/{slug}.avif`
- Cache bust: `SHOP_IMAGE_REVISION` in `src/lib/shop/media.ts`
- Prefer **relative** `/images/shop/…` URLs in DB so miniapp thumb rewrite works
- AI generates **background plates only**; logos via Iconify/SVG + Sharp compose (no AI brand marks / price text)

## Accessibility

- Body text contrast ≥ 4.5:1 on cream backgrounds.
- Primary buttons: solid accent fill + white label (not pale pink text on cream).
- Status always has text, not color alone.
- Focus: 2px accent outline with offset.

## Out of scope

- Portfolio dark editorial tokens and case-study chrome
- Admin CMS workspace styling (unless cover preset paths need a version bump)
- Payment / inventory / Telegram session contracts

## Related files

- `src/styles/shop-tokens.css`
- `src/styles/globals.css` → `body.chrome-store`
- `src/components/StoreHeader.astro`, `StoreFooter.astro`
- `src/components/pages/ShopPage.astro`, `ProductPage.astro`, `CartPage.astro`, …
- `src/pages/telegram/shop.astro`, `glb.astro`
- `DESIGN_SYSTEM.md` (portfolio; shop is this document)
