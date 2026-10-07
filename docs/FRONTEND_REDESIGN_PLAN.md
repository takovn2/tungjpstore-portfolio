# TUNG Frontend Redesign Plan

Trạng thái: **Draft — chờ quyết định hướng** (phạm vi / mức độ thay đổi / số phương án)
Cập nhật: 2026-08-30 · Soạn trong session Design (AutoClaw)
Liên quan: [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) · [SHOP_DESIGN_LANGUAGE.md](SHOP_DESIGN_LANGUAGE.md) · [ADMIN_REDESIGN_SPEC.md](ADMIN_REDESIGN_SPEC.md) · [PHASE_RELEASE_STATUS.md](PHASE_RELEASE_STATUS.md)

## 1. Hiện trạng

### Ba hệ thị giác đang cùng tồn tại

| Bề mặt | Ngôn ngữ thị giác | Token | Ghi chú |
| --- | --- | --- | --- |
| Portfolio công khai | Dark editorial engineering — nền `#0a0b0b`, serif display, accent lime `#c9f43d` | `src/styles/globals.css` (1.459 dòng) | home, work, case study, about, blog, contact, pricing, lab, policy, 404 |
| Shop web | Soft Teal Professional — pastel `#f4faf9`, CTA `#2a9d8f`, bo tròn mềm | `src/styles/shop-tokens.css` (456) + `shop-market.css` (214) | Chia sẻ token với 2 bề mặt Telegram (vi/VND và GLB en/USD) |
| Admin | Editorial Control Desk (tiếng Việt) | `src/styles/admin.css` (523) | React shell, đã có spec + roadmap riêng |

### Ràng buộc không được phá vỡ

- Astro 7 SSR trên Cloudflare Workers; D1 không khả dụng → trạng thái 503 Unavailable phải giữ nguyên hành vi.
- 4 locale (vi/en/ja/zh) dùng chung component: không fixed height cho nội dung đa ngôn ngữ, `overflow-wrap` cho title, không animate theo ký tự.
- Không tải web font runtime (system stacks); đổi font phải kiểm tra dấu tiếng Việt, kana/kanji, chữ Trung giản thể.
- `prefers-reduced-motion` + fallback không-JS; JavaScript lỗi không được làm mất nội dung.
- Nội dung public đọc từ CONTENT_DB revision `published`; bundle chỉ là fallback cho nhóm chưa qua CMS.
- SEO (canonical, hreflang, OG, JSON-LD, sitemap) và security headers trên cả static lẫn worker.
- Không dùng metric/testimonial/screenshot giả; proof-first là nhận diện cốt lõi.

### ⚠️ Ghi chú vận hành — nguồn sự thật

- `~/Documents/Profile` **không phải git repo** (`git rev-parse` thất bại).
- `~/Documents/profile 2` chỉ chứa `.git` (cần kiểm tra — lịch sử có thể khôi phục được từ đây).
- Backup hiện có: `~/Documents/Profile-Shop-Frontend-Source-2026-08-04.zip` (22,8 MB, ngày 04-08).
- → Bước đầu tiên của mọi kịch bản: chốt baseline (git init + commit, hoặc xác định repo nguồn) trước khi sửa bất kỳ file nào.

## 2. Biên giới redesign

### Phải giữ

- Nhận diện thương hiệu: proof-first, editorial engineering, bằng chứng LogiVN/Fball đã xác minh.
- Route, ý nghĩa copy cốt lõi, luồng checkout/thanh toán, hợp đồng API, pipeline CMS.
- Toàn bộ ràng buộc kỹ thuật ở §1.

### Được phép tái cấu trúc

- Layout và phân cấp thông tin các trang public; cấu trúc hero; cách trình bày project showcase; composition section; treatment component; orchestration motion; pattern responsive; trạng thái empty/loading/error.

### Nguồn "mediocrity" lớn nhất (giả thuyết — chờ Phase 0 xác nhận)

1. `globals.css` 1.459 dòng tích tụ nhiều thế hệ pattern → nguy cơ drift thị giác giữa các trang.
2. Hai ngôn ngữ tương phản (portfolio dark lime ↔ shop pastel teal) gặp nhau ngay home qua ProductCard featured → dễ rời rạc.
3. Phase 0 audit sẽ chọn đúng MỘT vấn đề lớn nhất trước khi khóa hướng thiết kế.

### Mức độ thay đổi (chờ chọn)

- `Refinement` — giữ cấu trúc, nâng typography/spacing/chi tiết bề mặt.
- `Layout Restructure` — giữ nhận diện + luồng, dựng lại layout/phân cấp.
- `Full Redesign` — chỉ giữ nhận diện + nội dung cốt lõi, dựng lại hướng sáng tạo.

## 3. Kế hoạch phase

### Phase 0 — Audit & baseline (không đổi thị giác)

1. Git init + initial commit + tag `pre-redesign` (hoặc xác nhận nguồn sự thật khác).
2. Visual audit: screenshot home / work / 1 case study / shop / pricing × 4 locale × 375/768/1440.
3. Tech baseline: `npm run check` + `npm run test:all` phải xanh trước khi sửa.
4. CSS inventory: map selector → trang/component, xác định CSS chết vs pattern dùng chung.

Kết quả: phụ lục audit bổ sung vào doc này + chốt "vấn đề lớn nhất".

### Phase 1 — Phương án hướng

- Kịch bản 1 phương án: static HTML Home + 1 case study, đúng biên giới giữ-gì ở §2.
- Kịch bản 3 hướng: 3 mockup Home độc lập — cùng biên giới, cùng mode, khác concept/layout/tone (không chỉ khác màu/chữ/bo góc).
- Mỗi hướng kèm định hướng một dòng: "Thiết kế [loại giao diện] cho [đối tượng], bằng [tone thị giác], trọng tâm là [điểm khác biệt cốt lõi]."

### Phase 2 — Chốt system

- Áp hướng đã chọn vào token + component dùng chung (`globals.css`; `shop-tokens.css` nếu shop trong phạm vi). Không hard-code màu ngoài token.
- Thứ tự migration: Header → Footer → project-card/system → form → shop surfaces (nếu có).

### Phase 3 — Rollout từng trang

Home → work/case study → about/contact → blog → pricing/policy/404 → shop (nếu có).
Mỗi trang phải qua check 4 locale × 375/768/1440 rồi mới chuyển trang tiếp.

### Phase 4 — QA & release

- `npm run check` + `npm run test:all`; kiểm tra reduced-motion + no-JS; regression SEO.
- `npm run deploy` (wrangler) + post-deploy smoke; cập nhật `PHASE_RELEASE_STATUS.md`.

## 4. Ngoài phạm vi (mặc định)

- Admin (có spec + roadmap riêng; chỉ chạm nếu chọn phạm vi toàn bộ frontend).
- Business logic, API, migration D1, luồng payment.
- Web font runtime (vi phạm ràng buộc hiện tại — trừ khi bạn muốn đổi ràng buộc này).

## 5. Quyết định đang chờ

Phạm vi · Mức độ thay đổi · Số phương án Phase 1 · Vấn đề chính cần giải quyết · Xu hướng thị giác · Git baseline · Bước tiếp theo — gửi kèm question-form trong chat.
