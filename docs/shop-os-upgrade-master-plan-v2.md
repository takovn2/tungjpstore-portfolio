# SHOP OS v2 — Kế hoạch nâng cấp tổng thể (bản sửa lại 2026-08-29)

> **Bản sửa quan trọng:** Bản kế hoạch đầu tiên (shop-os-upgrade-master-plan.md) viết dựa trên sai lầm nghiên cứu — cho rằng chưa có web storefront. Thực tế **tung.codes/shop đã là một hệ thống commerce hoàn chỉnh và hiện đại hơn fball.vn Teleshop ở nhiều mặt**. Bản này viết lại toàn bộ trên nền tảng thực tế đúng.

---

## 1. Hai hệ thống Shop đang tồn tại (thực tế đã xác minh)

### 1.1 Hệ thống A — tung.codes/shop (project `~/Documents/Profile`)

**Stack:** Astro 7 + Cloudflare Workers + D1 (2 databases: content + contact) + R2 + Send Email binding.

**Quy mô code vùng Shop:** ~28.500 dòng, 33 migrations shop, 51 file test.

| Thành phần | Chi tiết đã có |
|---|---|
| **Web storefront đa ngôn ngữ** | `/shop` 4 locale (vi/en/ja/zh), product pages `/shop/[slug]`, cart, order tracking, account system (magic link + Google OAuth), order QR |
| **2 bot Telegram** | (1) Legacy VN bot (`telegram/shop.astro`, 2.060 dòng) — VND, PayOS/VietQR; (2) **GLB Store Mini App** (`telegram/glb.astro`, 946 dòng) — English-first, USD, crypto Bybit/Binance USDT/USDC |
| **Telegram Mini App platform** | Session auth, branding, API proxy `/api/shop/telegram-mini/[...path]`, bot registry với scope legacy/glb (migrations 0035–0045) |
| **Thanh toán** | PayOS + VietQR **có webhook + reconciliation tự động** (`reconcilePendingPayOsPayments` — quét pending, claim fence chống race, orphan recovery); Crypto manual review flow với proof upload (bybit/binance, 4 networks); wallet VND/USD |
| **Customer system** | Đăng nhập magic link + Google OAuth, order history, claim orders, key viewer |
| **Loyalty** | 4 tier (standard/silver/gold/diamond) theo lifetime spend, discount theo tier |
| **Broadcast engine** | Campaign flash sale, rate-limit 30 msg/s compliance Telegram |
| **Platform Wave F1–F10** | Cart bridge (share cart token), Affiliate + commission ledger (bps, accrued/void/paid), Attribution events, AI Concierge (heuristic, LLM path đã code nhưng locked), Merchandising badges, Trust OS timeline, Checkout Mesh (rail selection UI), Inventory Intel, Ops Cockpit, Portfolio↔Shop flywheel |
| **Admin console** | 9 tabs: Overview, Catalog, Inventory, Orders, Payments, Fulfillment, Telegram, Discounts, Settings |
| **Email** | Transactional outbox (D1-backed), delivery templates, welcome email |
| **Notion** | Editorial planning integration (read-only planning surface) |
| **AI** | "Shop Key AI" Worker webhook riêng, không nhận admin cookie/DB credential; OCR + inventory import |

**Điểm đặc biệt:** Kiến trúc bảo mật rất chặt — payment KHÔNG BAO GIỜ tự mark paid với crypto (admin phải inspect evidence); D1 conditional update làm cross-isolate fence; rate limit checkout; secret không bao giờ vào Notion/git/logs.

### 1.2 Hệ thống B — fball.vn Teleshop (project `~/Documents/fball.vn`)

**Stack:** Next.js + Supabase Postgres + Vercel.

**Quy mô:** ~12.000 dòng, 4 migrations (P19 + P20).

| Thành phần | Chi tiết đã có |
|---|---|
| **Bot Telegram Shop** (P19) | 1 bot: storefront khách + owner panel trong 1, duyệt đơn thủ công, CSV/JSON inventory import, OCR (P20) |
| **Teleshop console** | 7 màn hình, khoá 2 lớp middleware + server re-check theo email owner |
| **AI (Qwen)** | Normalize kho, OCR, product copy, support reply draft |
| **Staging pipeline** | AI/OCR → staging review → commit (không tự vào kho bán) |
| **Bảo mật** | AES-256-GCM, hash Telegram IDs, RLS mọi bảng, fingerprint chống trùng key |

**Hạn chế so với hệ A:** 1 bot duy nhất, thanh toán hoàn toàn thủ công (không có webhook PayOS/reconciliation), không có web storefront công khai, không có customer account/loyalty/affiliate/broadcast/email.

### 1.3 Kết luận chiến lược

**Hệ A (tung.codes) là "flagship commerce" — trưởng thành hơn hẳn. Hệ B (fball.vn Teleshop) là "shop bên trong sản phẩm SaaS" — mới hơn về thời gian đóng gói P19/P20 nhưng tính năng commerce thưa hơn.**

→ Chiến lược đúng KHÔNG phải "nâng cấp từng hệ riêng lẻ", mà là:

1. **Đưa hệ B lên chuẩn của hệ A** (feature parity cho phần commerce lõi).
2. **Nâng cả hai lên đẳng cấp mới** bằng những thứ CHƯA hệ nào có.
3. **Kết nối hai hệ thành một liên minh vận hành chung** (shared ops, cross-sell).

---

## 2. Ba lớp nâng cấp

### LỚP 1 — Parity: fball.vn Teleshop lên chuẩn tung.codes (P60–P62)

#### P60 — Payment automation cho fball.vn (tuần 1–3) ⭐ ưu tiên cao nhất
- [ ] Tích hợp **PayOS webhook + reconciliation sweep** — port pattern `reconcilePendingPayOsPayments` từ `src/lib/shop/service.ts` (hệ A) sang fball.vn: bảng `shop_payment_attempts`, claim fence bằng conditional update, orphan recovery, evening sweep job.
- [ ] Auto-fulfill cho đơn `credential`/`redemption_code` sau khi payment verified (giữ approval owner cho `manual_service`).
- [ ] Idempotent webhook (dedup `provider_event_id` — hệ A đã có pattern `shop_payment_webhook_events`).
- [ ] Chuyển đổi quy ước dữ liệu: fball dùng Postgres/Supabase (không D1) — viết lại SQL cho RLS + service-role.
- **Acceptance:** đơn bot → customer chuyển khoản → PayOS webhook → key tự giao < 60s; orphan transaction có đường recovery; không oversell.

#### P61 — Customer & kênh bán (tuần 3–5)
- [ ] **Web storefront nhỏ** cho danh mục fball (`/shop` trên fball.vn, render `shop_products` active, structured data SEO) — chỉ catalog + checkout, KHÔNG duplicate backend: order vẫn tạo trong cùng pipeline shop_*.
- [ ] **Customer accounts** cho shop (magic link hoặc Telegram-linked identity — không bắt buộc password).
- [ ] **Email outbox** giao key + xác nhận đơn (Supabase + Resend/SES — port template từ hệ A).
- [ ] Loyalty tier đơn giản (2 mức: thường + repeat buyer) — mở rộng sau.
- **Acceptance:** khách mua từ web được, nhận key qua email + Telegram, đơn thứ 2 được giảm giá tự động.

#### P62 — Vận hành (tuần 5–6)
- [ ] Broadcast engine port từ hệ A (rate-limit 30/s, campaign, blocked users tracking).
- [ ] Queue health dashboard + replay + alert (đã nêu trong bản kế hoạch cũ — vẫn đúng).
- [ ] Contract tests cho shop bot (vẫn còn thiếu — P60 cũ gộp vào đây).
- **Acceptance:** campaign gửi 1.000 khách không vượt rate limit; queue failure có alert.

### LỚP 2 — Đột phá chung: thứ chưa hệ nào có (P63–P65)

#### P63 — Unified Commerce Brain (tuần 6–9) ⭐ đột phá #1
**Một lớp AI điều hành chung cho CẢ HAI hệ thống shop.**
- [ ] **AI Ops Copilot** (nâng cấp từ Ops Cockpit F9 + Qwen support): hỏi bằng tiếng Việt "tuần này bán được bao nhiêu key ChatGPT?" → truy vấn cross-system, trả lời + biểu đồ. Agent có tool: query ops snapshot, draft campaign, soi payment attention list.
- [ ] **Dynamic pricing assistant**: đề xuất giá theo tồn kho + tốc độ bán (Inventory Intel F6 mở rộng), owner duyệt rồi áp.
- [ ] **Smart fulfillment routing**: đơn GLB (crypto, EN) vs VN (VND) đã tách — thêm auto-detect fraud signal (đơn bất thường, VPN pattern, proof image trùng hash) → cảnh báo admin trước khi duyệt.
- [ ] Bật **AI Concierge LLM** đã code sẵn trong hệ A (unlock `SHOP_AI_RECOMMEND_LOCKED` — chỉ thiếu API key).
- **Acceptance:** copilot trả lời đúng số liệu thật từ D1+Postgres; 100% đề xuất giá phải có owner approve.

#### P64 — SupaApp Mobile / Mini App 2.0 (tuần 9–11) ⭐ đột phá #2
- [ ] **GLB Mini App** (hệ A) nâng cấp: thêm giỏ nhiều items, wishlist, push notification qua bot khi đơn hoàn tất, chuyển encryption key theo device.
- [ ] **VN bot** chuyển dần sang Mini App (giữ bot command như fallback) — dùng chung session platform đã có (migrations 0035, 0038, 0040).
- [ ] **One-click checkout bằng wallet** (đã có code `wallet.ts`) — deposit USDT/VND, mua không cần nhập gì thêm.
- **Acceptance:** checkout Mini App ≤ 3 chạm từ mở app đến key trong tay.

#### P65 — Marketplace đa người bán (tuần 11+) ⭐ tầm nhìn
- [ ] Hệ A đã có: affiliate ledger, commission accruals, bot registry theo scope. Bước tiếp: **vendor accounts** — người khác đăng bán trên tung.codes, hệ thống tự chia commission (ledger đã sẵn sàng, chỉ thiếu vendor onboarding + payout flow).
- [ ] fball.vn Teleshop trở thành **reference client** của cùng commerce core (hoặc giữ standalone nếu business không cần).
- **Acceptance:** vendor đầu tiên bán được sản phẩm, commission accrual tự sinh đúng bps.

### LỚP 3 — Kết nối hai hệ (P66, song song bất kỳ lúc nào sau P62)
- [ ] **Shared ops channel**: 1 bot Telegram "HQ" nhận digest từ cả hai hệ (doanh thu ngày, pending approvals, stock alerts) — owner xem một chỗ.
- [ ] **Cross-sell link**: trang tung.codes/shop thêm banner "Cần đội bóng? Dùng fball.vn" và ngược lại (flywheel F10 mở rộng liên hệ thống).
- [ ] Chuẩn hoá metric: cùng định nghĩa "doanh thu tháng", "đơn hoàn tất" để dashboard gộp không nói dối.

---

## 3. Thứ tự thực hiện & dependency

```
P60 (PayOS auto cho fball) ──► P61 (web+customer fball) ──► P62 (broadcast+health)
                                     │
                                     ▼
P63 (Unified AI Brain) ◄── cần cả 2 hệ ổn định
     │
     ▼
P64 (Mini App 2.0) ──► P65 (Marketplace)
P66 (HQ bot + cross-sell) — chạy song song bất kỳ lúc nào sau P62
```

**Việc ngay tuần này:**
1. P60: map schema payment của hệ A (`shop_payment_attempts`, `shop_payment_provider_configs`, `shop_payment_webhook_events`) → thiết kế bảng tương đương cho Postgres.
2. Đăng ký/kiểm tra webhook PayOS cho fball.vn (hệ A đã có credentials — xem có tái dùng được account không).
3. Bật AI Concierge hệ A: cấp `XAI_API_KEY` (hoặc Qwen key) + set `SHOP_AI_RECOMMEND_ENABLED=1` → unlock tính năng đã code xong mà chưa chạy.

## 4. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Port pattern payment D1→Postgres sai chi tiết (fence, TTL) | Port từng function + contract test trước khi nối webhook thật |
| Hai hệ lệch định nghĩa dữ liệu → cross-sell dashboard sai | Bắt đầu từ metric dictionary chung trước khi gộp số |
| Mini App migration làm hỏng bot legacy đang chạy doanh thu | Bot command giữ nguyên; Mini App là đường mới, rollout theo % khách |
| Marketplace mở chồng lấn pháp lý thuế/chia tiền | P65 chỉ triển khai sau khi có phương án payout + hoá đơn |
| AI copilot tiết lộ số liệu nhạy cảm | Tool gọi vào ops snapshot đã redact; không trả raw SQL cho LLM |

---
*Lịch sử bản: v1 (04:30) — sai premise "chưa có web storefront"; v2 (04:40) — viết lại sau khi xác minh tung.codes/shop.*
