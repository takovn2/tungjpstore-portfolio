# TUNG Shop — Kế hoạch nâng cấp toàn diện & mở rộng Global

> Tài liệu kế hoạch. Chưa thi công.
> Ngày lập: 2026-08-29
> Phạm vi: vùng `shop` (web + Telegram mini app), hướng tới thị trường ngoài Việt Nam.
> Cơ sở dữ liệu sự thật: `src/`, `content-migrations/` (head hiện tại `0051`). Không dùng `TUNG_SHOP_ONE_SHOT_AGENT_BUNDLE/` làm nguồn — bundle đó là snapshot tháng 8, đã lạc hậu.

---

## 0. Tóm tắt điều hành

### Hiện trạng (as-is)

TUNG Shop là một **cửa hàng số (digital goods) chạy ngầm trong một portfolio Astro**. Kiến trúc rất tốt: Astro 7 SSR trên Cloudflare Workers, D1 làm single source of truth, R2 media, Cloudflare Access + password gate cho admin, Turnstile chống bot, fulfillment license key mã hóa AES-256-GCM và giao tự động.

Danh mục hiện tại (~40 SKU) bán **tài khoản số giá rẻ**: ChatGPT Plus 40.000đ, Capcut Pro 10.000đ, Canva 30.000đ, Cursor Pro 269.000đ, Kiro 35–100k, cộng cụm "tạp hóa" 19 SKU (Suno, Claude API, HeyGen, Kling, Lovable, Gmail Aged, LinkedIn Premium, GPM Login, HMA VPN, TikTok…). Biên mỏng, giá trị đơn thấp (0.4$–10$), hoàn toàn định giá bằng VND.

### Ba kết luận chính

**1. Bạn đã có 70% "đường ống" global, nhưng 0% "lớp thị trường".**
Đã có sẵn: 4 locale (vi/en/ja/zh), bảng FX `shop_currency_settings`, scope `glb` cho Telegram, rail crypto USDT/USDC, copy tiếng Anh trong mọi migration, watermark đa ngôn ngữ.
Chưa có: geo/market, thuế, local payment rail, FX thật, phân tích theo thị trường, địa chỉ giao hàng, hoàn tiền.

**2. Nút thắt #1 không phải kỹ thuật — là danh mục + rail thanh toán.**
Hàng hóa hiện tại (shared/aged account, grey-market seat) vi phạm ToS của hầu hết nhà cung cấp. Hệ quả: **Stripe/PayPal/Paddle/FastSpring sẽ không bao giờ duyệt merchant này**. Đó là lý do hệ thống chỉ có PayOS (VN) + crypto thủ công. Mọi kế hoạch "thêm thẻ visa/master" mà không đổi danh mục là vô ích.

**3. Cửa sổ khả thi nhất không phải Mỹ/EU — là "vành đai crypto + e-wallet".**
Philippines, Indonesia, Thái Lan, Malaysia, Ấn Độ, Brazil, Mexico, Pakistan, Ai Cập, Nigeria: người dùng mua tài khoản số giá rẻ nhiều nhất thế giới, thâm nhập thẻ thấp, quen trả bằng USDT TRC-20 / GCash / UPI / PIX. Đây là nơi crypto là **lựa chọn chính thống**, không phải fallback. Mỹ/EU/Nhật nên đánh dấu **deferred** vì thuế + compliance + thẻ.

### Khuyến nghị chiến lược

| | Hướng đi | Đánh giá |
|---|---|---|
| **A** | Giữ nguyên danh mục grey-market, mở rộng bằng crypto + local e-wallet | Khả thi ngay, ASP thấp, rủi ro khoá tài khoản cao |
| **B (khuyến nghị)** | **Hybrid**: giữ dòng hiện tại để có dòng tiền, song song xây một lớp "hàng hợp pháp" (tool tự làm, API resale chính hãng, gift card, gói dịch vụ của chính bạn) để mở khoá thẻ + tăng ASP 3–5× | Đường dài hơn nhưng thoát được trần grey-market |

Kế hoạch dưới đây **phục vụ cả A và B** ở tầng hạ tầng (money/market/tax/refund là market-agnostic), và tách riêng quyết định danh mục ở G4.

---

## 1. Bản đồ hiện trạng (as-is)

### 1.1 Kiến trúc kỹ thuật

```
Astro 7 (output: 'server') + React (chỉ admin)
        │
        ├── Cloudflare Workers (@astrojs/cloudflare)
        │     ├── D1 CONTENT_DB   ← content CMS + TOÀN BỘ shop (51 migrations)
        │     ├── D1 CONTACT_DB   ← CRM liên hệ (5 migrations)
        │     ├── R2 MEDIA        ← media.tung.codes
        │     ├── Assets (run_worker_first allowlist)
        │     ├── Send Email SHOP_EMAIL (orders@tungjpstore.net)
        │     ├── Turnstile, Cloudflare Access (admin)
        │     └── Cron * * * * *  ← mỗi phút, quá dày
        │
        └── Domain: tung.codes (chính), tungjpstore.net (legacy)
```

### 1.2 Bề mặt shop

| Lớp | Hiện trạng |
|---|---|
| **Storefront web** | `/shop`, `/shop/{slug}`, `/shop/cart`, `/shop/order`, `/shop/account/*` — SSR Astro thuần, **không có React island nào**, inline vanilla JS, cart trong `localStorage["tung:shop:cart:v1"]` |
| **Storefront Telegram** | 2 scope: `legacy` (VN/VND/PayOS, bot `dochoiai_bot`) và `glb` (en/USD/crypto) — `/telegram/glb`, `api/shop/glb-mini`, `api/telegram/glb-webhook` |
| **API** | ~30 endpoint dưới `/api/shop/*` (quote, checkout, stock, recommend, bridge, payment-methods, payment-proof, order-qr, delivery, me/*, wallet/*, webhooks) |
| **Admin** | React SPA 9 tab (Overview, Catalog, Inventory, Orders, Payments, Fulfillment, Telegram, Discounts, Settings), bảo mật 2 lớp (Access JWT + password session) |
| **Test** | 52 file smoke test (~12.6k LOC), tập trung commerce lifecycle / PayOS / Telegram / platform wave |

### 1.3 Mô hình tiền tệ hiện tại — **đây là gốc rễ của mọi vấn đề**

```
content-migrations/0043_shop_currency_pricing.sql
  base_currency    TEXT CHECK (base_currency = 'VND')     ← khoá cứng ở schema
  display_currency TEXT CHECK (display_currency = 'USD')  ← khoá cứng ở schema
  usd_vnd_rate_scaled INTEGER  (rate_scale = 1000000)     ← 25.500 VND/USD
```

- Mọi variant **phải** được định giá bằng VND (validation: `shop_source_price_must_be_vnd`).
- USD không phải tiền tệ thật — nó là **phép chiếu** tại checkout, tính bằng một hằng số tĩnh.
- Tỷ giá **cập nhật tay** qua một ô input duy nhất trong admin (`SettingsTab.tsx:58-61`), bản sao "updated 2026-07-25" đã cũ ~1 năm.
- Hằng số tỷ giá bị **nhân ba và mâu thuẫn**: `lib/shop/pricing.ts:1-5`, `lib/shop/currency.ts:5-10`, `lib/services/currency.ts:36-39`.
- `currency.ts:12-17` map `ja→JPY, zh→CNY` nhưng `locale-preference.ts:7-12` map `ja/zh→USD`. Hai nơi, hai kết quả khác nhau.

### 1.4 Phát hiện geo duy nhất trong toàn bộ codebase

```ts
// src/pages/api/shop/payment-methods.ts:13
const isInternational = locale !== "vi" || (country !== null && country !== "VN");
```

Một dòng. Đó là toàn bộ "chiến lược quốc tế" hiện tại. `country` lấy từ header Cloudflare (`CF-IPCountry`), không có fallback IP, không có `Accept-Language`, không có chọn thị trường thủ công.

---

## 2. Điểm nghẽn chặn global

### 2.1 P0 — Chặn cứng (phải xử lý trước khi bán ra ngoài VN)

> **Cập nhật 2026-08-29 (sau G0):** bảng này được lập từ phân tích tĩnh, chưa mở file. Khi verify từng mục, **P0-4 / P0-5 / P0-6 / P0-7 đã được vá từ trước**, và một mục ở P2 (`/shop/cart` routing) là **báo cáo sai**. Xem mục [G0](#g0--dọn-nợ--vá-lỗ-hổng--hoàn-thành-2026-08-29) để biết chi tiết. Các mục dưới được giữ nguyên để lưu lại lý do ban đầu, có đánh dấu trạng thái thật.

| # | Vấn đề | Bằng chứng | Hậu quả | Trạng thái |
|---|---|---|---|---|
| P0-1 | **Schema khoá một tiền tệ gốc** | `0043:5` `CHECK (base_currency = 'VND')` | Không thể định giá theo thị trường | ⬜ G1 |
| P0-2 | **Không có rail thanh toán quốc tế** | PayOS reject mọi currency ≠ VND (`payos.ts:283`); webhook reject mọi provider ≠ `payos` | Khách ngoài VN chỉ có crypto thủ công | ⬜ G3 |
| P0-3 | **Crypto 100% thủ công** | `0046:6` `CHECK (verification_mode = 'manual')`; adapter `bybit.ts`/`binance.ts` **không có call site** | Mỗi đơn cần người duyệt → không scale | ⬜ G3 |
| P0-4 | **`crypto-verifier.ts` là stub trả `verified: true`** | `crypto-verifier.ts:51-56` trả blockNumber 100.000, confirmations 12 | **Lỗ hổng**: nếu có dây là mất tiền | ✅ **Đã vá từ trước** — fail-closed |
| P0-5 | **Bảng ví không tồn tại** | `shop_customer_wallets` / `shop_wallet_transactions` được query ở `wallet/balance.ts:33`, `payment-methods.ts:65`, `service.ts:1020` nhưng **không migration nào tạo** | Ví là tính năng chết, nuốt lỗi bằng `catch {}` | ✅ **Đã có `0052`** |
| P0-6 | **Topup ví hardcode ngân hàng VN** | `wallet/topup.ts:41-42` Vietcombank BIN `970436`, STK `0123456789` | Rò rỉ dữ liệu giả vào production | ✅ **Đã xoá từ trước** |
| P0-7 | **`maintenance.ts` seed 100 key test mỗi lần chạy cron** | Hardcode `campus-mail` test inventory | Chạy 1.440 lần/ngày → rác production | ✅ **Đã gated từ trước** |
| P0-8 | **Zero tax/VAT/GST** | `repository.ts:1896` `taxMinor: 0` hardcode | Bất hợp pháp khi bán B2C vào EU/UK/AU/IN/JP | ⬜ G5 |
| P0-9 | **Không có refund** | Không có bảng `shop_refunds`; `shop_commission_accruals` accrual-only | Không xử lý được chargeback/khiếu nại quốc tế | ⬜ G5 |
| P0-10 | **Phone không có mã quốc gia** | `0009:106` `phone TEXT`, `validation.ts:525` chỉ check độ dài 40 | Vô dụng cho SMS/OTP/hoá đơn thuế | ⬜ G5 |

### 2.2 P1 — Chặn mềm (giảm tỷ lệ chuyển đổi nghiêm trọng)

- ~~`x-default` hreflang bị ghim vào `vi`~~ ✅ **đổi sang `en` (G0b)**
- ~~Mọi trang giao dịch (cart/order/account) truyền `alternateLocales={[locale]}` → không emit hreflang~~ ❌ **báo cáo sai.** Cả 6 trang này đều có `noindex={true}`, và BaseLayout chỉ emit hreflang khi `!noindex` ⇒ không có tác động SEO nào. Bỏ qua.
- ~~`sitemap.xml.ts` là `<urlset>` phẳng, không có cụm hreflang~~ ✅ **đã thêm cụm alternate (G0b)**
- `localeForCountry()` chỉ 4 nhánh, toàn bộ thế giới còn lại → `en` (`locale-preference.ts:48-54`). Không phân biệt EU/LATAM/SEA. ⬜ G2
- ~~`getShopProductSeo()` chỉ sinh SEO cho `locale === "vi"`~~ ✅ **đã sinh template cho cả 4 locale (G0b)**
- **MỚI phát hiện (G0b)**: `getShopProductDisplayTitle()` áp dụng bảng tiêu đề tiếng Việt cho **mọi** locale ⇒ trang tiếng Anh render "ChatGPT Plus 1 tháng" ở cả tiêu đề hiển thị lẫn trường `name` của Product structured data. ✅ **đã sửa**
- Platform F-modules (`trust.ts`, `merchandising.ts`, `flywheel.ts`, `ops-snapshot.ts`, `checkout-mesh.ts`) là **binary vi/en**, không có ja/zh.
- `recommend.ts` stopword/intent regex chỉ có token tiếng Việt (`:36-38, 77-88`).
- Locale mặc định mâu thuẫn giữa endpoint: `quote.ts:96`/`checkout.ts:95` là `en`, `recommend.ts:26` là `vi`.
- **Không có currency switcher** — tiền tệ là hàm của locale (`CartPage.astro:207`).
- `resolveVietnamMiniShopBranding` còn nguyên trong GLB path.
- ~~`console.log("LANG_SHOP", …)` chạy trên mọi request shop~~ ✅ **đã xoá (G0)**
- `OrderTrustTimeline.astro`, `FlywheelBand.astro`, `assistant.ts` — **đã xây xong nhưng không ai import**.
- ~~`tests/shop-glb-manual-payment.e2e.test.mjs` — không được npm script nào chạy~~ ✅ **đã thêm `test:e2e` / `test:all` (G0)**
- ~~Cron `* * * * *` (1.440 lần/ngày)~~ ✅ **đổi thành `*/5` (G0)**. `head_sampling_rate: 1` vẫn giữ.
- Email sender vẫn là `orders@tungjpstore.net` trong khi domain chính là `tung.codes` (lệch brand, ảnh hưởng deliverability quốc tế). ⚠️ **Chưa đổi — cần DNS trước, xem G0**
- Bot Telegram tên tiếng Việt `dochoiai_bot`.

### 2.3 P2 — Nợ kỹ thuật nền

- `src/pages/en|ja|zh/` là thư mục rỗng — tàn dư của một mô hình routing bị bỏ.
- ~~`/shop/cart` + `/shop/order` chỉ reachable ở `segments.length === 2`~~ ❌ **báo cáo sai, không phải lỗi.** `/{lang}/shop/cart` đúng bằng 2 segment nên điều kiện này chính xác.
- ~~Variant localization fallback hardcode `'vi'`~~ ✅ **đã sửa thành `p.default_locale` (G0)**, trừ 2 chỗ trong admin inventory giữ `vi` có chủ ý.
- Admin UI hoàn toàn tiếng Việt (`ProductDialog.tsx:192-217`, `SettingsTab.tsx:59-61`) — không dùng được nếu thuê operator nước ngoài.
- `TUNG_SHOP_ONE_SHOT_AGENT_BUNDLE/` (12.871 file) nằm ngay trong repo ✅ **đã gitignore (G0)**, chưa xoá vật lý.

---

## 3. Chiến lược thị trường

### 3.1 Nguyên tắc định tuyến thị trường

**Không mở tất cả cùng lúc.** Mở theo "băng thông rủi ro":

| Băng | Thị trường | Rail ưu tiên | Thuế | Trạng thái |
|---|---|---|---|---|
| **Wave 1** | Philippines, Indonesia, Thái Lan, Malaysia, Việt Nam | USDT/USDC TRC-20 + GCash/Dana/OVO/TrueMoney | Chưa cần engine (hiển thị giá đã gồm thuế) | **Mở ngay** |
| **Wave 2** | Ấn Độ, Bangladesh, Pakistan, Brazil, Mexico, Argentina | USDT + UPI / PIX / OXXO | GST/VAT: ghi nhận, chưa nộp tự động | Sau G3 |
| **Wave 3** | MENA (AE, SA, EG), Nigeria, Kenya, Nam Phi | USDT + e-wallet địa phương | Đơn giản | Sau G3 |
| **Wave 4** | Nhật, Hàn, Đài Loan, Hong Kong, Singapore | Thẻ + crypto + Konbini/PayPay | JCT cần xử lý | Sau G5 |
| **Deferred** | EU/UK/Úc/Mỹ/Canada | Thẻ (không khả thi với danh mục hiện tại) | VAT MOSS / state nexus / GST — **bắt buộc** | Chỉ khi chọn hướng B |

**Lý do:** Wave 1–3 là nơi (a) nhu cầu tài khoản số giá rẻ cao nhất thế giới, (b) crypto là phương thức chính thống, (c) rủi ro thực thi thuế với merchant nước ngoài nhỏ thấp, (d) không cần thẻ → né được rào cản ToS/processor.

### 3.2 Chiến lược định giá: tách "tiền gốc" khỏi "giá thị trường"

Nguyên tắc quan trọng nhất của bản kế hoạch này:

```
VND  = Cost currency (tiền vốn)        → giữ nguyên, là sàn bảo vệ biên lợi nhuận
USD  = Settlement reference            → bỏ khái niệm "display_currency" cố định
LOCAL= Presentment currency (giá bán)  → MỚI: định giá theo từng thị trường, KHÔNG suy ra từ FX
```

**Vì sao không dùng FX để suy ra giá?** Vì sức mua. Gói Cursor Pro bán 269.000đ (≈10.5$) ở VN không thể bán 10.5$ ở Philippines — thị trường đó trả 3–5$. Giá phải là **price book theo thị trường**, FX chỉ để kiểm tra biên lợi nhuận so với vốn VND.

Schema đích: mỗi market có một price book; mỗi variant có giá trong price book đó; order snapshot cả presentment lẫn settlement.

### 3.3 Quyết định routing

**Khuyến nghị: phương án C — giữ route locale cho SEO, thêm chiều thị trường qua cookie + landing route.**

| | Cách | Ưu | Nhược |
|---|---|---|---|
| A | Giữ `/{locale}`, suy market từ CF country | Đổi ít nhất | `/en` trả cùng URL cho Mỹ và Philippines → giá không rõ ràng, hỏng ads & SEO |
| B | Route theo thị trường `/{market}/{locale}` (`/ph/en`) | Chuẩn nhất cho marketing & SEO | Refactor lớn, nhân số route lên 4× |
| **C** | Giữ `/{locale}` + **market cookie** (`tung_market`) + landing `/global`, `/ph`, `/id`, `/br` đặt cookie rồi redirect | Đổi vừa phải, có landing page riêng cho ads, giá nhất quán mỗi phiên | Cần xử lý cache/Vary đúng |

Đi kèm bắt buộc: header `Vary: Cookie` hoặc `cache-control: private` trên mọi response phụ thuộc market, tránh cache CDN phục vụ sai giá.

---

## 4. Lộ trình nâng cấp

Quy ước: `G0…G7`. Mỗi giai đoạn có mục tiêu / việc làm / file chạm vào / migration / test / tiêu chí thoát.

---

### G0 — Dọn nợ & vá lỗ hổng ✅ **HOÀN THÀNH 2026-08-29**

**Mục tiêu:** Dừng rò rỉ, dừng rác, tắt các đường dẫn có thể gây mất tiền trước khi đổ traffic quốc tế vào.

#### Kết quả audit: một nửa danh sách P0 đã được vá từ trước

Kế hoạch ban đầu được viết từ phân tích tĩnh; khi mở từng file ra kiểm tra, **4 trong 6 mục P0 đã được sửa từ trước đó**. Ghi nhận lại để không làm lại:

| Việc | Kết quả |
|---|---|
| Stub `crypto-verifier.ts` trả `verified: true` | ✅ Đã vá — module fail-closed, trả `onchain_verification_not_implemented`. `verified: true` còn lại trong `payment-webhooks/[provider].ts:118` là handshake PayOS **đã verify chữ ký**, không phải lỗ hổng |
| Bảng ví `shop_customer_wallets` / `shop_wallet_transactions` | ✅ Đã có `content-migrations/0052_shop_customer_wallets.sql`, viết sẵn multi-currency (mọi ISO-4217, không khoá VND/USD) |
| Hardcode Vietcombank BIN 970436 + STK `0123456789` trong topup | ✅ Đã xoá — đọc từ `shop_payment_provider_configs`, trả `503 not_configured` khi thiếu. Comment trong file nói rõ lý do |
| `maintenance.ts` seed 100 key campus-mail mỗi lần cron | ✅ Đã gated — cần `action=seed_test_inventory` **và** `confirm=SEED_TEST_INVENTORY` trong body; cron gửi `{}` nên đi qua đường sweep bình thường |
| `/shop/cart` + `/shop/order` "không reachable ở depth > 2" | ❌ **Báo cáo sai.** `/{lang}/shop/cart` đúng bằng 2 segment, điều kiện `segments.length === 2` là chính xác. Không có lỗi |

#### Những việc đã thực hiện trong G0

| Việc | File | Ghi chú |
|---|---|---|
| Đổi cron `* * * * *` → `*/5 * * * *` | `wrangler.jsonc` | Giảm 1.440 → 288 invocation/ngày. Đã verify propagate vào `dist/server/wrangler.json` |
| Cập nhật test assert cron | `tests/shop-admin-api-integration.smoke.test.mjs:140` | Test cũ assert `* * * * *`, sẽ fail nếu không sửa |
| Xoá `console.log("LANG_SHOP")` | `src/pages/[lang]/[...slug].astro` | Chạy trên mọi request shop |
| Xoá `console.log` | `src/pages/shop/[slug].astro` | Cùng pattern, log toàn bộ product payload |
| **Sửa variant fallback `'vi'` → `p.default_locale`** | `src/lib/shop/repository.ts` (5 chỗ: 487, 667, 696, 764, 1721) | Bug thật: product viết bằng tiếng Anh → khách Nhật thấy fallback tiếng Việt thay vì tiếng Anh. 2 chỗ trong admin inventory (1581-1582) **giữ `vi` có chủ ý** + đã thêm comment giải thích |
| Test hồi quy cho fallback locale | `tests/shop-variant-locale-fallback.smoke.test.mjs` (**mới**) | Trích xuất **SQL thật** từ `repository.ts` và chạy trên sqlite. Đã mutation-test: revert fix ⇒ test fail |
| **Sửa test stale** assert stub cũ | `tests/shop-loyalty-tiers.smoke.test.mjs` | Test này assert `verified: true` của stub **cũ**, nên đã fail âm thầm kể từ khi verifier được vá — không ai thấy vì nó nằm nhầm trong file "loyalty-tiers" |
| Wire e2e vào npm | `package.json` | Thêm `test:e2e` + `test:all`. `test:smoke` glob `*.smoke.test.mjs` nên `shop-glb-manual-payment.e2e.test.mjs` chưa bao giờ chạy |
| Gitignore bundle | `.gitignore` | `TUNG_SHOP_ONE_SHOT_AGENT_BUNDLE/` (12.871 file, snapshot tháng 8). **Chưa xoá** — chỉ ignore, để bạn tự quyết định xoá |

#### Verification

- `astro check` → **0 errors, 0 warnings** (320 files)
- `npm run build` → **thành công**
- `npm run test:smoke` → **48/48 file pass** (trừ 3 file phụ thuộc esbuild)

#### Hai việc chưa làm, cần bạn quyết định

**1. Đổi sender email `orders@tungjpstore.net` → `orders@tung.codes`** — *cố ý chưa đổi.*
Đây là thay đổi **phá vỡ production nếu DNS chưa sẵn sàng**: Cloudflare Email Routing phải có destination address đã verify cho `tung.codes`, nếu không **mọi email đơn hàng sẽ lặng lẽ mất**. Cần làm theo thứ tự:
1. Bật Email Routing cho `tung.codes` trong Cloudflare, verify destination address
2. Thêm SPF / DKIM / DMARC cho `tung.codes`
3. Đổi `TRANSACTIONAL_EMAIL_FROM_ADDRESS` **và** `send_email.allowed_sender_addresses` trong `wrangler.jsonc`
4. Gửi thử một đơn, xác nhận nhận được

**2. Test suite bị treo trong môi trường này** — 4 file dùng `esbuild` (`shop-commerce-lifecycle`, `shop-crypto-providers`, `shop-telegram-recovery`, `shop-glb-manual-payment.e2e`) **treo vô hạn** ở `build()`. Đã khoanh vùng: binary `esbuild --version` chạy được, nhưng cả `build()` lẫn `buildSync()` đều treo → esbuild không spawn được service process trong sandbox này. **Lỗi môi trường, không phải lỗi code.** Các test này cần chạy trong CI thật để xác nhận.

**Tiêu chí thoát:** ✅ Không còn `console.log` trên đường request shop; ✅ cron giảm 80%; ✅ e2e đã wire; ✅ fallback locale đúng product; ⚠️ sender email chờ DNS; ⚠️ 4 test esbuild chờ CI.

---

### G0b — SEO nền tảng đa thị trường ✅ **HOÀN THÀNH 2026-08-29**

**Mục tiêu:** Đưa tín hiệu đa ngôn ngữ đúng lên các trang **có index** trước khi đổ traffic quốc tế. Độc lập với G1/G2, không cần chờ money layer.

#### Audit: 2 trong 5 mục P1 là báo cáo sai

| Mục trong kế hoạch gốc | Thực tế |
|---|---|
| Trang giao dịch (cart/order/account) không emit hreflang | ❌ **Vô nghĩa.** Cả 6 trang đều có `noindex={true}`, và BaseLayout chỉ emit hreflang khi `!noindex` ⇒ chẳng có gì để sửa |
| `getShopProductSeo()` chỉ sinh SEO cho `vi` | ✅ Đúng — nhưng hậu quả lớn hơn báo cáo: xem bug ẩn bên dưới |

**Bug ẩn tìm thấy khi sửa:** `getShopProductDisplayTitle()` áp dụng một bảng sửa tiêu đề tiếng Việt (`chatgpt-plus` → "ChatGPT Plus 1 tháng", …) cho **mọi locale**. Hệ quả: trang sản phẩm tiếng Anh render tiêu đề tiếng Việt ở cả tiêu đề hiển thị **và** trường `name` của Product structured data — lệch ngôn ngữ trực tiếp với structured data, thứ Google dùng để sinh rich result.

#### Đã thực hiện

| Việc | File |
|---|---|
| `x-default` `vi` → `en` (kèm binding `xDefaultLocale`, ưu tiên `en` nếu có trong alternates) | `src/layouts/BaseLayout.astro` |
| Sitemap: key theo path **chưa localize**, emit cụm `xhtml:link rel="alternate"` đầy đủ + `x-default` | `src/pages/sitemap.xml.ts` |
| SEO sản phẩm: template riêng cho vi/en/ja/zh + nhận diện boilerplate bulk-import theo từng locale | `src/lib/shop/seo.ts` |
| Chặn leak tiêu đề Việt: bảng override chỉ áp dụng cho `vi` | `src/lib/shop/seo.ts` |
| Truyền `locale` vào 3 call site (1 chỗ dùng `.map(getShopProductDisplayTitle)` — sẽ truyền **index mảng** làm locale) | `ShopPage.astro`, `ProductCard.astro` |

#### Quyết định thiết kế đáng chú ý

- **Alternates chỉ emit cho locale mà path đó thực sự tồn tại.** `fball` không xuất bản ở `en` ⇒ không có alternate nào trỏ tới `/en/work/fball`. Nếu emit bừa sẽ quảng bá URL 404.
- **`x-default` ưu tiên `en`, nếu không có thì locale đầu tiên tồn tại.** Nhất quán với `middleware.ts`, nơi mọi quốc gia không nhận diện được đều rơi vào `en`.
- **Mô tả meta ngoài VN không nhắc VietQR** — rail thanh toán phụ thuộc thị trường, không thuộc về meta description bị search engine cache. Riêng `vi` giữ VietQR vì đó đúng là rail được dùng ở VN.

#### Test mới

| File | Cover |
|---|---|
| `tests/shop-product-seo.smoke.test.mjs` | override tiếng Việt chỉ ở `vi`; template 4 locale; không nhắc VietQR ngoài VN; editorial copy thắng ở mọi locale; boilerplate bị viết lại ở mọi locale; mọi call site phải truyền `locale` |
| `tests/public-cms.smoke.test.mjs` (+1 test) | sitemap có `xmlns:xhtml`; cụm alternate đủ 4 locale; `zh` thành `zh-Hans`; locale thiếu thì không emit alternate; `x-default` rơi vào locale tồn tại |
| `tests/blog-seo.smoke.test.mjs` (+1 test) | `x-default` không bị ghim `vi`; khớp với geo router trả `en` |

**Verification:** `astro check` 0 errors/0 warnings (321 file) · `npm run build` thành công · smoke test **49/49** file pass.

**Tiêu chí thoát:** ✅ `x-default` = `en`; ✅ sitemap có cụm hreflang; ✅ SEO sản phẩm đủ 4 locale; ✅ không còn leak tiêu đề Việt.

---

### G1a + G1b — Money layer & tỷ giá ✅ **HOÀN THÀNH 2026-08-29**

**Mục tiêu:** Biến tiền tệ từ "hằng số tĩnh gắn với locale" thành "dữ liệu có nguồn, có thời điểm".

#### Thực tế: 4 bản sao, không phải 3

Kế hoạch gốc nói "3 bản sao". Khi đọc code có **4**, và bản thứ tư là nguyên nhân gốc:

| # | Vị trí | Ghi chú |
|---|---|---|
| 1 | `src/lib/shop/pricing.ts` | Hằng số + `vndToUsdCents` |
| 2 | `src/lib/shop/currency.ts` | Bảng rate riêng, `ja→JPY`, `zh→CNY` |
| 3 | `src/lib/services/currency.ts` | Bảng rate riêng khác nữa (trang pricing dịch vụ) |
| 4 | **`src/lib/shop/repository.ts:55-97`** | **Copy nguyên khối**, có comment giải thích: *"Kept local so the repository remains usable by the lightweight smoke-test bundler, which intentionally strips module imports"* |

Bản #4 tồn tại vì 4 test harness bundle `repository.ts` với **toàn bộ import bị strip**. Vậy muốn gộp phải sửa harness — không thể chỉ đổi import.

#### Đã thực hiện

| Việc | File |
|---|---|
| Tạo `money.ts` — nguồn duy nhất, **không có import** để harness bundle được | `src/lib/shop/money.ts` (**mới**) |
| `pricing.ts` → chỉ còn re-export (shim) | `src/lib/shop/pricing.ts` |
| Xoá 40 dòng copy trong `repository.ts`, đổi thành import | `src/lib/shop/repository.ts` |
| Cập nhật 4 harness bundle `repository.ts` + 1 harness `pricing.ts` để kèm `money.ts` | `tests/` (5 file) |
| Migration `0053` — bảng tỷ giá mọi cặp, có `provider` + `as_of` | `content-migrations/0053_shop_fx_rates.sql` (**mới**) |
| `fx.ts` — get/put/list, `fxFreshness`, `applySpread`, `invertRateScaled` | `src/lib/shop/fx.ts` (**mới**) |
| `getShopPricingSettings` ưu tiên `shop_fx_rates`, fallback `0043`, fallback default | `repository.ts` |
| **Admin sửa rate phải ghi cả 2 bảng** — nếu không sẽ bị bỏ qua vì fx được ưu tiên | `repository.ts: updateShopPricingSettings` |

#### Quyết định thiết kế đáng chú ý

- **`convertMinor` chia theo rate.** `rateScaled/rateScale` = bao nhiêu đơn vị `from` ăn 1 đơn vị `to`. Chiều ngược cần `invertRateScaled` (đổi sang scale 1e12 vì 1/25500 không phải số nguyên ở scale 1e6).
- **Short-circuit cùng currency trước khi validate rate** — caller chuyển đổi trong cùng currency có thể truyền rate giả, không nên bị chặn.
- **`money.ts` không được có import** — nếu không 5 harness sẽ hỏng. Đã có test chặn điều này.
- **Bảng mới seed từ `0043`** nên có hiệu lực ngay; admin control cũ vẫn hoạt động; provider có thể tiếp quản sau mà không cần đổi code.
- **`currencyFractionDigits` đọc từ `Intl`** thay vì hardcode 2 — JPY/KRW/VND là 0, KWD là 3. Hardcode 2 sẽ hiển thị ¥ sai 100 lần.

#### Test mới

| File | Cover |
|---|---|
| `tests/shop-money-layer.smoke.test.mjs` (10 test) | fraction digits từng currency; round-trip minor/major; `assertSameCurrency`; VND→USD khớp giá trị checkout đang dùng; đảo rate round-trip; làm tròn half-up không drift; cùng currency passthrough; input xấu bị từ chối; **không module nào redefine primitive**; **mọi harness bundle repository phải kèm money.ts** |
| `tests/shop-fx.smoke.test.mjs` (8 test) | migration seed; mọi cặp tiền (legacy schema không thể); freshness tính từ `as_of`; spread; round-trip D1 + history; pricing settings ưu tiên fx và fallback 3 tầng; **admin edit ghi cả 2 bảng**; **admin edit vẫn chạy được khi chưa apply 0053** |

**Verification:** `astro check` 0 errors/0 warnings (325 file) · `npm run build` OK · smoke test **51/51** file pass.

**Tiêu chí thoát:** ✅ Một module tiền tệ duy nhất; ✅ tỷ giá có provider + `as_of`; ✅ admin edit không thể diverge; ⬜ price book; ⬜ order snapshot.

---

### G1c — Price book & order snapshot ⬜ **CHUYỂN SANG G2**

**Lý do đổi thứ tự:** price book không có nghĩa nếu chưa có `market` — "dùng price book nào?" chỉ trả lời được sau khi có lớp thị trường. Đưa `0054_shop_price_books` và `0055_shop_order_currency_snapshot` sang **G2**, làm ngay sau `shop_markets`.

**Kiến trúc dự kiến (giữ nguyên thiết kế):**

```
src/lib/shop/money.ts          ✅ đã có
src/lib/shop/fx.ts             ✅ đã có
```

**Migration (dời sang G2):**

| File | Nội dung |
|---|---|
| `0054_shop_price_books.sql` | `shop_price_books` (id, market_id, code, currency, is_default, rounding_rule); `shop_price_book_items` (price_book_id, variant_id, price_minor, compare_at_minor, floor_minor) UNIQUE(price_book,variant). `floor_minor` = sàn giá quy về VND để bảo vệ biên. |
| `0055_shop_order_currency_snapshot.sql` | Thêm vào `shop_orders`: `presentment_currency`, `presentment_total_minor`, `settlement_currency`, `settlement_total_minor`, `fx_rate_scaled`, `fx_rate_scale`, `fx_provider`, `fx_as_of`, `price_book_id`, `market_id`. |

**Luồng resolve giá đã implement:**

```
resolvePrice({ variantId, catalogPriceMinor, book, item, rate })
  1. Giá tay trong book          = item.price_minor            → source "book"
  2. Không có entry + có rate    = quy đổi catalog → book.currency → source "converted"
  3. Không có rate               = giữ nguyên giá + currency gốc → source "catalog" (không đoán)
  4. Floor                       = item.floor_minor (mặc định 0, operator đặt tay)
                                   price < floor ⇒ dùng floor, cờ belowFloor = true
```

#### Hai lỗi thiết kế đã tự bắt được khi viết (cả hai đều âm thầm)

**1. Thị trường VN bị định giá lại qua book mặc định USD.**
Market VN có `currency: "VND"` nhưng `priceBookId: null`. Nếu rơi về book mặc định (USD), toàn bộ catalog tiếng Việt bị đổi sang USD — đúng vào thị trường đang sống.
→ `resolvePriceBook` giờ nhận `marketCurrency`, **trả `null`** khi không có book nào khớp currency. Test chặn.

**2. Lấy giá catalog làm sàn sẽ cấm định giá thấp hơn ở mọi thị trường khác.**
Comment trong migration gợi ý `floor_minor` = giá vốn quy đổi. Nhưng giá catalog là giá **bán lẻ VN**, không phải giá vốn. Dùng nó làm sàn ⇒ Philippines không bao giờ được rẻ hơn VN ⇒ vô hiệu hóa toàn bộ mục đích price book.
→ Floor chỉ lấy từ `item.floorMinor`. Test chặn bằng đúng ví dụ Cursor: 269.000đ ≈ $10.55, giá tay PH $3.99 phải được phép.

**Test:** `tests/shop-price-book.smoke.test.mjs` (8 test) — rounding 4 quy tắc; giá tay thắng giá quy đổi; **floor không suy từ catalog**; không có rate thì giữ VND không đoán; book cùng currency thì bỏ qua; **VN không bị re-price**; GLOBAL quy đổi USD; book tường minh + DB chưa migrate thì vô hại.

**Tiêu chí thoát:** ✅ Một variant có giá khác nhau giữa 2 thị trường; ✅ VN giữ nguyên VND; ⬜ order snapshot.

#### Còn lại của G1c: order snapshot ⬜

`0056_shop_order_currency_snapshot.sql` — thêm vào `shop_orders`: `presentment_currency`, `presentment_total_minor`, `settlement_currency`, `settlement_total_minor`, `fx_rate_scaled`, `fx_rate_scale`, `fx_provider`, `fx_as_of`, `price_book_id`, `market_id`.
Cần để audit một đơn sau này mà không cần biết tỷ giá ngày đó. Chưa làm vì đụng vào đường checkout.

---

### G2 — Thị trường & định tuyến (Market Layer) ✅ **HOÀN THÀNH 2026-08-29**

**Mục tiêu:** Thay thế một dòng `isInternational` bằng một lớp market có dữ liệu.

**Module mới `src/lib/shop/market.ts`:**

```ts
type Market = {
  id: string;              // 'VN' | 'PH' | 'ID' | 'GLOBAL'
  countryCodes: string[];
  locale: ShopLocale;      // locale mặc định
  currency: string;        // presentment currency
  priceBookId: string;
  rails: RailId[];         // ưu tiên thanh toán, có thứ tự
  taxProfileId: string | null;
  catalogScope: 'all' | 'glb' | 'vn_only';
  enabled: boolean;
};

resolveMarket(request, { cookie, acceptLanguage, cfCountry })
  1. ?market= / cookie tung_market (người dùng chọn tay)  — ưu tiên cao nhất
  2. CF-IPCountry → tra bảng shop_markets
  3. Accept-Language (bổ sung — hiện tại hoàn toàn bị bỏ qua)
  4. fallback GLOBAL (en / USD)
```

> **Cập nhật 2026-08-29:** phần lõi của G2 đã được xây (bởi một phiên làm việc khác) và đã được verify. `src/lib/shop/market.ts`, migration `0054_shop_markets.sql`, middleware dùng `resolveMarket()` kèm `Accept-Language`, `payment-methods.ts` đọc rail matrix từ market, 11 test pass. Chi tiết ở cuối mục này.

**Trạng thái G2:**

| Hạng mục | Trạng thái |
|---|---|
| `market.ts` + `resolveMarket()` (cookie > country > Accept-Language > default) | ✅ xong |
| Migration `0054_shop_markets.sql` (markets, countries, rails) | ✅ xong |
| `middleware.ts` dùng `resolveMarket()` + `Accept-Language` | ✅ xong |
| `payment-methods.ts` — thay `isInternational` bằng rail matrix | ✅ xong |
| `tests/shop-markets.smoke.test.mjs` (11 test) | ✅ xong |
| Price book `0055` + wire vào catalog | ✅ xong (xem G1c) |
| **`Vary: Cookie` trên trang shop** | ✅ xong — `shop.astro`, `shop/[slug].astro`. Bắt buộc vì CDN cache 60s mà giá giờ phụ thuộc cookie thị trường |
| Landing `/global`, `/ph`, `/id`, `/br` đặt market cookie | ✅ xong — `/shop/market/[code]` (dưới `/shop/` để nằm trong `run_worker_first` allowlist). Đặt cả 2 cookie (market + locale) rồi redirect |
| Market + currency picker trong `StoreHeader` | ✅ xong — select đổi market, set cookie, reload. Dùng `Astro.locals.market` do middleware cung cấp |
| `localeForCountry` mở rộng theo bảng market | ✅ xong — nhận `markets?` param, fallback 4 nhánh hardcoded khi chưa migrate |
| `shop_market_catalog_rules` (ẩn SKU theo thị trường) | ✅ xong — `listCatalogRules` + `createCatalogFilter` trong market.ts, wire vào 2 trang shop. `tests/shop-catalog-rules.smoke.test.mjs` (6 test) |
| Order currency snapshot | ✅ xong — `marketCode` trong `CreateCheckoutInput`, checkout API resolve market server-side, snapshot vào `metadata_json`: `marketCode` + `fxProvider` + `fxAsOf`. Không cần migration. 2 test trong `shop-fx` |
| Thống nhất locale→currency | ✅ xong — `shop/currency.ts` import `localeCurrency` từ `locale-preference`. Trước đây ja→JPY (trang sản phẩm) mâu thuẫn ja→USD (header) **trên cùng một trang**. Test chặn |

**Tại sao picker để sau price book:** một market picker mà không đổi giá chỉ là trang trí. Price book đã wire xong nên picker giờ mới có nghĩa.

**SEO đi kèm:** ✅ đã xong ở G0b (`x-default` → `en`, sitemap cụm hreflang, SEO sản phẩm 4 locale). Mục "trang giao dịch không emit hreflang" là báo cáo sai — các trang đó `noindex`.

**Tiêu chí thoát G2:** ✅ khách ngoài VN thấy crypto đứng đầu (rail matrix theo market); ✅ người dùng đổi tay được thị trường (picker + landing route); ✅ CDN không cache nhầm giá (Vary đã set); ✅ sitemap có cụm hreflang; ✅ đơn hàng lưu đủ snapshot để audit (market + rate + provider + as_of).

**Ghi chú `services/currency.ts`:** giữ bảng rate riêng — **có chủ ý**. Domain khác (planning band báo giá dịch vụ, không phải shop), rate chỉ để hiển thị dải tham khảo đã ghi rõ "planning references". Wire vào fx.ts sẽ bắt buộc render pricing page async để đổi lấy lợi ích biên.

---

### G3 — Rails thanh toán quốc tế *(2–3 tuần, giai đoạn quan trọng nhất)*

**Mục tiêu:** Từ "0 rail quốc tế tự động" lên "crypto tự động + ít nhất 1 aggregator e-wallet SEA".

**Nguyên tắc thiết kế: tổng quát hoá provider registry.** Hiện tại `shop_payment_provider_configs` bị khoá `CHECK (provider IN ('vietqr'))` (`0009:397`) — phải mở ra.

```
src/lib/shop/providers/registry.ts   ← MỚI
   interface PaymentRail {
     id, provider, currencies[], countries[], capabilities{create,verify,refund}
     createIntent(order, market) -> {payUrl, qr, address, expiresAt, ref}
     verify(req) -> {status, providerRef, amountMinor, currency}   // signature/HMAC
     refund?(...) 
   }
   register(rail); resolveRails(market); 
```

**Thứ tự triển khai:**

| Ưu tiên | Rail | Việc | Ghi chú |
|---|---|---|---|
| **1** | **Crypto tự động (USDT/USDC, TRC-20 + BEP-20)** | Wire adapter `bybit.ts`/`binance.ts` đang chết; hoặc nhanh hơn: dùng **NOWPayments / OxaPay / Coinbase Commerce** làm verifier on-chain. Thay `verification_mode='manual'` bằng `'auto'` khi có txid khớp số tiền + memo | **Đòn bẩy lớn nhất.** Bảng `0042` đã có sẵn, chỉ thiếu verifier |
| **2** | **Binance Pay / Bybit Pay merchant** | Adapter đã có khung | Phủ tốt SEA/LATAM/MENA |
| **3** | **Local e-wallet aggregator** — **dLocal** (1 API, ~40 thị trường) hoặc **Xendit** (ID/PH) / **2C2P** (SEA) | Thêm rail GCash, Dana, OVO, UPI, PIX, OXXO | Đây là rail giúp Wave 1–3 thực sự chuyển đổi |
| **4** | **Thẻ** — chỉ nếu chọn hướng B (đổi danh mục) | Stripe/PayPal sẽ từ chối danh mục hiện tại | Không làm ở G3 |

**Migration `0057_shop_payment_rails_v2.sql`:**
- Nới CHECK `shop_payment_provider_configs.provider` (bỏ `IN ('vietqr')`), thêm cột `rail_type`, `currencies` (JSON), `countries` (JSON), `priority`, `capabilities`.
- Nới `shop_payment_attempts.method` (bỏ `= 'bank_transfer_qr'`).
- Thêm `shop_payment_refunds`.
- Nới `0046` `verification_mode` CHECK: thêm `'auto'`, `'hybrid'`.

**Sửa bắt buộc trong `payos.ts`:** bỏ `+07:00` hardcode (`:226`), bỏ giới hạn 9 ký tự mô tả chuyển khoản theo chuẩn VN (`:632`) khi đi quốc tế, bỏ whitelist `img.vietqr.io` làm nguồn QR duy nhất.

**Test:** `tests/shop-payment-rails.smoke.test.mjs` — rail matrix theo market; webhook signature từ chối khi sai; idempotency replay; amount-mismatch bị từ chối; refund flow.

**Tiêu chí thoát:** Đơn crypto ngoài VN được xác nhận tự động trong < 5 phút, không cần người duyệt. Ít nhất 1 e-wallet SEA chạy được end-to-end trên staging. Mọi webhook verify chữ ký — không có đường tắt.

---

### G4 — Danh mục & nội dung theo thị trường *(1.5 tuần)*

**Mục tiêu:** Catalog không còn là "một danh sách VN dịch sang 4 thứ tiếng".

| Việc | File / Migration |
|---|---|
| **Quyết định hướng A hay B** | Nếu B: thêm dòng sản phẩm hợp pháp (tool tự xây, API resale có hợp đồng, gift card, gói dịch vụ). Đây là điều kiện để mở thẻ ở G6 |
| Gắn market vào catalog: SKU nào bán ở đâu | `0058_shop_market_catalog.sql` → `shop_product_markets` (product_id, market_id, visible, override_price_minor) |
| Localization fallback theo locale gốc, không hardcode `vi` | `repository.ts:486,665,695,763` |
| **Dịch nốt các module platform** (đang binary vi/en) | `platform/trust.ts:56-72`, `merchandising.ts:58`, `flywheel.ts:22`, `checkout-mesh.ts:20-52`, `ops-snapshot.ts` |
| Bản địa hoá `recommend.ts` stopword/intent | `platform/recommend.ts:36-38,77-88,104,124,145-152` |
| Chuẩn hoá locale mặc định API (`en` vs `vi` mâu thuẫn) | `quote.ts:96`, `checkout.ts:95`, `recommend.ts:26,33` |
| Thêm locale mới khi vào Wave 2/3: `id`, `th`, `ms`, `pt-BR`, `es`, `ar` | `src/i18n/dictionaries.ts:1-11` — cần mở rộng `ShopLocale` từ 4 lên N trong `types.ts:1` |
| Admin: thêm locale switcher cho operator + hiển thị % dịch còn thiếu | `src/components/admin/shop/ProductDialog.tsx:413`, `SettingsTab.tsx` |
| Gắn `assistant.ts` (đã xây, 4 locale, chưa ai gọi) vào PDP/cart | `src/lib/shop/assistant.ts` |
| Mount `OrderTrustTimeline.astro`, `FlywheelBand.astro` | `components/pages/OrderPage.astro`, `ShopPage.astro` |

**Test:** `tests/shop-market-catalog.smoke.test.mjs` — gating SKU theo market; fallback chain đúng; không còn copy tiếng Việt rò rỉ vào page en/ja/zh (test hiện tại đã check được điều này, mở rộng sang platform modules).

**Tiêu chí thoát:** Một SKU có thể ẩn ở Brasil nhưng hiện ở Philippines; mọi platform module có đủ 4 locale (và các locale mới khi thêm); admin báo được % dịch còn thiếu.

---

### G5 — Thuế, hoá đơn & tuân thủ *(2 tuần)*

**Mục tiêu:** Có thể bán hợp pháp và xử lý khiếu nại. Bắt buộc trước khi chạm Wave 4 (Nhật/Hàn/Đài) và tuyệt đối bắt buộc trước EU/UK/Úc/Mỹ.

| Việc | File / Migration |
|---|---|
| `shop_tax_rules` (market, tax_code, rate_scaled, inclusive_display, effective_from) | `0059_shop_tax.sql` |
| `src/lib/shop/tax.ts` — tính thuế theo market, hỗ trợ giá đã/nhưng gồm thuế, làm tròn theo currency | **MỚI** |
| Gọi tax trong `quote`/`checkout`; bỏ `taxMinor: 0` hardcode | `repository.ts:1896` |
| `shop_refunds` + `shop_refund_lines` + `src/lib/shop/refunds.ts` | `0060_shop_refunds.sql` |
| Thu thập địa chỉ/quốc gia/MST-VAT: `shop_customer_addresses` (country, region, postal_code, tax_id) | `0061_shop_addresses.sql` |
| Phone chuẩn **E.164** + dial-code picker thay cho text 40 ký tự | `0009:106`, `validation.ts:522-525`, `CartPage.astro:132` |
| Trang legal đủ sâu cho mọi locale (đặc biệt ja/zh đang mỏng) | `src/i18n/legal.ts:400-464,465+` |
| Bản quyền riêng cho GLB: ToS/Refund/Privacy phiên bản international | `src/pages/privacy`, `refund-policy.astro`, `terms-of-service.astro` |
| Đổi tên bot Telegram `dochoiai_bot` cho GLB | `wrangler.jsonc`, `telegram-bot-config.ts` |

**Thực tế cần nói rõ:** Thuế VAT/GST đầy đủ (EU MOSS, US state nexus, JCT Nhật, GST Ấn Độ 18%) là một dự án riêng. Kế hoạch này chỉ làm **nền tảng** (rule engine + snapshot + hiển thị giá đã gồm thuế). Việc **nộp thuế thực tế** cần kế toán viên địa phương ở từng thị trường — giữ EU/UK/Úc/Mỹ ở trạng thái deferred cho đến lúc đó.

**Test:** `tests/shop-tax-refund.smoke.test.mjs` — thuế đúng theo market, inclusive/exclusive, làm tròn; refund hoàn lại inventory + wallet + commission; E.164 validation.

**Tiêu chí thoát:** Order lưu đủ thuế để xuất hoá đơn; refund chạy end-to-end; legal page đủ nội dung ở 4 locale; số điện thoại chuẩn E.164.

---

### G6 — Tăng trưởng & phân phối *(1.5 tuần)*

| Việc | File |
|---|---|
| **Analytics theo thị trường** — hiện chỉ có Cloudflare Web Analytics, không có funnel/revenue | `0062_shop_market_metrics.sql` + `src/lib/shop/metrics.ts`: GMV/refund rate/conversion theo market × rail × SKU |
| Wire attribution F1/F8 đang bị duplicate inline | `BaseLayout.astro:182-294` → dùng `platform/attribution.ts` |
| Mở khoá AI concierge (đang `SHOP_AI_RECOMMEND_LOCKED = true`) sau khi có guardrail cost | `platform/service.ts:269`, `recommend.ts:52-56` |
| Landing `/global`, `/ph`, `/id`, `/br` + structured data Offer | G2 đã tạo route, G6 nội dung |
| Affiliate network F8 đã có bảng (`shop_affiliate_partners`, `0049`) — thiếu portal công khai | `platform/attribution.ts`, trang `/partners` |
| Email giao hàng đa ngôn ngữ + đúng timezone người nhận (hiện +07:00 cứng) | `src/lib/email/templates.ts`, `payos.ts:226` |
| Retention: loyalty đã có (`loyalty.ts`) — bản địa hoá tier name | `src/lib/shop/loyalty.ts` |
| Telegram GLB: branding riêng thay `resolveVietnamMiniShopBranding` | `api/shop/telegram-mini/[...path].ts:20` |

**Tiêu chí thoát:** Dashboard admin hiện GMV/refund/conversion theo market; attribution về một module; landing market có content + Offer schema.

---

### G7 — Củng cố & mở rộng locale *(liên tục)*

- Thêm locale `id`, `th`, `ms`, `pt-BR`, `es`, `ar` theo thứ tự ưu tiên Wave.
- **RTL** cho `ar` — hiện không có thuộc tính `dir` nào (`BaseLayout.astro:119`).
- Admin đa ngôn ngữ (đang hoàn toàn tiếng Việt).
- Load/perf test (hiện không có).
- Rà soát bảo mật định kỳ cho provider registry mới.

---

## 5. Sơ đồ kiến trúc đích

```
                        REQUEST
                           │
              ┌────────────▼────────────┐
              │  middleware.ts          │
              │  resolveMarket()        │ ← ?market > cookie > CF-IPCountry
              │  + Accept-Language      │   > Accept-Language > GLOBAL
              └────────────┬────────────┘
                           │  Market { country, locale, currency, priceBook, rails }
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  ┌───────────┐     ┌────────────┐     ┌──────────────┐
  │  money.ts │     │  market.ts │     │  tax.ts      │
  │  convert  │     │  rails[]   │     │  rate+round  │
  │  format   │     │  catalog   │     │  inclusive   │
  └─────┬─────┘     └─────┬──────┘     └──────┬───────┘
        │                 │                   │
        │           ┌─────▼───────────────────▼─────┐
        │           │  checkout                     │
        └──────────▶│  snapshot: presentment +      │
                    │  settlement(VND) + fx + tax   │
                    └─────┬─────────────────────────┘
                          │
              ┌───────────▼────────────┐
              │ providers/registry.ts  │
              ├────────────────────────┤
              │ PayOS/VietQR   (VN)    │
              │ Crypto TRC20   (GLOBAL)│ ← tự động, ưu tiên #1 ngoài VN
              │ Binance/Bybit  (SEA)   │
              │ dLocal/Xendit  (LATAM) │
              │ Thẻ (chỉ nếu hướng B)  │
              └───────────┬────────────┘
                          │ webhook (chữ ký bắt buộc)
              ┌───────────▼────────────┐
              │ fulfillment (đã tốt)   │
              │ AES-256-GCM, auto key  │
              └───────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │ refunds.ts  (MỚI)      │
              │ metrics.ts  (MỚI)      │
              └────────────────────────┘
```

---

## 6. Ma trận rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| **ToS nhà cung cấp / khoá tài khoản** | 🔴 Rất cao | Đa dạng hoá nguồn; giữ tồn kho nhỏ; cân nhắc hướng B (hàng hợp pháp) |
| **Không bao giờ có thẻ (Stripe/PayPal)** | 🔴 Rất cao với danh mục hiện tại | Chấp nhận crypto-first; thẻ chỉ sau khi đổi danh mục |
| **Crypto chargeback / tx giả mạo** | 🟠 Cao | Verify chữ ký webhook bắt buộc; match đúng số tiền + memo; xoá stub verifier (G0) |
| **Thuế VAT/GST chưa xử lý** | 🟠 Cao | Giữ EU/UK/Úc/Mỹ ở deferred; chỉ mở Wave 1–3 ở G3; rule engine ở G5 |
| **CDN cache nhầm giá theo market** | 🟠 Cao | `Vary: Cookie` / `cache-control: private` trên mọi response thị trường |
| **FX lệch gây âm biên** | 🟡 TB | `floor_minor` + cảnh báo biên; spread 2–3%; refresh 6h; snapshot rate vào order |
| **Tài khoản Telegram/PSP bị khoá** | 🟡 TB | Đa PSP; tách brand GLB khỏi legacy; domain riêng |
| **SEO nhiều locale nhưng mỏng nội dung** | 🟡 TB | Sửa hreflang + sitemap ở G2; chỉ thêm locale khi dịch đủ (G4/G7) |
| **Grey-market + GDPR/PDPA** | 🟡 TB | Chính sách dữ liệu riêng cho GLB ở G5 |
| **Cron 1/phút phí tài nguyên** | 🟢 Thấp | Đổi `*/5` ở G0 |

---

## 7. Thứ tự ưu tiên đề xuất

### ✅ Đã xong (2026-08-29)

1. **G0** — audit cho thấy 4/6 P0 đã được vá từ trước; phần còn lại đã làm: cron `*/5`, xoá 2 `console.log`, sửa variant fallback `'vi'` → `p.default_locale`, thêm test hồi quy, sửa test stale assert stub cũ, wire `test:e2e`, gitignore bundle.
2. **G0b** — SEO nền tảng: `x-default` → `en`, sitemap có cụm hreflang, SEO sản phẩm đủ 4 locale, chặn leak tiêu đề Việt ra structured data.

### Chờ bạn quyết định

3. **Sender email** `orders@tungjpstore.net` → `orders@tung.codes` — cần bật Email Routing + SPF/DKIM/DMARC **trước**, nếu không sẽ mất toàn bộ email đơn hàng.
4. **Xoá vật lý** `TUNG_SHOP_ONE_SHOT_AGENT_BUNDLE/` (đã gitignore).

3. **G1a + G1b đã xong** — một module tiền tệ duy nhất (`money.ts`), tỷ giá có provider + `as_of` (`fx.ts` + migration `0053`).

### Tiếp theo (khuyến nghị)

4. **G2** — market layer + routing + currency picker + `localeForCountry` mở rộng, **kèm G1c** (price book `0054` + order snapshot `0055` — dời sang đây vì price book vô nghĩa nếu chưa có market).
5. **G3** — crypto tự động (đòn bẩy lớn nhất) → rồi aggregator e-wallet SEA.
6. G4 → G5 → G6 → G7.

### Song song
7. **Quyết định hướng A/B** cho danh mục — quyết định này khóa G4 và quyết định G6 có thẻ hay không.

### Việc nhỏ còn tồn đọng (chưa chặn đường nào)
8. **Mâu thuẫn locale→currency**: `lib/shop/currency.ts` map `ja→JPY, zh→CNY` nhưng `locale-preference.ts` map `ja/zh→USD`. Header hiện USD, trang sản phẩm hiện "≈¥". Cần thống nhất — hợp lý nhất là làm cùng G2 khi có market quyết định tiền tệ thật sự.
9. **`lib/services/currency.ts`** vẫn giữ bảng rate riêng (trang pricing dịch vụ). Chưa gộp vì domain khác (báo giá dịch vụ, không phải shop); nên cho nó đọc từ `fx.ts` ở G2.

---

## 8. Định nghĩa hoàn thành (Global Ready)

Một thị trường mới được coi là **mở** khi tất cả điều kiện sau đúng:

- [ ] Market có row trong `shop_markets` với price book + currency + rail matrix riêng
- [ ] ≥80% SKU bán được ở market đó có localization đầy đủ (không fallback)
- [ ] ≥1 rail thanh toán tự động (không cần người duyệt) hoạt động end-to-end
- [ ] Mọi webhook verify chữ ký; amount-mismatch bị từ chối
- [ ] Order snapshot đủ presentment / settlement / FX / tax để audit sau này
- [ ] Trang legal (ToS / Refund / Privacy) có nội dung riêng cho market đó
- [ ] Refund flow chạy được
- [ ] Route có hreflang + nằm trong sitemap với cụm alternate
- [ ] Admin báo được GMV / refund rate / conversion của market đó
- [ ] Có test tự động cover resolve market → rail selection → checkout → fulfillment

---

## 9. Phụ lục — File cần sửa (checklist)

### Hạ tầng
- `wrangler.jsonc` — cron, sender email, bot username, vars market
- `src/middleware.ts` — resolveMarket, Accept-Language, Vary
- `src/astro.config.mjs` — (có thể cần) i18n config để bỏ prefix vi

### Lõi shop — sửa
- `src/lib/shop/pricing.ts`, `currency.ts` → gộp vào `money.ts`
- `src/lib/services/currency.ts` → xoá
- `src/lib/shop/repository.ts` — fallback locale, tax, order snapshot
- `src/lib/shop/validation.ts:261,331,522-525` — bỏ khoá VND, E.164
- `src/lib/shop/payos.ts:226,283,506,536,632` — timezone, currency, QR host, độ dài mô tả
- `src/lib/shop/crypto-verifier.ts:51-56` — xoá stub
- `src/pages/api/shop/payment-methods.ts` — thay `isInternational` bằng rail matrix
- `src/pages/api/shop/wallet/topup.ts:41-42`, `balance.ts:33`
- `src/pages/api/shop/maintenance.ts` — tắt seed test
- `src/pages/api/shop/quote.ts:96`, `checkout.ts:95`, `recommend.ts:26,33` — chuẩn locale mặc định

### Lõi shop — mới
- `src/lib/shop/money.ts`, `fx.ts`, `market.ts`, `tax.ts`, `refunds.ts`, `metrics.ts`
- `src/lib/shop/providers/registry.ts`
- `src/pages/global.astro` và landing theo market
- `src/components/StoreHeader.astro` — market + currency picker

### SEO
- `src/layouts/BaseLayout.astro:119,133` — dir, x-default
- `src/pages/sitemap.xml.ts:26-63` — cụm hreflang
- `src/lib/shop/seo.ts:25-44` — bỏ vi-only
- `CartPage.astro:46`, `OrderPage.astro:32`, `Account*Page.astro` — alternateLocales

### Nội dung
- `src/i18n/dictionaries.ts:1-11` — thêm locale
- `src/i18n/shop.ts` — nội dung locale mới
- `src/i18n/legal.ts:400+` — làm đầy ja/zh + international
- `src/lib/shop/platform/*` — dịch đủ 4 locale (trust, merchandising, flywheel, checkout-mesh, ops-snapshot, recommend)

### Migration mới (tiếp từ 0051)
`0052_shop_wallets` · `0053_shop_fx_rates` · `0054_shop_price_books` · `0055_shop_order_currency_snapshot` · `0056_shop_markets` · `0057_shop_payment_rails_v2` · `0058_shop_market_catalog` · `0059_shop_tax` · `0060_shop_refunds` · `0061_shop_addresses` · `0062_shop_market_metrics`

### Dọn dẹp
- `src/pages/en|ja|zh/` (thư mục rỗng)
- `TUNG_SHOP_ONE_SHOT_AGENT_BUNDLE/` (snapshot lạc hậu, 12.871 file)
- `console.log` trong `src/pages/[lang]/[...slug].astro:134-143`, `shop/[slug].astro:46-55`
