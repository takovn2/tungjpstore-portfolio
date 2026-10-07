# TUNG Design System

TUNG dùng ngôn ngữ editorial engineering: nền tối, serif lớn, nhịp đọc rộng, đường kỹ thuật mảnh và lime như tín hiệu hành động. Trọng tâm là bằng chứng sản phẩm và quyết định vận hành, không phải card trang trí hoặc landing page SaaS chung chung.

## Nguyên Tắc

1. Project proof đứng trước tuyên bố thương hiệu.
2. Mỗi section có một hierarchy và một hành động chính rõ.
3. Trang trí phải hỗ trợ đọc, trạng thái hoặc luồng hệ thống.
4. Không dùng metric, testimonial, screenshot hoặc logo giả để làm giao diện có vẻ “đầy”.
5. Motion giải thích thứ tự và phản hồi; không chạy lặp chỉ để gây chú ý.
6. JavaScript lỗi hoặc reduced motion không được làm mất nội dung.
7. Việt, Anh, Nhật, Trung dùng chung component mà không phụ thuộc độ dài câu hoặc khoảng trắng.

## Hướng Thị Giác

- Nền tối có lưới rất nhẹ, không dùng flat background đơn điệu.
- Display serif tạo giọng biên tập; sans cho nội dung; mono cho status, số thứ tự và dữ liệu hệ thống.
- Accent lime chỉ dành cho CTA chính, trạng thái chủ động, focus hoặc điểm chốt của visual.
- Dự án thật có visual abstraction riêng qua `ProjectVisual.astro`, verified links và status text.
- Payment Operations được trình bày như research band, không giống project card của sản phẩm public.
- Tránh glassmorphism, bento grid, gradient tím, glow dày và card bo tròn lặp lại.

## Token

Token nằm trong `src/styles/globals.css`.

| Token | Giá trị | Vai trò |
| --- | --- | --- |
| `--ink` | `#0a0b0b` | Nền chính |
| `--ink-soft` | `#111313` | Nền phân cấp/hover |
| `--surface` | `#151817` | Bề mặt hệ thống |
| `--paper` | `#f1f0e8` | Chữ chính |
| `--paper-soft` | `#aaa9a2` | Chữ phụ/metadata |
| `--line` | `rgba(241,240,232,.16)` | Ranh giới |
| `--line-strong` | `rgba(241,240,232,.46)` | Ranh giới tương tác |
| `--accent` | `#c9f43d` | CTA, focus, trạng thái |
| `--accent-ink` | `#101407` | Chữ trên accent |
| `--danger` | `#ff8c78` | Lỗi/destructive state |
| `--gutter` | `clamp(1.25rem,3.5vw,4.5rem)` | Page gutter |
| `--container` | `94rem` | Content width tối đa |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | Ease-out chung |

Không hard-code màu mới nếu token hiện tại đã mang đúng nghĩa. Accent không dùng cho đoạn văn dài hoặc toàn bộ surface.

## Typography

| Token | Stack | Cách dùng |
| --- | --- | --- |
| `--font-sans` | Avenir Next, Helvetica Neue, sans-serif | Body, input, mô tả |
| `--font-serif` | Iowan Old Style, Baskerville, Times New Roman, serif | Hero, title, thesis, quote |
| `--font-mono` | SFMono-Regular, Menlo, Consolas, monospace | Label, status, number |

Không tải web font runtime. Khi đổi font, phải kiểm tra đầy đủ dấu tiếng Việt, kana/kanji và chữ Trung giản thể.

- `.display`: hero, tối đa khoảng 13ch.
- `.page-title`: title trang/case study.
- `.section-title`: title section narrative.
- `.lead`: mở đầu có nhịp đọc chậm.
- `.section-label`, `.mono-label`: metadata ngắn; không uppercase câu JA/ZH theo thói quen Latin.

Không split headline theo ký tự hoặc từ để animate. Cách đó dễ sai segmentation và accessibility ở bốn ngôn ngữ.

## Layout

- `.shell`: container `94rem`, gutter fluid.
- `.section`: vertical rhythm `clamp(5.5rem,10vw,10rem)`.
- `.section-rule`: đường phân cách narrative.
- Hero editorial dùng copy + proof panel, sau đó strip tóm tắt trạng thái.
- Section narrative ưu tiên 2 cột bất đối xứng; về 1 cột trước khi text chật.
- Body grid: 72 px desktop, 44 px dưới 760 px.
- Không dùng fixed height cho content đa ngôn ngữ; chỉ dùng `min-height` khi thật sự cần nhịp màn hình.
- Luôn cho phép `overflow-wrap` ở title/project name.

## Breakpoint

| Mốc | Mục đích |
| --- | --- |
| `1100px` | Project card proof chuyển sang grid gọn hơn |
| `900px` | Hero, Work, Case Study và narrative về một cột |
| `800px` | Header chuyển sang mobile menu khi JavaScript sẵn sàng |
| `760px` | Form/page grid và background grid thu gọn |
| `720px` | Footer đổi cấu trúc |
| `640px` | CTA, project card, architecture path về một cột |

Kiểm tra tối thiểu: 375x812, 390x844, 768x1024, 1440x900. Chỉ thêm breakpoint khi layout fluid không giải quyết được.

## Component Patterns

### Header

- Fixed; sau scroll mới có nền và border.
- Desktop có primary nav, language switcher và availability link.
- Không JavaScript: desktop nav vẫn nhìn thấy trên mobile để navigation không mất.
- Có JavaScript: menu button điều khiển overlay bằng `aria-expanded`/`aria-controls`.
- Menu mở phải khóa body scroll, đặt background inert, focus vào link đầu; Escape đóng và trả focus.
- Language switcher giữ route, query string và hash.

### CTA

- `.button-link.primary`: một hành động chính, nền accent.
- `.button-link`: hành động phụ có border.
- `.text-link`: link nội dung hoặc proof link.
- CTA label phải mô tả đích: “Xem sản phẩm đang chạy”, “Mở LogiVN”, “Đọc case study”, “Bắt đầu cuộc trao đổi”.
- Icon mũi tên chỉ trang trí, dùng `aria-hidden="true"`; accessible name phải nằm trong text.
- External link mở tab mới phải có `rel="noreferrer"`.
- Trên mobile, nhóm CTA case study về một cột và mỗi button chiếm chiều rộng hợp lý.

### Project Proof

- Home dùng `.project-card`: number, `ProjectVisual`, category, name, summary, status và proof links.
- Work dùng `.index-project`: visual lớn, thesis, summary, case-study CTA và website sản phẩm đã xác minh.
- `ProjectVisual.astro` là abstraction có ngữ nghĩa, không giả vờ là screenshot production.
- LogiVN và Fball có variant khác nhau để phản ánh F&B operations và club operations.
- Hover/focus chỉ dùng transform nhẹ và background; không animate padding/width/height gây layout shift.
- Status luôn có text; màu không phải tín hiệu duy nhất.

### Case Study

Trình tự chuẩn:

1. Hero + status + verified links.
2. Current state/evidence.
3. Context/problem.
4. Decisions/principles.
5. Architecture path.
6. Outcomes.
7. Reflection.
8. Next project.

Case study phải có CTA liên hệ và proof link tới website sản phẩm ở vùng high-intent. Research case không hiển thị website giả hoặc CTA dẫn tới mã nguồn.

### About Và Lab

- About kể cách làm việc bằng process path, principles và current focus; tránh danh sách kỹ năng như CV template.
- Lab giữ question, why it matters và current conclusion; status research/testing/in-progress phải rõ.
- Content nhiều item dùng numbered list hoặc path, không mặc định chuyển thành bento cards.

### Contact Form

- Label luôn hiển thị; placeholder chỉ gợi ý.
- Native attributes `required`, `minlength`, `maxlength`, email/URL type luôn tồn tại.
- JavaScript chỉ progressive-enhance bằng JSON submission và field-specific errors.
- Field lỗi dùng `aria-invalid`, `aria-errormessage`, focus về input và status live region.
- Submit button có disabled/sending state không đổi chiều rộng.
- Honeypot phải tránh tab.
- Không JavaScript vẫn dùng native browser validation; trang cung cấp email fallback.

### Admin

- `/admin` là control room riêng, không dùng public navigation/layout.
- Ngôn ngữ control room là tiếng Việt; editor quản lý nội dung `vi`, `en`, `ja`, `zh` và mặc định mở tab tiếng Việt.
- UI ưu tiên trạng thái, version, revision ID và action rõ hơn brand decoration.
- Destructive action dùng màu danger và soft delete; không hard delete trực tiếp.
- Bốn locale hiển thị cùng editor; publish chỉ thành công khi server validation đủ điều kiện.
- Response/page dùng noindex và no-store; không đưa admin vào sitemap.
- Admin shell có thể nhìn thấy nếu Access misconfigured, nhưng mọi API vẫn phải xác minh JWT và CSRF.

## Motion

Motion hiện có hai lớp:

- `[data-reveal]`: staged entrance cho hero bằng keyframe một lần.
- `.reveal`: section reveal bằng `IntersectionObserver`.

Quy tắc:

- Chỉ animate `opacity` và `transform` cho narrative/micro-interaction chính.
- Không JavaScript: content hiển thị mặc định (`opacity: 1`, `transform: none`).
- Browser không có `IntersectionObserver`: script đánh dấu content visible ngay.
- Dùng `--reveal-delay` để tạo stagger ngắn, không kéo tổng entrance quá lâu.
- Không infinite orbit, parallax hoặc autoplay video trang trí.
- `prefers-reduced-motion: reduce` tắt page reveal, project transform, smooth scroll và đặt content visible.
- Hover phải có `:focus-visible`/`:focus-within` tương đương khi có ý nghĩa.

## Accessibility

- Skip link trỏ tới `#main-content`.
- Mỗi page chỉ có một `h1`; section dùng heading theo thứ tự.
- Mọi interactive element có accessible name và focus-visible accent.
- Menu hỗ trợ Tab, Shift+Tab, Escape, focus trap và focus return.
- Không khóa content khi script lỗi; no-JS navigation/form vẫn dùng được.
- `role="status"`/`aria-live` dùng cho form/admin feedback; không spam announcement cho motion.
- Text chính dùng `--paper` hoặc `--paper-soft` với contrast đủ trên nền tối.
- Visual có role/label hoặc caption khi mang thông tin; ảnh content có alt theo locale.
- Không dùng màu, icon hoặc vị trí làm tín hiệu duy nhất.

## SEO Và Social Presentation

- Canonical dùng pathname chuẩn, không gồm query/hash.
- `hreflang`: `vi`, `en`, `ja`, `zh-Hans`, `x-default`.
- Open Graph/Twitter title, description, URL và image phải khớp page.
- Admin, API, preview, 404, draft/deleted content không vào sitemap.
- Khi thêm dynamic CMS page, structured data cần phản ánh loại nội dung; không dùng một `Person` schema để thay cho project/article schema mãi mãi.

## Ảnh Và Media

### Public project visual

`ProjectVisual.astro` là placeholder sản xuất có chủ đích. Có thể thay bằng screenshot thật khi:

1. Screenshot không lộ dữ liệu khách hàng hoặc secret.
2. Crop desktop/mobile đã kiểm tra.
3. File tối ưu WebP/AVIF hoặc format phù hợp.
4. Alt text mô tả đúng thông tin, không nhồi keyword.
5. Link/screenshot khớp trạng thái production hiện tại.

### CMS media

- R2 binding: `MEDIA`.
- Custom domain đang hoạt động: `media.tung.codes`.
- JPEG, PNG, GIF, WebP, AVIF; tối đa 8 MB; server kiểm MIME và magic bytes.
- Object key bất biến, cache public dài qua custom domain; admin preview vẫn private/no-store.
- Không dùng SVG upload để tránh active content.
- Không xoá object đang được revision cũ tham chiếu.

### 9Router

`scripts/generate-image.mjs` chỉ tạo concept cục bộ. `ROUTER_API_KEY` ở shell local; ảnh AI không tự động trở thành production asset. Kiểm tra chữ giả, logo, quyền sử dụng, dung lượng và alt trước khi đưa vào source/R2.

## Review Checklist

- Proof dự án có website/status đúng, không lộ vị trí mã nguồn và không dùng claim chưa kiểm chứng?
- Primary CTA có nổi bật và nói rõ đích?
- Việt/Anh/Nhật/Trung cùng structure, tự nhiên và không overflow?
- Heading, landmarks, focus order và accessible names đúng?
- Hover có equivalent cho keyboard?
- Content hiển thị khi không JavaScript và reduced motion?
- Menu mobile khóa scroll, trap/return focus và đóng bằng Escape?
- Form có native fallback, field errors và sending state?
- Motion chỉ dùng opacity/transform, không tạo layout shift?
- Admin noindex/no-store, Access/CSRF/server validation vẫn giữ?
- Sitemap/canonical/hreflang không lộ admin/draft?
- Đã kiểm tra 375, 390, 768 và 1440 px?
- `npm run test:smoke`, `npm run check`, `npm run build`, Wrangler dry-run đều sạch?

## Shop surface

Shop storefront + Telegram miniapps use the Bright & Cute language in [docs/SHOP_DESIGN_LANGUAGE.md](./docs/SHOP_DESIGN_LANGUAGE.md) and tokens in `src/styles/shop-tokens.css`. Portfolio dark editorial tokens above do not apply under `body.chrome-store`.

