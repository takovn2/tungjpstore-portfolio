# Content Guide

Tài liệu này định nghĩa nguồn nội dung, giọng văn, quy trình bốn ngôn ngữ và workflow CMS cho portfolio TUNG.

## Nguồn Sự Thật

Hiện có hai lớp nội dung:

1. CMS content trong `CONTENT_DB` là nguồn public cho item đã được quản lý, được chỉnh qua `/admin` và chỉ đọc revision `published` đúng locale bằng `src/lib/content-store.ts`.
2. Source content trong `src/i18n/dictionaries.ts` giữ UI labels, nội dung bootstrap và fallback cho nhóm chưa từng được CMS quản lý.

Public CMS cutover đã được nối vào Home, Work, Case Study, Lab, Contact và sitemap. Nếu D1 không khả dụng, route trả `503`/`no-store`; không fallback mù sang dictionary vì có thể làm sống lại nội dung đã unpublish hoặc soft-delete. Production đã deploy, Access/Turnstile/D1/R2 đang hoạt động và hai chuỗi migration remote hiện đủ `0001`–`0005`; mọi release sau vẫn phải kiểm tra lại domain thật thay vì suy luận từ code local.

Các file hỗ trợ nội dung:

| File | Vai trò |
| --- | --- |
| `src/i18n/dictionaries.ts` | Copy public bốn locale và route labels |
| `src/i18n/blog.ts` | Copy riêng cho publication, CTA bài viết, empty state và RSS ở bốn locale |
| `src/content/projects.ts` | Hồ sơ dự án, kiến trúc, link và trạng thái đã xác minh |
| `src/content/site.ts` | Định vị, profile và nguyên tắc làm việc |
| `src/content/lab.ts` | Research notes; không nâng cấp thành sản phẩm khi chưa có bằng chứng |
| `src/lib/admin/types.ts` | CMS block/content contract |
| `src/lib/admin/validation.ts` | Server-side validation cho nội dung, URL và metadata |
| `src/lib/content-store.ts` | Chỉ đọc revision published đúng locale; không fallback âm thầm |

Component chỉ trình bày nội dung. Không hard-code câu chữ cần dịch vào component, ngoại trừ tên riêng, URL nguồn hoặc nhãn kỹ thuật có chủ đích.

## Locale Và URL

| Locale | Quy tắc URL | Ví dụ |
| --- | --- | --- |
| `vi` | Mặc định, không prefix | `/work/logivn` |
| `en` | Prefix `/en` | `/en/work/logivn` |
| `ja` | Prefix `/ja` | `/ja/work/logivn` |
| `zh` | Prefix `/zh`, render `zh-Hans` | `/zh/work/logivn` |

`localizePath()` chịu trách nhiệm thay locale. Không nối prefix bằng tay. `/vi` chuyển về `/`; language switcher phải giữ pathname, query string và hash.

Slug là dữ liệu chung và không dịch. Cùng một project dùng `logivn` hoặc `fball` ở cả bốn locale để canonical, `hreflang`, sitemap và language switcher ổn định.

## Bản Đồ Public Content

| Trang | Dictionary | Component |
| --- | --- | --- |
| Trang chủ | `home`, `projects`, `common` | `HomePage.astro` |
| Danh sách dự án | `work`, `projects` | `WorkPage.astro` |
| Case study | `caseStudy`, `projects` | `CaseStudyPage.astro` |
| Giới thiệu | `about` | `AboutPage.astro` |
| Ghi chép / Lab | `src/i18n/blog.ts`, fallback `lab` | `LabPage.astro`, `PostPage.astro` |
| Liên hệ | `contact` | `ContactPage.astro` |
| Quyền riêng tư | `privacy` | `PrivacyPage.astro` |
| 404 | `notFound` | `NotFoundPage.astro` |

Route tiếng Việt nằm trong `src/pages/`; `en`, `ja`, `zh` đi qua `src/pages/[lang]/index.astro` và `src/pages/[lang]/[...slug].astro`.

## Dự Án Đã Xác Minh

### LogiVN

- Slug: `logivn`
- Website: `https://logivn.com`
- Trạng thái: public product, active development
- Bản chất: multi-tenant F&B SaaS cho quán cà phê/nhà hàng Việt
- Phạm vi có thể mô tả: QR menu/order, modifier/combo, order/kitchen/table workflow, reservation, staff/permissions; inventory, payment và platform operations chỉ mô tả đúng mức đã kiểm chứng
- Không công bố user, doanh thu, conversion hoặc performance metric khi chưa có nguồn

### Fball.vn

- Slug: `fball`
- Website: `https://fball.vn`
- Trạng thái: public product, đang mở rộng
- Bản chất: Vietnam-first Club OS cho đội bóng phong trào
- Phạm vi có thể mô tả: lịch trận, điểm danh, squad/lineup, thành viên, role/permission, thông báo, audit và quỹ đội
- Discovery, maps, media, AI, Telegram hoặc provider-cost features phải ghi là planned/in-progress/feature-flagged nếu chưa bật production
- `ball.vn` là domain khác và không được dùng làm link sản phẩm

### Kiểm tra sản phẩm công khai (23/07/2026)

- LogiVN đã được kiểm tra qua website production và các luồng sản phẩm có thể truy cập. Không đưa thông tin kho mã nguồn vào nội dung portfolio.
- Fball.vn đã được kiểm tra qua website production, gồm public signup, onboarding và các luồng khám phá/ghép trận. Các module phụ thuộc provider hoặc chi phí vẫn phải ghi là gated/in-progress nếu chưa bật cấu hình production.
- `https://fball.vn` là website sản phẩm và hiện có các entry point `/tim-doi`, `/ghep-tran`, `/san-bong`. `https://ball.vn` là một trang rao bán tên miền độc lập, không phải website Fball; tuyệt đối không dùng làm product link.

### Payment Operations Research

- Slug: `payment-infrastructure`
- Trạng thái: research/prototype, không phải launched payment product
- Phạm vi: payment intent, matching, idempotency, signed webhook, retry, reconciliation và audit model
- Không dùng ngôn từ hàm ý giữ tiền, chuyển tiền hoặc cung cấp dịch vụ thanh toán được cấp phép
- Trên Work page, nội dung này nằm trong Research/Lab, không đứng ngang LogiVN và Fball như sản phẩm hoàn thiện

## Chính Sách Bảo Mật Nguồn

- Public content chỉ được liên kết website sản phẩm, bài viết, trang liên hệ hoặc tài nguyên công khai đã duyệt.
- Không xuất bản URL kho mã nguồn, tên kho riêng, đường dẫn clone, CTA xem code, ảnh chụp chứa đường dẫn source hoặc metadata có thể suy ra vị trí source.
- Không dùng kho mã nguồn làm “proof”. Bằng chứng công khai là website production, workflow có thể quan sát và trạng thái được kiểm chứng.
- Trường `meta` có khóa mang nghĩa repository phải bị loại; URL public trỏ tới host lưu trữ source phải bị validation từ chối.
- Trước publish và release, soát CMS revision, seed, HTML, RSS, sitemap và client bundle. Bất kỳ dấu vết source nào cũng chặn nghiệm thu.

## Cấu Trúc Case Study

Mỗi case study phải trả lời theo thứ tự:

1. Sản phẩm đang ở trạng thái nào và bằng chứng công khai là gì?
2. Vòng vận hành thực tế bắt đầu từ đâu?
3. Điểm nghẽn nào đáng giải quyết?
4. Vai trò/phạm vi của Tung là gì?
5. Ranh giới tenant, permission, data và provider nằm ở đâu?
6. Những quyết định thiết kế/kỹ thuật nào giữ hệ thống nhất quán?
7. Kết quả nào đã có thể quan sát mà không cần bịa metric?
8. Điều gì vẫn đang nghiên cứu, planned hoặc chưa bật?

Một project record đầy đủ nên có `name`, `category`, `status`, `thesis`, `summary`, `context`, `problem`, `role`, `responsibilities`, `constraints`, `principles`, `domains`, `architectureNodes`, `selectedFlows`, `designDecisions`, `technicalDecisions`, `outcomes`, `currentState`, `whatChanged`, `reflection` và verified links.

## Giọng Văn

- Viết tiếng Việt trước để chốt ý, nhưng không biến EN/JA/ZH thành bản dịch từng chữ.
- Câu ngắn, chủ động, cụ thể; ưu tiên danh từ/trạng thái thật hơn tính từ quảng cáo.
- Nói rõ ai đang làm gì, thông tin chuyển qua đâu và quyết định nào trở thành state.
- Phân biệt `live`, `active development`, `in progress`, `planned`, `research`, `paused`, `archived`.
- Không dùng “đột phá”, “toàn diện”, “tối ưu”, “thông minh” nếu câu không chỉ ra điều cụ thể được cải thiện.
- Không viết như hồ sơ năng lực chung chung. Mỗi đoạn phải có vấn đề, quyết định, bằng chứng hoặc giới hạn.
- Không tạo testimonial, logo đối tác, số người dùng, doanh thu hoặc metric hiệu năng giả.
- Giữ tên sản phẩm/stack nhất quán, nhưng giải thích thuật ngữ khi người đọc không cần biết code.

## CTA

Mỗi section chỉ có một hành động chính rõ ràng. CTA phải cho người đọc biết sẽ mở gì:

- Primary home: xem sản phẩm đang chạy.
- Project card: xem case study.
- Bằng chứng dự án: mở website thật; không công khai thông tin kho mã nguồn trên portfolio.
- Case study high-intent area: liên hệ và mở sản phẩm.
- Contact: bắt đầu cuộc trao đổi bằng vấn đề cụ thể.

Không dùng CTA mơ hồ như “Tìm hiểu thêm” nếu có thể viết “Xem case study LogiVN” hoặc “Mở Fball.vn”. External link phải HTTPS, có `target="_blank"` và `rel="noreferrer"` khi mở tab mới.

## CMS Content Model

CMS hỗ trợ ba type:

- `site_section`: Hero, contact/profile hoặc section cấu hình.
- `project`: Case study/project proof.
- `post`: Bài viết dài.

Mỗi revision có:

- Metadata chung: slug, sort order, cover media ID và `meta` JSON đã validate.
- Bốn localization: `vi`, `en`, `ja`, `zh`.
- Localized fields: `title`, `eyebrow`, `excerpt`, `body`, `seoTitle`, `seoDescription`.
- Body block allowlist: `paragraph`, `heading`, `quote`, `list`, `image`, `cta`, `metric`.

Không lưu HTML tự do. Text chứa `<`/`>` bị từ chối; CTA/media URL chỉ chấp nhận internal path bắt đầu bằng một `/` hoặc HTTPS URL không có credentials. Protocol-relative, HTTP, `javascript:`, `data:` và backslash bị từ chối.

## Quy Tắc Publish

- Draft có thể chưa đủ để biên tập dần.
- Publish bắt buộc có đủ `vi`, `en`, `ja`, `zh`.
- Project/post cần title, excerpt, body, SEO title và SEO description ở mọi locale.
- Lưu draft tạo revision mới và archive draft cũ.
- Publish dùng expected version; stale editor phải nhận conflict thay vì ghi đè.
- Publish batch chạy nguyên tử: archive bản published cũ, publish revision mới, cập nhật pointer/version, ghi audit.
- Delete là soft delete; restore không xoá lịch sử.
- Public reader chỉ lấy revision `published`, đúng locale và item chưa bị xoá; không fallback sang tiếng Việt khi locale thiếu.

## Quy Trình Biên Tập

### Seed ban đầu cho CONTENT_DB

`scripts/seed-content.mjs` chuyển phần nội dung có thể quản trị từ dictionary thành `content-migrations/0003_seed_public_content.sql`. Seed chạy sau migration projection của revision, gồm Hero, contact profile, ba project và năm ghi chú Lab, với một revision published đủ bốn locale cho mỗi item.

Production dùng trọn chuỗi CONTENT `0001`–`0005`: `0001` schema CMS, `0002` public projection, `0003` seed, `0004` loại public source-link metadata/CTA và `0005` dọn tham chiếu source còn nằm trong text. Hai migration vệ sinh dữ liệu phải được xem trước và có D1 bookmark/export trước khi áp ở môi trường mới.

- `npm run cms:seed:dry-run`: hiển thị số item/localization và checksum, không kết nối D1.
- `npm run cms:seed:check`: báo lỗi nếu migration đã lệch khỏi dictionary.
- `npm run cms:seed:generate`: sinh lại migration sau khi copy nguồn đã được duyệt.
- `npm run cms:seed:apply -- --local|--remote`: áp seed vào môi trường được chỉ rõ.

Seed dùng ID deterministic, `INSERT OR IGNORE` và điều kiện bảo vệ. Chạy lại không tạo bản sao, không thay revision đang published và không ghi đè `site_state` đã được chỉnh qua admin. Đây là bootstrap nội dung, không phải cơ chế đồng bộ hai chiều; sau khi CMS là nguồn chính, không sinh/apply lại seed để thay cho workflow draft → review → publish.

### Khi cập nhật source và seed bootstrap

1. Chỉnh tiếng Việt trong dictionary/source.
2. Biên tập độc lập EN, JA, ZH với cùng cấu trúc khóa.
3. Soát verified facts, status, CTA và link.
4. Chạy `npm run test:smoke`, `npm run check`, `npm run build`.
5. Kiểm tra bốn locale, mobile, SEO và reduced motion.

### Biên tập qua CMS (workflow hiện tại)

1. Tạo/sửa draft tại `/admin`.
2. Hoàn thiện bốn locale; không dùng machine translation chưa biên tập như bản publish.
3. Kiểm tra preview/mobile/SEO khi preview route được nối hoàn chỉnh.
4. Publish với version hiện tại.
5. Xác minh public content sau cache window đã công bố.
6. Khi cần rollback, restore revision thành draft mới hoặc unpublish; không sửa lịch sử đã publish.

Giao diện vận hành `/admin` dùng tiếng Việt để nhất quán với chủ sở hữu. Bốn locale là phạm vi nội dung được biên tập và xuất bản, không phải bốn bản dịch của toàn bộ control desk. Tiếng Việt mở trước, nhưng server chỉ cho publish project/post khi `vi`, `en`, `ja`, `zh` đều đạt validation.

## Metadata Và SEO

Mỗi public page cần title và description riêng. `BaseLayout.astro` tạo canonical, Open Graph, Twitter card, JSON-LD và `hreflang` gồm `vi`, `en`, `ja`, `zh-Hans`, `x-default`.

Publication dùng nhóm copy riêng trong `src/i18n/blog.ts` để không làm phình dictionary chính. Các khóa gồm metadata (`metaTitle`, `metaDescription`), tiêu đề/giới thiệu (`label`, `heading`, `intro`), card và thời gian đọc (`articleCount`, `readArticle`, `publishedLabel`, `authorLabel`, `readingTime`), trạng thái rỗng (`emptyTitle`, `emptyBody`, `emptyCta`), điều hướng/CTA (`backToArticles`, `continueExploring`, `contactCta`, `rssLabel`) và thông tin feed (`publicationName`, `publicationDescription`). Mọi locale phải giữ cùng shape nhưng biên tập câu chữ độc lập.

Bài viết published tạo `Article` và `BreadcrumbList` JSON-LD, `og:type=article`, ngày xuất bản/cập nhật, ảnh/alt, canonical và chỉ phát `hreflang` cho locale thực sự có bản published. RSS dùng `/rss.xml`, `/en/rss.xml`, `/ja/rss.xml`, `/zh/rss.xml`; feed chỉ lấy post published đúng locale, escape XML và trả `503/no-store` khi D1 không khả dụng.

Khi thêm route/content public:

1. Bổ sung bốn locale và cùng slug.
2. Cập nhật router locale nếu là route mới.
3. Cập nhật sitemap; không đưa `/admin`, API, preview, draft, deleted hoặc 404 vào.
4. Kiểm tra canonical không chứa query/hash.
5. Kiểm tra title/description tự nhiên ở từng ngôn ngữ, không cắt một câu dịch máy.
6. Ảnh nội dung phải có alt; ảnh trang trí dùng alt rỗng có chủ đích.

## Form Và Quyền Riêng Tư

Form public gửi tên, email, công ty, website, nội dung đang xây, vấn đề và locale. Hai textarea được ghép thành `message`; honeypot tách riêng.

Copy phải khớp hành vi thật:

- Không hứa email tự động khi chưa có email provider.
- Chỉ mô tả Turnstile là lớp chống lạm dụng của form; không hứa rằng mọi lượt gửi đều không cần tương tác.
- Không hứa retention cố định khi chưa có job xóa đã kiểm chứng.
- Nói rõ dữ liệu chỉ phục vụ phản hồi, vận hành và chống lạm dụng.
- Cung cấp email fallback khi API không hoạt động.

## Checklist Biên Tập

- Tiếng Việt là mặc định và route không prefix.
- Bốn locale có cùng shape, nhưng câu chữ tự nhiên theo từng ngôn ngữ.
- Không có UI copy quan trọng bị hard-code ngoài content source/CMS.
- LogiVN/Fball dùng đúng website đã xác minh; không công khai thông tin kho mã nguồn.
- Không có URL, CTA, metadata hoặc text gợi ra vị trí source trong CMS, seed, RSS, sitemap hay HTML public.
- Không có `ball.vn`, trạng thái Fball “archived” hoặc mô tả “sports content platform”.
- Research không bị trình bày thành launched product.
- CTA nói rõ hành động và target.
- Metadata đúng nội dung; sitemap không lộ admin/draft.
- Link internal dùng `localizePath()`; external dùng HTTPS.
- Alt text, heading order và độ dài mobile được soát ở bốn locale.
- Privacy copy khớp dữ liệu thực tế được lưu trong D1.
- `npm run test:smoke`, `npm run check` và `npm run build` đều sạch.
