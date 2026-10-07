# TUNG - Independent Product Builder

Portfolio đa ngôn ngữ cho `tung.codes`, xây bằng Astro 7 và triển khai trên Cloudflare Workers Paid. CSS/JS/media đóng gói vẫn là Static Assets; các route nội dung có thể chỉnh sửa, form liên hệ, shop và CMS `/admin` chạy qua Worker.

## Trạng thái hiện tại

- Giao diện và nội dung đã được viết lại theo hướng proof-first, tập trung vào LogiVN và Fball.vn; Payment Operations được tách rõ thành nghiên cứu.
- UI hỗ trợ Việt, Anh, Nhật và Trung giản thể; tiếng Việt là mặc định, không có prefix URL.
- `/admin` đã có shell biên tập, API CRUD, revision, publish/unpublish, soft delete/restore, thiết lập site và upload media R2.
- Admin API xác minh Cloudflare Access JWT, dùng CSRF cookie/header, kiểm tra Origin, giới hạn body và trả response `private, no-store`.
- `CONTACT_DB` production đã áp dụng đủ migrations `0001`–`0005`, gồm form, rate limit nguyên tử, CRM inbox, tags, notes, activity audit và index phục vụ tìm kiếm/phân trang.
- `CONTENT_DB` `tungjpstore-content` và bucket R2 `tung-profile-media` đã được khai báo bằng ID/tên thật trong `wrangler.jsonc`; content/shop migrations đã áp dụng tới `0046`, với 46 active variants dùng VND làm giá nguồn. `0046` thêm luồng proof crypto chỉ duyệt thủ công.
- Public pages đã đọc revision `published` đúng locale từ `CONTENT_DB`. Dictionary chỉ còn là bootstrap/fallback cho nhóm nội dung chưa từng được CMS quản lý; khi D1 không khả dụng, route trả `503` thay vì làm sống lại nội dung đã unpublish hoặc xoá.
- Canonical target là `tung.codes`; Worker config giữ đồng thời domain cũ để redirect browser và tiếp nhận webhook trong thời gian chuyển tiếp.
- `media.tung.codes` là public base URL mới của bucket R2 `tung-profile-media`; `media.tungjpstore.net` phải được giữ như compatibility alias cho revision và URL cũ.
- Cloudflare Access phải bảo vệ `tung.codes/admin` và `tung.codes/admin/*`; Worker vẫn xác minh JWT độc lập và fail-closed nếu Access chưa được cấu hình.
- Turnstile phải allowlist apex và `www` của cả domain mới lẫn domain cũ trong giai đoạn chuyển tiếp; API fail-closed nếu site key và secret bị cấu hình lệch.
- Owner-session QA đã hoàn tất một vòng CMS bốn ngôn ngữ (publish/unpublish/trash/restore) và một vòng CRM (phân loại, follow-up, tag, note, activity); fixture cô lập đã được xóa sạch khỏi cả hai D1.
- D1 Time Travel bookmark đã được tạo cho `CONTACT_DB` và `CONTENT_DB` tại `2026-07-23T17:28:00Z`; mã bookmark được giữ riêng và cửa sổ hiện tại dự kiến hết hạn `2026-07-30T17:28:00Z`.
- Cloudflare Email Sending đủ điều kiện trên gói Workers Paid nhưng chưa được bật vì chưa có cấu hình gửi thư/DNS được phê duyệt. Form vẫn lưu vào D1 inbox; admin trả lời qua `mailto:` và không thay đổi MX/SPF Zoho.
- Worker Secret `CONTACT_HASH_SECRET` đã được tạo trên production; giá trị không xuất hiện trong source, bundle, log hoặc tài liệu. API production dùng secret này để HMAC-SHA-256 IP hash và fail-closed nếu secret bị thiếu.
- `GLB Store` Telegram Mini App đã sẵn sàng luồng Bybit/Binance cho USDT/USDC; khách gửi transaction reference và/hoặc proof, admin đối chiếu rồi xác nhận thủ công trước khi giao key. Crypto method active không cần Bybit/Binance API secret; chỉ cần cấu hình UID/wallet đích thật trong `/admin`. Legacy Telegram vẫn khóa ở tiếng Việt, VND và PayOS/VietQR.
- Bảng giá dùng VND làm nguồn duy nhất và quy đổi USD theo tỷ giá đang lưu (`1 USD = 25.500 VND` lúc triển khai). Không đặt `BYBIT_*` hoặc `BINANCE_*` API credential trong source, D1, log hay giao diện admin; crypto GLB chỉ dùng proof và duyệt thủ công. `SHOP_CRON_SECRET` chỉ bảo vệ maintenance hook và vẫn đi qua Worker Secret store.

## Tính năng

- Portfolio editorial với CTA rõ, bằng chứng sản phẩm và website production cho LogiVN/Fball.vn.
- Case study mô tả workflow, kiến trúc, giới hạn và trạng thái hiện tại mà không dùng số liệu chưa kiểm chứng.
- Motion có chủ đích bằng `opacity`/`transform`, có fallback không JavaScript và hỗ trợ `prefers-reduced-motion`.
- Form liên hệ có progressive enhancement, native validation fallback, lỗi theo trường, honeypot, body limit và D1 rate limit nguyên tử.
- CMS riêng tư cho `site_section`, `project`, `post`, bốn locale, revision history, optimistic locking, audit log và R2 media.
- SEO gồm canonical, `hreflang`, Open Graph, JSON-LD, sitemap và robots.
- Security headers áp dụng cho Static Assets lẫn Worker/API.
- CLI tạo concept ảnh qua 9Router cục bộ; API key không đi vào browser bundle.
- Shop sản phẩm số có catalog, checkout giữ tồn kho, đơn hàng, payment attempt, giao key retry-safe, legacy Telegram `vi/VND/PayOS` và GLB Telegram `en/USD/Bybit-Binance`.

## Kiến trúc

```text
Public visitor
  -> Astro Worker routes
       -> CONTENT_DB (D1): published content đúng locale
       -> Shop routes -> CONTENT_DB (D1): catalog, inventory, orders, payments, fulfillment
       -> Telegram /telegram/shop: legacy vi/VND/PayOS
       -> Telegram /telegram/glb: global en/USD/Bybit-Binance
            -> Bybit/Binance: customer proof/reference; admin confirmation remains authoritative
            -> payOS/VietQR: legacy compatibility path
       -> /api/contact -> CONTACT_DB (D1)
  -> Static Assets: CSS, JS, icon, ảnh đóng gói

Cloudflare Access
  -> /admin + /admin/*
  -> Astro admin shell
  -> /admin/api/*
       -> CONTENT_DB (D1): content, revisions, locales, settings, audit
       -> CONTENT_DB (D1): shop catalog, inventory, orders, payments, fulfillment
       -> MEDIA (R2): raster media, immutable object keys
```

Public asset/CSS/JS vẫn static-first; HTML của vùng nội dung chỉnh sửa được render on-demand và cache ngắn ở edge. CMS runtime được tách khỏi `CONTACT_DB` để migration hoặc restore nội dung không ảnh hưởng dữ liệu liên hệ.

## Công nghệ

- Astro 7 + TypeScript
- `@astrojs/cloudflare` + Cloudflare Workers Static Assets
- Cloudflare D1: `CONTACT_DB` và `CONTENT_DB`
- Cloudflare R2: binding `MEDIA`
- Cloudflare Access cho xác thực `/admin`
- Wrangler 4 cho migration, type, dry-run và deploy
- Bybit/Binance cho USDT/USDC với proof và duyệt thủ công; payOS/VietQR chỉ giữ tương thích lịch sử
- CSS thuần với design tokens; không phụ thuộc UI framework hoặc web font runtime

## Cấu trúc chính

| Đường dẫn | Vai trò |
| --- | --- |
| `src/pages/` | Route Astro, API, sitemap và robots |
| `src/pages/admin/index.astro` | CMS shell riêng tư |
| `src/pages/admin/api/[...path].ts` | Admin API, media và publishing actions |
| `src/lib/admin/` | Access auth, CSRF, validation, repository và types |
| `src/lib/admin/contact-repository.ts` | CRM contact list/search/filter, notes, activities và optimistic update |
| `src/lib/content-store.ts` | Published-only D1 reader cho public routes |
| `src/components/pages/` | Giao diện dùng chung giữa các locale |
| `src/i18n/dictionaries.ts` | Copy public cho `vi`, `en`, `ja`, `zh` |
| `src/content/projects.ts` | Hồ sơ dự án đã xác minh và link nguồn |
| `src/styles/globals.css` | Token, responsive patterns và motion |
| `src/pages/api/contact.ts` | API form liên hệ |
| `src/lib/shop/` | Catalog, checkout, payOS, đối soát, tồn kho và fulfillment |
| `src/pages/api/shop/` | API public shop, webhook payOS, Telegram và maintenance |
| `docs/shop-integrations.md` | Contract legacy PayOS/VietQR, GLB Bybit/Binance và Telegram registry |
| `migrations/` | Migration `CONTACT_DB` |
| `content-migrations/` | Migration `CONTENT_DB` |
| `scripts/generate-image.mjs` | Client 9Router chỉ chạy cục bộ |
| `tests/` | Smoke tests CMS, auth, i18n, CTA, SEO, a11y và contact |
| `CONTACT_CRM.md` | Contract endpoint, enum, pagination và response cho UI admin |
| `wrangler.jsonc` | Worker, bindings, custom domains và runtime |

Quy tắc nội dung nằm trong [CONTENT.md](./CONTENT.md); quy ước giao diện nằm trong [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).
Trạng thái tám phase, artifact nghiệm thu, checklist release và rollback nằm trong [docs/PHASE_RELEASE_STATUS.md](./docs/PHASE_RELEASE_STATUS.md).

## Chạy cục bộ

Yêu cầu Node.js `>=22.12.0` và npm.

```bash
npm ci
npx astro dev --background
```

Quản lý server nền:

```bash
npx astro dev status
npx astro dev logs
npx astro dev stop
```

Astro dev không có binding D1/R2 local nên các route phụ thuộc CMS/API chủ động trả `503` thay vì giả vờ đọc hoặc ghi thành công. Muốn thử đầy đủ Worker bindings, dùng Wrangler local với database/bucket test riêng; không trỏ local development vào dữ liệu production.

## Kiểm tra trước khi deploy

```bash
npm run test:smoke
npm run check
npm run build
npx wrangler deploy --dry-run --config dist/server/wrangler.json
npm audit --audit-level=high
```

`npm audit` có thể tiếp tục báo `sharp` qua Miniflare/Wrangler. Không chạy `npm audit fix --force`; kiểm tra dependency tree và Worker bundle trước khi quyết định nâng/hạ phiên bản.

Checklist production:

1. Mở route ở cả bốn locale và đổi ngôn ngữ tại cùng pathname/query/hash.
2. Kiểm tra 375x812, 390x844, 768x1024 và 1440x900.
3. Kiểm tra keyboard menu bằng Tab, Shift+Tab, Escape và focus return.
4. Kiểm tra reduced motion, JavaScript disabled và native contact-form fallback.
5. Kiểm tra `/robots.txt`, `/sitemap.xml`, canonical và toàn bộ `hreflang`.
6. Gửi contact payload hợp lệ; thử body quá 12 KB, email/URL lỗi, honeypot và rate limit.
7. Đăng nhập Access, tạo draft bốn locale, thử conflict version, publish, unpublish, soft delete và restore.
8. Upload ảnh đúng/sai MIME, chữ ký file và giới hạn 8 MB; kiểm tra URL public qua media custom domain.
9. Xác nhận `www.tung.codes` redirect 308 về apex và giữ query string.
10. Xác nhận Turnstile render, CSP cho phép `challenges.cloudflare.com`, token được reset sau mỗi lần gửi và payload thiếu/sai token bị từ chối.
11. Crawl public HTML, sitemap và CMS projection để chắc chắn không có URL hoặc metadata kho mã nguồn.

## Định tuyến đa ngôn ngữ

| Locale | Trang chủ | Ghi chú |
| --- | --- | --- |
| Việt (`vi`) | `/` | Mặc định, không prefix |
| Anh (`en`) | `/en` | Prefix `/en` |
| Nhật (`ja`) | `/ja` | Prefix `/ja` |
| Trung giản thể (`zh`) | `/zh` | Render `lang="zh-Hans"` |

Slug không dịch: `/work/logivn`, `/en/work/logivn`, `/ja/work/logivn`, `/zh/work/logivn`. `/vi` chuyển về `/`. Language switcher giữ pathname, query string và hash.

## Cloudflare Paid Setup

Quota Paid có thể thay đổi; kiểm tra Dashboard và tài liệu Cloudflare trước khi tăng batch hoặc production traffic. Kiến trúc vẫn ưu tiên Static Assets, D1 và R2, không thêm dịch vụ chỉ để vượt giới hạn đã có.

### 1. CONTACT_DB

Binding hiện tại:

- Database: `tungjpstore-contact`
- ID: `026225c4-4062-45d5-8958-166567af1eeb`
- Migrations production: `migrations/0001_contact_submissions.sql` → `migrations/0005_contact_search_indexes.sql`

```bash
npx wrangler d1 migrations apply tungjpstore-contact --remote
```

API lưu tên, email, công ty, project website, message, locale, user agent đã cắt, IP hash, thời điểm và trạng thái. IP thô không được lưu. Ở production, định danh IP là HMAC-SHA-256 dùng Worker Secret `CONTACT_HASH_SECRET`, giúp ngăn việc dò ngược không gian IP từ dữ liệu D1; local/test không bật Turnstile vẫn có fallback SHA-256 xác định để phát triển. Output vẫn là hex 64 ký tự nên schema và rate limiter không đổi. `0003` tạo rate-limit state nguyên tử; `0004` bổ sung CRM, tags, notes và activity; `0005` bổ sung index tìm kiếm/phân trang. Rate limit cho phép tối đa 3 submission trên cùng IP hash trong 10 phút. Lần đầu chuyển từ hash cũ sang HMAC, các cửa sổ rate-limit đang hoạt động sẽ bắt đầu lại; không cần migration D1.

### 2. CONTENT_DB

Database hiện được bind với tên `tungjpstore-content`. Chỉ chạy lệnh tạo mới nếu triển khai sang tài khoản Cloudflare khác; với workspace hiện tại, áp migration sau khi xác nhận đúng account:

```bash
npx wrangler d1 migrations apply tungjpstore-content --remote
```

Chuỗi migration production `content-migrations/0001_content_cms.sql` → `content-migrations/0005_remove_repository_text_references.sql` gồm schema CMS, public projection, seed và hai lớp dọn dữ liệu nguồn nội bộ khỏi nội dung công khai. Hai migration đầu tạo schema và giữ slug/thứ tự/ảnh bìa của public projection trong revision đã xuất bản:

- `content_items`, `revisions`, `localizations`
- `media`, `audit_logs`, `site_state`
- `transaction_guards` cho optimistic locking nguyên tử trong D1 batch

Không chạy migration nội dung vào `CONTACT_DB`.

#### Seed nội dung public

`content-migrations/0003_seed_public_content.sql` là seed idempotent lấy từ các dictionary đã biên tập. Seed chạy sau migration projection của revision, tạo 2 site sections (`home-hero`, `contact-profile`), 3 project (`logivn`, `fball`, `payment-infrastructure`) và 5 bài Lab; mỗi item có đủ `vi`, `en`, `ja`, `zh` và revision published. ID, revision và thời điểm seed là deterministic nên chạy lại không nhân bản dữ liệu; các chỉnh sửa admin sau đó không bị ghi đè.

`content-migrations/0004_remove_public_repository_links.sql` và `0005_remove_repository_text_references.sql` là migration vệ sinh dữ liệu công khai. Trước khi áp lại ở môi trường mới hoặc thay đổi logic dọn dữ liệu, phải tạo bookmark/export D1 và xem trước dữ liệu bị tác động; migration đã áp dụng không được coi là cơ chế rollback.

Kiểm tra thay đổi nội dung trước khi commit:

```bash
npm run cms:seed:dry-run
npm run cms:seed:check
```

Khi dictionary đã được rà soát, sinh lại migration:

```bash
npm run cms:seed:generate
```

Áp dụng các migration CONTENT_DB đang chờ, gồm seed, chỉ khi đã chọn rõ môi trường. Script dùng `wrangler d1 migrations apply` để giữ đúng lịch sử migration và không tự đoán remote:

```bash
# Production/Cloudflare D1 (Wrangler dùng phiên đăng nhập hiện tại)
npm run cms:seed:apply -- --remote

# D1 local dùng cho kiểm thử, không dùng dữ liệu production
npm run cms:seed:apply -- --local
```

Có thể đổi database bằng `CONTENT_DB_NAME=tungjpstore-content`. Không đặt token, API key hay Access credential trong file seed; Wrangler tự dùng credential của phiên CLI. Sau khi apply, kiểm tra số lượng `10` item, `40` localization và trạng thái published trong `/admin` hoặc bằng `wrangler d1 execute`.

### 3. R2 MEDIA

Bucket hiện dùng tên `tung-profile-media`. Chỉ tạo mới khi binding chưa tồn tại trong account đích:

```bash
npx wrangler r2 bucket create tung-profile-media
```

Trong Dashboard:

1. Xác minh/tạo bucket `tung-profile-media`.
2. Gắn custom domain `media.tung.codes` vào bucket.
3. Tắt public `r2.dev` cho production nếu không cần.
4. Đặt `MEDIA_PUBLIC_BASE_URL=https://media.tung.codes`.

Không gỡ `media.tungjpstore.net` trong giai đoạn chuyển tiếp. Migration `0031_tung_codes_domain.sql` đổi URL đang lưu sang domain mới, nhưng alias cũ vẫn cần cho cache, revision lịch sử và liên kết đã phát hành.

Admin nhận JPEG, PNG, GIF, WebP và AVIF tối đa 8 MB, kiểm tra MIME lẫn magic bytes. Media đi qua custom domain công khai ngay sau upload và dùng cache dài hạn; không đưa tài liệu nội bộ, ảnh nhạy cảm hoặc asset chỉ dành cho bản nháp vào bucket này. Object key là bất biến; thay ảnh tạo object mới để revision cũ không mất media.

### 4. Cloudflare Access

Self-hosted Application phải bảo vệ cả `/admin` và `/admin/*` trên `tung.codes`. Trong lúc chuyển domain, giữ application cũ cho `tungjpstore.net` cho tới khi phiên quản trị cũ hết hạn.

1. Policy `Allow` chỉ email chủ sở hữu; ưu tiên IdP có MFA hoặc One-time PIN tới email đã kiểm soát.
2. Ghi lại Access team domain, ví dụ `<team>.cloudflareaccess.com`.
3. Ghi lại Application Audience (`AUD`) của ứng dụng.
4. Đặt runtime variables `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` và `CF_ACCESS_ALLOWED_EMAILS` (danh sách email chủ site, phân tách bằng dấu phẩy).

Worker vẫn xác minh chữ ký JWT, issuer, audience, expiry và identity; không chỉ tin việc route bị ẩn. Phiên đăng nhập Cloudflare Dashboard không tự trở thành Access identity.

### 5. Cloudflare Turnstile

- Widget được render trên form liên hệ khi `TURNSTILE_SITE_KEY` tồn tại.
- Server gọi Siteverify bằng `TURNSTILE_SECRET_KEY`; secret không được ghi vào source, log, tài liệu hoặc browser bundle.
- Nếu chỉ một trong hai key tồn tại, API trả `503 challenge_not_configured`; không bỏ qua xác minh.
- Khi Turnstile production hoạt động, thiếu `CONTACT_HASH_SECRET` làm API trả `503 contact_hash_not_configured` trước khi xác minh token hoặc ghi D1.
- Token thiếu/sai trả lỗi, token được reset sau mọi lần gửi, hết hạn hoặc timeout.
- Hostname production được phép: `tung.codes`, `www.tung.codes`; giữ các hostname cũ đang dùng cho đến khi migration hoàn tất.

### 6. Email Notification Và DNS

Cloudflare Email Sending đủ điều kiện trên Workers Paid nhưng chưa được bật vì luồng gửi, danh tính người gửi và DNS chưa được phê duyệt. Không bật Cloudflare Email Routing tại apex và không thay MX/SPF Zoho. `CONTACT_DB` là nguồn sự thật cho form liên hệ; trạng thái thành công chỉ xác nhận D1 đã tiếp nhận, còn `/admin` dùng `mailto:` để chủ site trả lời bằng hộp thư hiện có.

Notification tự động cho chủ site chưa phải capability production. Nếu triển khai sau này, cần một quyết định riêng về provider, Worker Secret và DNS preflight. Không được cho client điều khiển `to`/`from`, và email người gửi chỉ được dùng làm `Reply-To` sau validation.

### 7. Shop, Bybit/Binance Và USD

GLB Store hiển thị English/USD. Payment method được admin nhập trong `/admin` với Bybit/Binance, USDT/USDC, network, wallet address, memo/tag và trạng thái active. Migration `content-migrations/0042_shop_crypto_payments.sql` tạo attempt/event/audit boundaries; `0043_shop_currency_pricing.sql` lưu VND source price và tỷ giá USD/VND; `0044_shop_telegram_bot_scopes.sql` tách active bot theo scope; `0045_shop_crypto_storefront_scope.sql` khóa crypto method vào GLB; `0046_manual_crypto_payment_proofs.sql` lưu proof private và trạng thái review. Không có provider scan; crypto chỉ chuyển sang `paid` sau admin manual confirmation.

Giá nguồn của mọi variant active là số nguyên VND; admin chỉ sửa giá VND. Migration `0043_shop_currency_pricing.sql` lưu tỷ giá `USD/VND` (mặc định seed `25.500`), sau đó catalog English, quote và crypto checkout tự tính USD cents. Mỗi order lưu snapshot giá VND, USD và tỷ giá tại thời điểm tạo nên đổi giá/tỷ giá không làm thay đổi đơn cũ. Crypto nhận proof/reference và chỉ được admin xác nhận sau khi đối chiếu amount, network, destination và transaction evidence. Xem runbook đầy đủ tại [docs/shop-integrations.md](./docs/shop-integrations.md).

Legacy Telegram `/telegram/shop` vẫn dùng tiếng Việt, VND và PayOS/VietQR. GLB `/telegram/glb` không đọc PayOS methods và chỉ dùng crypto methods thuộc scope `glb`.
Web `/shop/cart` cũng giữ PayOS/VietQR; crypto methods chỉ được đọc qua GLB Mini App. Seed production hiện tại nằm ở `scripts/seed-glb-crypto-methods.sql` và chỉ chứa các địa chỉ Bybit do owner cung cấp.

## Runtime Variables Và Secrets

| Tên | Phạm vi | Loại | Mục đích |
| --- | --- | --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | Worker | Config | Team domain dùng tải JWKS và xác minh issuer |
| `CF_ACCESS_AUD` | Worker | Config | Audience của Access application |
| `CF_ACCESS_ALLOWED_EMAILS` | Worker | Config | Email được phép sửa CMS, phân tách bằng dấu phẩy |
| `MEDIA_PUBLIC_BASE_URL` | Worker | Config | HTTPS base URL cho media R2 public |
| `TURNSTILE_SITE_KEY` | Worker | Public config | Site key để render widget trên form liên hệ |
| `TURNSTILE_SECRET_KEY` | Worker | Secret | Xác minh token Turnstile ở server; không commit hoặc hiển thị trong UI |
| `CONTACT_HASH_SECRET` | Worker | Secret | Khóa HMAC-SHA-256 cho định danh IP của form và rate limiter; dùng giá trị ngẫu nhiên mạnh, ổn định giữa các lần deploy |
| `VIETQR_BANK_ACCOUNT` | Worker | Secret | Số tài khoản nhận đã liên kết với payment channel payOS; chỉ dùng để dựng QR và đối chiếu tài khoản |
| `PAYOS_CLIENT_ID` | Worker | Secret | Client ID của payment channel payOS |
| `PAYOS_API_KEY` | Worker | Secret | API key dùng gọi payOS từ Worker |
| `PAYOS_CHECKSUM_KEY` | Worker | Secret | Khóa HMAC cho request/response và webhook payOS |
| `SHOP_PUBLIC_ORIGIN` | Worker | Config | Origin HTTPS duy nhất dùng dựng URL Mini App, webhook và order links |
| `SHOP_ORDER_TOKEN_SECRET` | Worker | Secret | Khóa ký/băm access token của order và idempotency subject |
| `SHOP_KEY_ENCRYPTION_SECRET` | Worker | Secret | Root mã hóa AES-GCM cho license keys trong kho inventory |
| `SHOP_KEY_ENCRYPTION_KEY_VERSION` | Worker | Config | Phiên bản current-write của khóa mã hóa license keys |
| `BYBIT_*` / `BINANCE_*` API bindings | Không cấu hình | Dormant compatibility | Adapter cũ chỉ giữ cho smoke coverage; không dùng trong runtime/manual crypto |
| `SHOP_CRON_SECRET` | Worker | Secret | Bearer cho private maintenance hook (expiry/reservation/outbox; không crypto reconciliation) |
| `TELEGRAM_TOKEN_ENCRYPTION_SECRET` | Worker | Secret | Root 32 byte base64url để mã hóa token và webhook secret của registry bot Telegram; không lưu trong D1 |
| `TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION` | Worker | Config | Nhãn phiên bản current-write cho credential registry; chỉ đổi trong quy trình dual-read/rewrap |
| `TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS` | Worker | Secret | JSON keyring tạm thời cho dual-read/rewrap; xóa sau khi mọi row đã về current version |
| `PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | Build-time, public | Config | Bật Cloudflare Web Analytics |
| `ROUTER_API_KEY` | Máy local | Secret | Key 9Router; không commit/không dùng `PUBLIC_*` |
| `ROUTER_IMAGE_ENDPOINT` | Máy local | Config | Mặc định `http://localhost:20128/v1/images/generations` |
| `ROUTER_IMAGE_MODEL` | Máy local | Config | Mặc định `cx/gpt-5.5-image` |
| `ROUTER_IMAGE_*` | Máy local | Config | Size, quality, background, detail, format, output |

Config không nhạy cảm có thể đặt trong Dashboard Worker Variables. Secret dùng:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put CONTACT_HASH_SECRET
npx wrangler secret put VIETQR_BANK_ACCOUNT
npx wrangler secret put PAYOS_CLIENT_ID
npx wrangler secret put PAYOS_API_KEY
npx wrangler secret put PAYOS_CHECKSUM_KEY
npx wrangler secret put SHOP_ORDER_TOKEN_SECRET
npx wrangler secret put SHOP_KEY_ENCRYPTION_SECRET
npx wrangler secret put SHOP_CRON_SECRET
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' | npx wrangler secret put TELEGRAM_TOKEN_ENCRYPTION_SECRET
```

Không commit giá trị Access, token, API key hoặc database credential. Tạo `CONTACT_HASH_SECRET` từ ít nhất 32 byte ngẫu nhiên và chỉ xoay khóa có chủ đích: xoay khóa làm định danh IP mới không còn trùng với bản ghi/rate-limit cũ. `keep_vars: true` giữ Dashboard vars khi deploy, nhưng vẫn phải kiểm tra đúng environment/account.

## CMS Và Publish Workflow

Admin API hiện có các nhóm endpoint:

```text
GET    /admin/api/session
GET    /admin/api/content?type=site_section|project|post
POST   /admin/api/content/:type
GET    /admin/api/content/:type/:id
PUT    /admin/api/content/:type/:id
POST   /admin/api/content/:type/:id/publish
POST   /admin/api/content/:type/:id/unpublish
POST   /admin/api/content/:type/:id/delete
POST   /admin/api/content/:type/:id/restore
GET    /admin/api/content/:type/:id/revisions
GET    /admin/api/content/:type/:id/revision/:revisionId
POST   /admin/api/publish
GET    /admin/api/settings
PUT    /admin/api/settings
POST   /admin/api/media
GET    /admin/api/media/:id
```

Bulk publish được giới hạn tối đa `4` item mỗi request để giữ biên an toàn cho D1 Paid. API là nguồn thực thi giới hạn; không tăng giá trị này nếu chưa có kiểm thử query-budget cho toàn bộ validation, mutation, audit và post-read trong cùng invocation.

Workflow:

1. Tạo/sửa draft; mỗi lần lưu tạo revision mới và archive draft cũ.
2. Hoàn thiện `vi`, `en`, `ja`, `zh`. Project/post phải có title, excerpt, body, SEO title và SEO description trước khi publish.
3. Preview dữ liệu trong admin; kiểm tra URL, CTA và alt text media.
4. Publish bằng optimistic version. D1 batch archive published cũ, publish revision mới, cập nhật pointer/version và ghi audit.
5. Unpublish hoặc soft delete khi cần; restore không xóa lịch sử.

Public components đã đọc `CONTENT_DB` theo revision published và đúng locale. Production đã apply migration/seed remote; trước mỗi release vẫn kiểm tra parity bốn locale, Access và sitemap/content trên domain thật.

## Dự Án Đã Xác Minh

| Dự án | Trạng thái trình bày | Nguồn |
| --- | --- | --- |
| LogiVN | Public product, đang phát triển; multi-tenant F&B SaaS kết nối QR ordering và vận hành tại quán | `https://logivn.com` |
| Fball.vn | Public product, đang mở rộng; Club OS cho đội bóng phong trào | `https://fball.vn` |
| Payment Operations | Nghiên cứu kiến trúc, không tuyên bố là sản phẩm thanh toán đã ra mắt | Source nội bộ của portfolio |

`ball.vn` không phải domain production của Fball và không được dùng trong nội dung.

## Tạo Ảnh Với 9Router

```bash
export ROUTER_API_KEY="<local-9router-key>"
npm run image:generate -- "A monochrome architecture visual for the TUNG portfolio hero"
```

Đích mặc định là `public/generated/image.png`; đổi bằng `ROUTER_IMAGE_OUTPUT`. Mọi ảnh phải được kiểm tra bản quyền, chữ giả/logo, crop desktop/mobile, dung lượng và alt text trước khi dùng.

## Deploy Cloudflare Workers

1. Đăng nhập đúng Cloudflare account và zone `tung.codes`.
2. Xác minh `CONTACT_DB`, `CONTENT_DB`, `MEDIA`, Access vars và media custom domain đúng account.
3. Kiểm tra `wrangler d1 migrations list` cho cả hai database; production phải có CONTACT `0001`–`0005` và CONTENT tới `0046` (bao gồm `0042` crypto, `0043` currency, `0044` bot scopes, `0045` GLB storefront scope, `0046` manual payment proofs), không có migration pending.
4. Trước migration dọn/xóa dữ liệu, tạo D1 bookmark/export; áp từng nhóm đúng database và xác minh 10 item / 40 localization sau seed.
5. Chạy full verification và dry-run.
6. Xác nhận `TURNSTILE_SECRET_KEY`, `CONTACT_HASH_SECRET`, `SHOP_ORDER_TOKEN_SECRET`, `SHOP_KEY_ENCRYPTION_SECRET`, `SHOP_CRON_SECRET` và `TELEGRAM_TOKEN_ENCRYPTION_SECRET` tồn tại bằng cơ chế secret của Wrangler/Dashboard; không cần provider secrets cho crypto manual. Không in giá trị ra terminal hoặc tài liệu. Không deploy registry Telegram khi thiếu encryption root hoặc còn migration `0037`–`0039` chưa được lập kế hoạch áp dụng.
7. Deploy:

```bash
npm run deploy
```

`npm run deploy` luôn build trước khi gọi Wrangler để tránh phát hành `dist` cũ. Đây là hybrid Static Assets + Worker APIs; upload static-only trong Dashboard không thay thế được deploy có D1/R2 bindings.

### Rollback

1. Ghi lại Worker version đang ổn định trước deploy; nếu release lỗi, rollback version bằng Cloudflare Dashboard hoặc `wrangler rollback` sau khi xác nhận đúng account và version đích.
2. D1 migration là forward-only trong workflow này. Không sửa/xóa bảng để “rollback”; dùng bookmark/Time Travel hoặc bản export đã tạo, rồi xác minh lại cả `CONTACT_DB` và `CONTENT_DB`.
3. Nội dung lỗi nhưng schema vẫn đúng: unpublish hoặc restore revision trong `/admin`, không rollback toàn bộ Worker.
4. R2 dùng object key bất biến; đổi pointer/revision về media cũ thay vì ghi đè object.
5. Sau rollback, kiểm tra lại apex, `www` redirect, `/admin` Access, contact Turnstile, RSS, sitemap và một trang ở mỗi locale.

## Chính Sách Không Công Khai Mã Nguồn

- Portfolio chỉ liên kết website sản phẩm đã xác minh; không hiển thị URL kho mã nguồn, tên kho, CTA xem code hoặc metadata có thể suy ra vị trí source.
- Admin loại các khóa metadata dạng repository và validation từ chối host lưu trữ source trên public URL fields.
- Trước release, tìm trong source public, seed, `dist/client`, HTML production, sitemap và RSS. Phát hiện thông tin source là release blocker.

Khi cấu hình DNS, không xóa/ghi đè record email Zoho hoặc các hostname legacy `profile.tungjpstore.net`, `media.tungjpstore.net` ngoài phạm vi đã xác minh.

## Quyền Riêng Tư

- Chỉ dùng contact data để phản hồi và quản lý trao đổi.
- Không bán dữ liệu hoặc gửi form content vào analytics.
- Không lưu IP thô; chỉ lưu hash cho chống lạm dụng.
- CMS audit lưu Access actor email, action, entity, request ID và thời điểm để truy vết thay đổi.
- D1 không có TTL ứng dụng tự động trong dự án hiện tại; không hứa retention cố định cho tới khi có quy trình xóa đã kiểm chứng.
- Yêu cầu truy cập/xóa dữ liệu được tiếp nhận qua email công bố trên trang Liên hệ và cần xác minh người yêu cầu.
