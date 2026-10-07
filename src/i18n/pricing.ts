import type { Locale } from "./dictionaries";
import type { ServiceBudgetBand, ServicePricePoint } from "../lib/services/currency";

type ServiceItem = {
  label: string;
  title: string;
  summary: string;
  fit: string;
  engagement: string;
  deliverables: readonly string[];
};

type BudgetItem = {
  label: string;
  title: string;
  description: string;
  fit: string;
  timeline: string;
  options: readonly { label: string; pricePoint: ServicePricePoint }[];
  examples: readonly string[];
  featured?: boolean;
};

type PricingCopy = {
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  label: string;
  headingLead: string;
  headingEmphasis: string;
  intro: string;
  facts: readonly { label: string; value: string }[];
  servicesLabel: string;
  servicesHeading: string;
  servicesIntro: string;
  services: readonly ServiceItem[];
  budgetLabel: string;
  budgetHeading: string;
  budgetIntro: string;
  budgetImageAlt: string;
  budgetFitLabel: string;
  budgetTimelineLabel: string;
  budgetIncludedLabel: string;
  budgetFeaturedLabel: string;
  budgetBands: Record<ServiceBudgetBand, BudgetItem>;
  addOnsLabel: string;
  addOnsHeading: string;
  addOnsIntro: string;
  addOns: readonly { title: string; body: string; price: string }[];
  proofLabel: string;
  proofHeading: string;
  proofIntro: string;
  proofItems: readonly { label: string; title: string; body: string; href: string; linkLabel: string }[];
  proposalLabel: string;
  proposalHeading: string;
  proposalItems: readonly { title: string; body: string }[];
  processLabel: string;
  processHeading: string;
  process: readonly { title: string; body: string }[];
  scopeLabel: string;
  scopeHeading: string;
  includedLabel: string;
  included: readonly string[];
  outsideLabel: string;
  outside: readonly string[];
  faqLabel: string;
  faqHeading: string;
  faqs: readonly { question: string; answer: string }[];
  ctaLabel: string;
  ctaHeading: string;
  ctaBody: string;
  ctaPrimary: string;
  ctaSecondary: string;
  responseNote: string;
};

const pricingCopyBase = {
  vi: {
    navLabel: "Dịch vụ & chi phí",
    metaTitle: "Dịch vụ và chi phí dự án — TUNG",
    metaDescription: "Thiết kế và phát triển website cho doanh nghiệp vừa và nhỏ — từ landing page frontend đến website doanh nghiệp, backend và SaaS theo yêu cầu.",
    label: "SERVICES / INVESTMENT",
    headingLead: "Website tốt bắt đầu từ",
    headingEmphasis: "một bài toán kinh doanh rõ.",
    intro: "TUNG thiết kế và phát triển website cho doanh nghiệp vừa và nhỏ: từ landing page frontend gọn, website doanh nghiệp tạo chuyển đổi, đến backend và SaaS có nhiều vai trò. Bạn nhận một hệ thống rõ ràng, nhanh và có thể tiếp tục phát triển.",
    facts: [
      { label: "Từ", value: "Frontend landing page → SaaS backend" },
      { label: "Đối tượng", value: "SME, đội sản phẩm và founder" },
      { label: "Hợp tác", value: "Proposal rõ · milestone · bàn giao" },
    ],
    servicesLabel: "Năng lực cốt lõi",
    servicesHeading: "Chọn đúng độ phức tạp cho giai đoạn của doanh nghiệp.",
    servicesIntro: "Ba hướng hợp tác dưới đây bao phủ phần lớn nhu cầu của một doanh nghiệp đang cần hiện diện tốt hơn hoặc xây sản phẩm mới. Bạn có thể bắt đầu nhỏ rồi mở rộng mà không phải làm lại từ đầu.",
    services: [
      {
        label: "01 / FRONTEND",
        title: "Landing page & frontend launch",
        summary: "Một landing page hoặc microsite tập trung vào thông điệp, tốc độ và chuyển đổi — thiết kế riêng, responsive, sẵn sàng chạy chiến dịch.",
        fit: "Phù hợp khi bạn cần ra mắt dịch vụ, sản phẩm hoặc chiến dịch với một trải nghiệm sắc nét trong thời gian ngắn.",
        engagement: "Phạm vi gọn, nội dung được chốt sớm, triển khai theo một đến hai milestone.",
        deliverables: ["Thông điệp và cấu trúc trang", "Art direction và UI responsive", "Tương tác, form và tracking cơ bản", "Tối ưu tốc độ, SEO kỹ thuật và accessibility", "Deploy, hướng dẫn cập nhật và bàn giao"],
      },
      {
        label: "02 / BUSINESS WEBSITE",
        title: "Website doanh nghiệp tạo niềm tin",
        summary: "Website nhiều trang cho SME: định vị, dịch vụ, case study, blog, tuyển dụng và lead form được tổ chức thành một hệ thống nội dung dễ quản trị.",
        fit: "Phù hợp khi website phải giúp khách hàng hiểu, tin và liên hệ — không chỉ là một tấm danh thiếp online.",
        engagement: "End-to-end theo proposal và milestone, có CMS hoặc tích hợp theo nhu cầu.",
        deliverables: ["Định vị, sitemap và content plan", "Visual system và responsive frontend", "CMS, blog, form và analytics", "SEO on-page, schema và redirect plan", "Performance, launch, training và bàn giao"],
      },
      {
        label: "03 / CUSTOM SAAS",
        title: "Web app, backend & SaaS theo yêu cầu",
        summary: "Xây sản phẩm web có đăng nhập, phân quyền, dữ liệu, workflow, thanh toán hoặc API — từ kiến trúc backend đến giao diện vận hành.",
        fit: "Phù hợp khi doanh nghiệp cần số hoá quy trình, tạo sản phẩm SaaS hoặc kết nối nhiều nhóm người dùng trong một nền tảng.",
        engagement: "Discovery ngắn, sau đó phát triển theo phase với môi trường staging, nghiệm thu và roadmap tiếp theo.",
        deliverables: ["Product scope, user roles và data model", "Frontend responsive và design system", "Backend, auth, database, API và tích hợp", "Logging, security baseline, deploy và monitoring", "Tài liệu kỹ thuật, đào tạo và bàn giao"],
      },
    ],
    budgetLabel: "Bảng giá tham khảo",
    budgetHeading: "Ba mốc rõ ràng để chọn đúng mức đầu tư.",
    budgetIntro: "Đây là khoảng ngân sách tham khảo cho các dự án phổ biến của SME tại Việt Nam, không phải gói đóng hộp. Phạm vi cuối cùng sẽ chốt theo nội dung, số trang, tích hợp, dữ liệu, yêu cầu vận hành và tiêu chí nghiệm thu.",
    budgetImageAlt: "Minh hoạ các lớp phạm vi tăng dần từ landing page đến website doanh nghiệp và nền tảng SaaS",
    budgetFitLabel: "Phù hợp khi",
    budgetTimelineLabel: "Thời lượng thường gặp",
    budgetIncludedLabel: "Thường bao gồm",
    budgetFeaturedLabel: "Lựa chọn phổ biến",
    budgetBands: {
      focused: { label: "01 / FRONTEND STARTER", title: "Landing page tập trung", description: "Landing page hoặc microsite có thông điệp rõ, giao diện riêng, responsive và tối ưu chuyển đổi.", fit: "Khi cần ra mắt nhanh để kiểm tra thị trường, nhận lead hoặc giới thiệu một dịch vụ mới.", timeline: "1–2 tuần", options: [{ label: "Launch landing page · 1–2 tuần", pricePoint: "landing" }], examples: ["1–3 trang trọng tâm", "Form và analytics cơ bản", "SEO kỹ thuật và deploy"] },
      build: { label: "02 / SME WEBSITE", title: "Website doanh nghiệp", description: "Website giới thiệu doanh nghiệp nhiều trang, có CMS/blog, case study, form và nền tảng SEO để đội ngũ tự vận hành.", fit: "Khi website là kênh tạo niềm tin, nhận yêu cầu và hỗ trợ bán hàng dài hạn.", timeline: "3–8 tuần", options: [{ label: "Business lead-gen · 3–5 tuần", pricePoint: "businessLeadGen" }, { label: "Growth / corporate · 5–8 tuần", pricePoint: "businessGrowth" }], examples: ["5–12 trang nội dung", "CMS, blog và lead form", "SEO on-page, schema và training"], featured: true },
      platform: { label: "03 / CUSTOM SAAS", title: "Web app & SaaS", description: "Sản phẩm web có tài khoản, quyền hạn, dữ liệu, workflow, API hoặc thanh toán; triển khai theo phase để kiểm soát rủi ro.", fit: "Khi cần số hoá vận hành hoặc xây nền tảng có thể mở rộng cho nhiều nhóm người dùng.", timeline: "8 tuần – 6 tháng+", options: [{ label: "Commerce / portal · 8–12 tuần", pricePoint: "commercePortal" }, { label: "SaaS discovery · 2–3 tuần, credit khi build", pricePoint: "saasDiscovery" }, { label: "SaaS MVP · 8–12 tuần", pricePoint: "saasMvp" }, { label: "Multi-tenant SaaS · 3–6 tháng", pricePoint: "saasMultiTenant" }, { label: "Advanced platform · theo proposal", pricePoint: "advanced" }], examples: ["Auth, roles và database", "Backend/API và integrations", "Staging, production và handover"] },
    },
    addOnsLabel: "Tuỳ chọn mở rộng",
    addOnsHeading: "Thêm đúng phần cần thiết, không phình phạm vi.",
    addOnsIntro: "Các hạng mục dưới đây có thể thêm vào bất kỳ hướng hợp tác nào. Báo giá được tách riêng để bạn dễ ưu tiên và kiểm soát ngân sách.",
    addOns: [
      { title: "Tư vấn website & product scope", body: "Rà soát website hiện tại, mục tiêu kinh doanh, hành trình khách hàng, kiến trúc thông tin và roadmap ưu tiên.", price: "Theo workshop hoặc audit" },
      { title: "Nội dung & hình ảnh", body: "Biên soạn nội dung trang, chỉnh sửa tiếng Việt/Anh, art direction và bộ ảnh minh hoạ AI hoặc stock.", price: "Theo số trang / khối lượng" },
      { title: "Performance, SEO & GEO", body: "Core Web Vitals, keyword map, metadata, schema, internal links, sitemap, Search Console và local intent.", price: "Theo audit + triển khai" },
      { title: "Security & hạ tầng SME", body: "Hardening, backup, Cloudflare, domain/DNS, monitoring, business email và tài khoản vận hành an toàn.", price: "Theo hệ thống / số tài khoản" },
      { title: "Module nhân sự & vận hành", body: "Phân quyền, nhân sự, chấm công, lịch, biểu mẫu, phê duyệt, dashboard và báo cáo nội bộ.", price: "Theo module hoặc phase" },
      { title: "Tích hợp & phát triển tiếp", body: "Thanh toán, CRM, email automation, Telegram, AI, data migration, API và hỗ trợ sau bàn giao.", price: "Care 3,5m · Growth 7,5m · Product 15–30m VND / tháng" },
    ],
    proofLabel: "Dự án tiêu biểu",
    proofHeading: "Mỗi phạm vi đều gắn với một dự án thật.",
    proofIntro: "Xem cách TUNG biến một bài toán cụ thể thành sản phẩm rõ ràng, hữu ích và sẵn sàng để phát triển tiếp.",
    proofItems: [
      { label: "F&B", title: "LogiVN", body: "Sản phẩm kết nối gọi món, bếp, bàn, kho, thanh toán và đội ngũ trong một trải nghiệm thống nhất.", href: "/work/logivn", linkLabel: "Xem dự án" },
      { label: "BÓNG ĐÁ", title: "Fball.vn", body: "Nền tảng giúp đội bóng quản lý lịch, điểm danh, đội hình, thành viên, tài chính và tìm trận.", href: "/work/fball", linkLabel: "Xem dự án" },
      { label: "NỀN TẢNG", title: "TUNG platform", body: "Website đa ngôn ngữ được thiết kế để truyền tải rõ ràng, tải nhanh và dễ tiếp tục phát triển.", href: "/about", linkLabel: "Xem cách làm việc" },
    ],
    proposalLabel: "Một proposal rõ phải có",
    proposalHeading: "Giá chỉ có ý nghĩa khi trách nhiệm cũng rõ.",
    proposalItems: [
      { title: "Outcome & acceptance", body: "Kết quả cần đạt, cách review và điều kiện nghiệm thu." },
      { title: "Phạm vi và mốc bàn giao", body: "Đầu ra, phụ thuộc, mốc quyết định và phần chưa nằm trong dự án." },
      { title: "Quyền sở hữu và bàn giao", body: "Quyền sở hữu, mã nguồn, tài liệu, quyền truy cập và cách bàn giao." },
      { title: "Chi phí và bàn giao", body: "Tiền tệ, thuế, phí bên thứ ba, lịch thanh toán và phần việc sau khi bàn giao." },
    ],
    processLabel: "Quy trình",
    processHeading: "Từ câu hỏi đúng đến sản phẩm sẵn sàng để dùng.",
    process: [
      { title: "Định nghĩa bài toán", body: "Làm rõ mục tiêu, người dùng, cách làm việc hiện tại, giới hạn và tiêu chí thành công." },
      { title: "Thiết kế hệ thống", body: "Chốt cấu trúc thông tin, hành trình, định hướng hình ảnh và ranh giới dữ liệu trước khi xây dựng sâu." },
      { title: "Xây và hoàn thiện", body: "Triển khai theo từng phần dễ xem, dùng nội dung thật và thiết bị thật để hoàn thiện hành vi, tốc độ và accessibility." },
      { title: "Đưa vào sử dụng & bàn giao", body: "Đưa sản phẩm lên môi trường sử dụng, kiểm tra những điểm quan trọng rồi bàn giao tài liệu và quyền truy cập." },
    ],
    scopeLabel: "Ranh giới phạm vi",
    scopeHeading: "Nói rõ chi phí trước khi bắt đầu thay đổi hệ thống.",
    includedLabel: "Được xác định trong proposal",
    included: ["Đầu ra và số vòng review", "Yêu cầu kỹ thuật, trình duyệt và thiết bị", "Tích hợp, chuyển dữ liệu và dữ liệu đầu vào", "Đưa sản phẩm lên sử dụng và tiêu chí nghiệm thu", "Tài liệu, quyền truy cập và bàn giao"],
    outsideLabel: "Chỉ bao gồm khi được ghi rõ",
    outside: ["Domain, hosting, SaaS, license và phí dịch vụ bên ngoài", "Copywriting, photography, video và translation", "Paid media, campaign hoặc SEO ranking", "Legal review, chứng nhận tuân thủ và tư vấn thuế", "Bảo trì dài hạn hoặc cam kết phản hồi liên tục"],
    faqLabel: "Câu hỏi thường gặp",
    faqHeading: "Những điều nên rõ trước khi gửi brief.",
    faqs: [
      { question: "Mức ngân sách trên có phải giá cố định không?", answer: "Không. Đây là mốc để xác định quy mô trao đổi. Cùng một loại website nhưng content, CMS, integration, permission, migration và điều kiện launch khác nhau sẽ tạo ra phạm vi khác nhau. Giá chính thức nằm trong proposal." },
      { question: "Chỉ làm một landing page có được không?", answer: "Có. Khi mục tiêu, đối tượng, nội dung và hành trình hành động đủ rõ, landing page có thể là một phạm vi độc lập. Công việc vẫn bao gồm cấu trúc thông tin, định hướng hình ảnh, giao diện trên mọi thiết bị và chất lượng hoàn thiện — không chỉ thay nội dung vào template." },
      { question: "Có thể bắt đầu chỉ bằng tư vấn hoặc technical review không?", answer: "Có. Advisory có thể là engagement độc lập. Kết quả có thể được đội nội bộ triển khai hoặc dùng làm nền cho giai đoạn thiết kế và phát triển tiếp theo với TUNG." },
      { question: "Khách global thanh toán bằng tiền tệ nào?", answer: "Giá quy đổi theo ngôn ngữ chỉ giúp so sánh quy mô. Tiền tệ hợp đồng, thuế, phương thức chuyển và payment milestones được xác nhận theo dự án và chủ thể ký kết trong proposal." },
      { question: "Khi nào timeline và lịch thanh toán được chốt?", answer: "Sau khi deliverables chính, người review và external dependencies đủ rõ. Proposal sẽ ghi phases, decision points, acceptance và payment milestones trước khi công việc bắt đầu." },
    ],
    ctaLabel: "START A CONVERSATION",
    ctaHeading: "Brief chưa hoàn chỉnh vẫn có thể bắt đầu bằng một vấn đề thật.",
    ctaBody: "Gửi điều bạn đang muốn xây, ai sẽ sử dụng, chỗ đang bị kẹt và khoảng ngân sách. Bước đầu tiên là tìm phạm vi đáng làm và quyết định tiếp theo cần được làm rõ.",
    ctaPrimary: "Trao đổi dự án",
    ctaSecondary: "Xem dự án đã thực hiện",
    responseNote: "Mục tiêu phản hồi: trong khoảng 2 ngày làm việc",
  },
  en: {
    navLabel: "Services & pricing",
    metaTitle: "Services and project investment — TUNG",
    metaDescription: "Website design and development for small and mid-sized businesses — from focused frontend landing pages to business websites, custom backends and SaaS products.",
    label: "SERVICES / INVESTMENT",
    headingLead: "A better website starts with",
    headingEmphasis: "a clear business problem.",
    intro: "TUNG designs and builds for small and mid-sized businesses: focused frontend launches, credible company websites, and custom backends or SaaS products with real workflows. You get a fast, clear system that can keep growing after launch.",
    facts: [
      { label: "From", value: "Frontend landing page → SaaS backend" },
      { label: "For", value: "SMEs, product teams and founders" },
      { label: "Engagement", value: "Clear proposal · milestones · handover" },
    ],
    servicesLabel: "Core services",
    servicesHeading: "Choose the right level of complexity for the stage you are in.",
    servicesIntro: "These three engagement types cover the most common needs of a growing business. Start focused, prove the direction, then extend the same foundation without rebuilding from scratch.",
    services: [
      { label: "01 / FRONTEND", title: "Landing page & frontend launch", summary: "A focused landing page or microsite built around one message, fast loading and a clear conversion path — custom designed, responsive and ready for campaigns.", fit: "Best when you need to launch a service, product or campaign with a sharp experience in a short cycle.", engagement: "A bounded scope with content decisions made early and one or two delivery milestones.", deliverables: ["Message and page structure", "Art direction and responsive UI", "Interactions, forms and basic tracking", "Performance, technical SEO and accessibility", "Deploy, editing guide and handover"] },
      { label: "02 / BUSINESS WEBSITE", title: "A business website that earns trust", summary: "A multi-page SME website where positioning, services, case studies, blog, careers and lead capture work as one maintainable content system.", fit: "Best when the site must help prospects understand, trust and contact you — not merely act as an online brochure.", engagement: "End-to-end delivery through a proposal and milestones, with CMS or integrations where useful.", deliverables: ["Positioning, sitemap and content plan", "Visual system and responsive frontend", "CMS, blog, forms and analytics", "On-page SEO, schema and redirect plan", "Performance, launch, training and handover"] },
      { label: "03 / CUSTOM SAAS", title: "Custom web app, backend & SaaS", summary: "A web product with accounts, roles, data, workflows, payments or APIs — from backend architecture to the operational interface people use every day.", fit: "Best when you are digitising operations or building a platform that must support several user groups over time.", engagement: "A short discovery phase followed by phased delivery with staging, acceptance and a next-step roadmap.", deliverables: ["Product scope, user roles and data model", "Responsive frontend and design system", "Backend, auth, database, APIs and integrations", "Logging, security baseline, deploy and monitoring", "Technical docs, training and handover"] },
    ],
    budgetLabel: "Indicative pricing",
    budgetHeading: "Three clear bands for the right level of investment.",
    budgetIntro: "These are planning ranges for common SME projects, not boxed packages. The final scope reflects content, page count, integrations, data, operating requirements and acceptance criteria.",
    budgetImageAlt: "Layered scope illustration progressing from a landing page to a business website and SaaS platform",
    budgetFitLabel: "Best when",
    budgetTimelineLabel: "Typical timeline",
    budgetIncludedLabel: "Usually includes",
    budgetFeaturedLabel: "Most requested",
    budgetBands: {
      focused: { label: "01 / FRONTEND STARTER", title: "Focused landing page", description: "A landing page or microsite with a clear message, custom UI, responsive implementation and a conversion-ready launch.", fit: "For launching quickly to test a market, capture leads or introduce a new service.", timeline: "1–2 weeks", options: [{ label: "Launch landing page · 1–2 weeks", pricePoint: "landing" }], examples: ["1–3 focused pages", "Forms and basic analytics", "Technical SEO and deploy"] },
      build: { label: "02 / SME WEBSITE", title: "Business website", description: "A multi-page company website with CMS/blog, case studies, forms and an SEO foundation your team can operate.", fit: "For a site that earns trust, creates enquiries and supports sales over time.", timeline: "3–8 weeks", options: [{ label: "Business lead-gen · 3–5 weeks", pricePoint: "businessLeadGen" }, { label: "Growth / corporate · 5–8 weeks", pricePoint: "businessGrowth" }], examples: ["5–12 content pages", "CMS, blog and lead forms", "On-page SEO, schema and training"], featured: true },
      platform: { label: "03 / CUSTOM SAAS", title: "Web app & SaaS", description: "A web product with accounts, permissions, data, workflows, APIs or payments delivered in phases to control risk.", fit: "For digitising operations or building a platform that can scale to multiple user groups.", timeline: "8 weeks – 6+ months", options: [{ label: "Commerce / portal · 8–12 weeks", pricePoint: "commercePortal" }, { label: "SaaS discovery · 2–3 weeks, credited if built", pricePoint: "saasDiscovery" }, { label: "SaaS MVP · 8–12 weeks", pricePoint: "saasMvp" }, { label: "Multi-tenant SaaS · 3–6 months", pricePoint: "saasMultiTenant" }, { label: "Advanced platform · proposal", pricePoint: "advanced" }], examples: ["Auth, roles and database", "Backend/API and integrations", "Staging, production and handover"] },
    },
    addOnsLabel: "Optional extensions",
    addOnsHeading: "Add what the project needs, without hiding the cost.",
    addOnsIntro: "These options can be added to any engagement. Each is priced separately so you can prioritise the next useful increment.",
    addOns: [
      { title: "Website & product consulting", body: "Review the current site, business goals, customer journey, information architecture and a prioritised roadmap.", price: "Workshop or audit" },
      { title: "Content & visual direction", body: "Page copy, Vietnamese/English editing, art direction and an AI or stock image set for launch.", price: "By page / volume" },
      { title: "Performance, SEO & GEO", body: "Core Web Vitals, keyword map, metadata, schema, internal links, sitemap, Search Console and local intent.", price: "Audit + implementation" },
      { title: "Security & SME infrastructure", body: "Hardening, backups, Cloudflare, domain/DNS, monitoring, business email and secure operating accounts.", price: "By system / account count" },
      { title: "HR & operations modules", body: "Roles, staff records, attendance, schedules, forms, approvals, dashboards and internal reporting.", price: "By module or phase" },
      { title: "Integrations & continued delivery", body: "Payments, CRM, email automation, Telegram, AI, data migration, APIs and post-launch support.", price: "Care 3.5m · Growth 7.5m · Product 15–30m VND / month" },
    ],
    proofLabel: "Selected projects",
    proofHeading: "Every scope connects to real work.",
    proofIntro: "See how TUNG turns a specific problem into a clear, useful product with room to grow.",
    proofItems: [
      { label: "F&B", title: "LogiVN", body: "A product connecting QR ordering, kitchen, tables, inventory, payments and teams in one experience.", href: "/work/logivn", linkLabel: "View project" },
      { label: "FOOTBALL", title: "Fball.vn", body: "A platform for schedules, attendance, line-ups, members, team funds and finding matches.", href: "/work/fball", linkLabel: "View project" },
      { label: "PLATFORM", title: "TUNG platform", body: "A multilingual website designed for clear communication, fast loading and future growth.", href: "/about", linkLabel: "See how I work" },
    ],
    proposalLabel: "Every proposal defines",
    proposalHeading: "Price is useful only when responsibility is equally clear.",
    proposalItems: [
      { title: "Outcome & acceptance", body: "The intended result, review method and acceptance conditions." },
      { title: "Scope & milestones", body: "Deliverables, dependencies, decision points and what remains outside the project." },
      { title: "Ownership & handover", body: "IP, repositories, documentation, access and the handover path." },
      { title: "Commercial terms", body: "Currency, tax, third-party costs, payment schedule and support after handover." },
    ],
    processLabel: "Process",
    processHeading: "From the right question to a product ready to use.",
    process: [
      { title: "Define the problem", body: "Clarify the objective, users, current workflow, constraints and success conditions." },
      { title: "Design the system", body: "Align information architecture, flows, visual direction and data/service boundaries before deep implementation." },
      { title: "Build & refine", body: "Deliver reviewable increments and refine behaviour, responsiveness, performance and accessibility with real content and devices." },
      { title: "Launch & hand over", body: "Launch the product, check the important paths and transfer documentation and access." },
    ],
    scopeLabel: "Scope boundaries",
    scopeHeading: "Make the commercial edge visible before changing the system.",
    includedLabel: "Defined in the proposal",
    included: ["Deliverables and review rounds", "Technical, browser and device requirements", "Integrations, migration and source data", "Launch and acceptance criteria", "Documentation, access and handover"],
    outsideLabel: "Included only when explicit",
    outside: ["Domains, hosting, SaaS, licences and third-party fees", "Copywriting, photography, video and translation", "Paid media, campaigns or SEO rankings", "Legal review, compliance certification and tax advice", "Long-term maintenance or ongoing response commitments"],
    faqLabel: "Frequently asked",
    faqHeading: "What should be clear before sending a brief.",
    faqs: [
      { question: "Are these fixed prices?", answer: "No. They are planning bands for discussing scale. Content volume, CMS, integrations, permissions, migration and launch requirements can make two similar-looking websites materially different. The formal price lives in the proposal." },
      { question: "Can I commission only a landing page?", answer: "Yes. When the objective, audience, content and action path are clear, a landing page can be a focused scope. The work still covers information structure, visual direction, responsive design and a polished finish — not simply replacing text in a template." },
      { question: "Can we start with advisory or a technical review only?", answer: "Yes. Advisory can stand alone. Your internal team can use the output, or it can become the foundation for a later design and development phase with TUNG." },
      { question: "Which currency do global clients pay in?", answer: "Locale conversions are shown only to compare scale. Contract currency, tax, transfer method and payment milestones are confirmed for the project and contracting party in the proposal." },
      { question: "When are timeline and payment milestones set?", answer: "Once the primary deliverables, reviewers and external dependencies are sufficiently clear. The proposal then records phases, decision points, acceptance and payment milestones before work starts." },
    ],
    ctaLabel: "START A CONVERSATION",
    ctaHeading: "An unfinished brief can still begin with a real problem.",
    ctaBody: "Share what you want to build, who will use it, where the work is stuck and the rough budget. The first step is identifying a worthwhile boundary and the next decision that needs clarity.",
    ctaPrimary: "Discuss a project",
    ctaSecondary: "View selected work",
    responseNote: "Response target: within about two working days",
  },
  ja: {
    navLabel: "サービス・料金",
    metaTitle: "サービスとプロジェクト投資 — TUNG",
    metaDescription: "中小企業向けのWebサイト設計・開発。フロントエンドのランディングページから企業サイト、カスタムバックエンド、SaaSまで対応します。",
    label: "SERVICES / INVESTMENT",
    headingLead: "良いWebサイトは、",
    headingEmphasis: "明確な事業課題から始まる。",
    intro: "TUNGは中小企業向けに、短期間で公開するフロントエンド、信頼をつくる企業サイト、業務フローを支えるバックエンド／SaaSを設計・開発します。公開後も育てられる、速くて明快な仕組みをお渡しします。",
    facts: [{ label: "対応範囲", value: "LPフロントエンド → SaaSバックエンド" }, { label: "対象", value: "中小企業・プロダクトチーム・創業者" }, { label: "進め方", value: "明確な提案・マイルストーン・引き継ぎ" }],
    servicesLabel: "コアサービス",
    servicesHeading: "事業の段階に合う複雑さを選ぶ。",
    servicesIntro: "成長中の企業によくあるニーズを三つに整理しています。小さく始めて方向性を確認し、同じ基盤を活かしながら段階的に拡張できます。",
    services: [
      { label: "01 / FRONTEND", title: "ランディングページ／フロントエンド", summary: "一つのメッセージ、表示速度、コンバージョンに集中したLPまたはマイクロサイト。独自デザイン、レスポンシブ対応でキャンペーンに使える状態まで仕上げます。", fit: "新サービス、商品、キャンペーンを短期間で質高く公開したい場合に向いています。", engagement: "コンテンツを早期に決め、一〜二つのマイルストーンで進める限定スコープ。", deliverables: ["メッセージとページ構成", "アートディレクションとレスポンシブUI", "動き、フォーム、基本計測", "速度、テクニカルSEO、アクセシビリティ", "公開、更新ガイド、引き継ぎ"] },
      { label: "02 / BUSINESS WEBSITE", title: "信頼をつくる企業Webサイト", summary: "会社の強み、サービス、事例、ブログ、採用、問い合わせを、一つの管理しやすいコンテンツシステムにまとめます。", fit: "オンライン名刺ではなく、見込み客の理解・信頼・問い合わせにつながるサイトが必要な場合に向いています。", engagement: "提案書とマイルストーンに基づく一貫開発。必要に応じてCMSや外部連携を含みます。", deliverables: ["ポジショニング、サイトマップ、コンテンツ計画", "ビジュアルシステムとレスポンシブ実装", "CMS、ブログ、フォーム、解析", "オンページSEO、schema、redirect計画", "速度、公開、トレーニング、引き継ぎ"] },
      { label: "03 / CUSTOM SAAS", title: "カスタムWebアプリ／バックエンド／SaaS", summary: "アカウント、権限、データ、業務フロー、決済、APIを含むWebプロダクトを、バックエンド設計から日常的に使う画面まで構築します。", fit: "業務をデジタル化する、または複数の利用者グループを支えるSaaSをつくる場合に向いています。", engagement: "短いディスカバリーの後、検証環境、受入条件、次のロードマップを含む段階開発。", deliverables: ["プロダクト範囲、利用者権限、データ設計", "レスポンシブUIとデザインシステム", "バックエンド、認証、DB、API、連携", "記録、安全性、公開、監視", "技術文書、トレーニング、引き継ぎ"] },
    ],
    budgetLabel: "参考価格",
    budgetHeading: "適切な投資規模を選ぶための三つの目安。",
    budgetIntro: "中小企業でよくある案件の計画用レンジで、固定パッケージではありません。コンテンツ量、ページ数、外部連携、データ、運用要件、受入条件に基づき最終範囲を決めます。",
    budgetImageAlt: "ランディングページから企業サイト、SaaSへ段階的に広がる開発範囲のイラスト",
    budgetFitLabel: "向いている場合",
    budgetTimelineLabel: "一般的な期間",
    budgetIncludedLabel: "通常含まれるもの",
    budgetFeaturedLabel: "最も多いご相談",
    budgetBands: {
      focused: { label: "01 / FRONTEND STARTER", title: "フォーカスLP", description: "明確なメッセージ、独自UI、レスポンシブ実装、コンバージョン導線を備えたLPまたはマイクロサイト。", fit: "市場検証、見込み客獲得、新サービス紹介のために早く公開したい場合。", timeline: "1〜2週間", options: [{ label: "Launch landing page · 1〜2週間", pricePoint: "landing" }], examples: ["重点1〜3ページ", "フォームと基本解析", "テクニカルSEOと公開"] },
      build: { label: "02 / SME WEBSITE", title: "企業Webサイト", description: "CMS／ブログ、事例、フォーム、SEO基盤を備え、社内で運用できる複数ページの企業サイト。", fit: "信頼を高め、問い合わせをつくり、営業を長期的に支えるサイトが必要な場合。", timeline: "3〜8週間", options: [{ label: "Business lead-gen · 3〜5週間", pricePoint: "businessLeadGen" }, { label: "Growth / corporate · 5〜8週間", pricePoint: "businessGrowth" }], examples: ["5〜12ページ", "CMS、ブログ、問い合わせフォーム", "オンページSEO、schema、操作説明"], featured: true },
      platform: { label: "03 / CUSTOM SAAS", title: "Webアプリ／SaaS", description: "アカウント、権限、データ、業務フロー、API、決済を含むWebプロダクトを段階的に開発します。", fit: "業務をデジタル化する、または複数利用者に拡張できるプラットフォームをつくる場合。", timeline: "8週間〜6か月以上", options: [{ label: "Commerce / portal · 8〜12週間", pricePoint: "commercePortal" }, { label: "SaaS discovery · 2〜3週間、build時に充当", pricePoint: "saasDiscovery" }, { label: "SaaS MVP · 8〜12週間", pricePoint: "saasMvp" }, { label: "Multi-tenant SaaS · 3〜6か月", pricePoint: "saasMultiTenant" }, { label: "Advanced platform · 提案書", pricePoint: "advanced" }], examples: ["認証、権限、データベース", "バックエンド／APIと外部連携", "検証環境、本番公開、引き継ぎ"] },
    },
    addOnsLabel: "オプション",
    addOnsHeading: "必要なものだけを、費用を隠さず追加する。",
    addOnsIntro: "どの契約にも追加できます。優先順位と予算を管理しやすいよう、項目ごとに別途お見積りします。",
    addOns: [
      { title: "Webサイト／プロダクト相談", body: "現行サイト、事業目標、顧客導線、情報設計を確認し、優先ロードマップを作成します。", price: "workshopまたは監査" },
      { title: "コンテンツとビジュアル", body: "ページ原稿、ベトナム語／英語編集、アートディレクション、AIまたはストック画像。", price: "ページ数／量" },
      { title: "速度・SEO・GEO", body: "Core Web Vitals、キーワード、metadata、schema、内部リンク、sitemap、Search Console、地域検索。", price: "監査＋実装" },
      { title: "セキュリティと中小企業向け基盤", body: "hardening、backup、Cloudflare、domain／DNS、監視、business email、安全な運用アカウント。", price: "システム／アカウント数" },
      { title: "人事・業務モジュール", body: "権限、従業員情報、勤怠、予定、申請、承認、dashboard、社内レポート。", price: "moduleまたはphase" },
      { title: "連携と継続開発", body: "決済、CRM、メール自動化、Telegram、AI、データ移行、API、公開後サポート。", price: "Care 350万 · Growth 750万 · Product 1,500〜3,000万 VND / 月" },
    ],
    proofLabel: "実績の根拠",
    proofHeading: "確認できる仕事と投資を結びつける。",
    proofIntro: "未検証のmarketing指標は使いません。product framingからarchitecture、implementation、productionまでの流れを示します。",
    proofItems: [
      { label: "F&B OPERATIONS", title: "LogiVN", body: "QR注文、厨房、テーブル、在庫、決済、運用workspaceをつなぐmulti-tenant product。", href: "/work/logivn", linkLabel: "case studyを見る" },
      { label: "CLUB OPERATIONS", title: "Fball.vn", body: "日程、出欠、line-up、member role、資金、公開discoveryを扱うクラブ運用system。", href: "/work/fball", linkLabel: "case studyを見る" },
      { label: "DELIVERY SYSTEM", title: "TUNG platform", body: "AstroとCloudflare Workersで構築した多言語platform。D1、R2、auth、content operation、検証付きdeployを統合。", href: "/about", linkLabel: "仕事の進め方を見る" },
    ],
    proposalLabel: "提案書で定義すること",
    proposalHeading: "責任範囲が明確であってこそ、価格に意味がある。",
    proposalItems: [{ title: "Outcome & acceptance", body: "目指す結果、review方法、受入条件。" }, { title: "Scope & milestones", body: "成果物、依存関係、decision point、対象外。" }, { title: "Ownership & handover", body: "IP、repository、文書、access、引き継ぎ経路。" }, { title: "Commercial boundaries", body: "通貨、税、第三者費用、支払日程、公開後の運用。" }],
    processLabel: "プロセス",
    processHeading: "正しい問いから、運用できるreleaseまで。",
    process: [{ title: "課題を定義する", body: "目的、利用者、現在のworkflow、制約、成功条件を確認します。" }, { title: "システムを設計する", body: "情報設計、flow、visual direction、data/service boundaryを実装前に揃えます。" }, { title: "構築して検証する", body: "確認可能な単位で実装し、実コンテンツと端末で動作、responsive、performance、accessibilityを検証します。" }, { title: "公開して引き継ぐ", body: "productionへdeployし、routeとmonitoringを確認して、文書と継続観察項目を引き継ぎます。" }],
    scopeLabel: "スコープ境界",
    scopeHeading: "システムを変える前に、費用の境界を明確にする。",
    includedLabel: "提案書で定義",
    included: ["成果物とreview回数", "技術・browser・device要件", "外部連携、migration、入力data", "production deployと受入条件", "文書、access、handover"],
    outsideLabel: "明記した場合のみ含む",
    outside: ["domain、hosting、SaaS、license、provider費用", "copywriting、写真、映像、翻訳", "paid media、campaign運用、SEO順位", "法務確認、compliance認証、税務助言", "継続保守、SLA、長期product operation"],
    faqLabel: "よくある質問",
    faqHeading: "briefを送る前に明確にしたいこと。",
    faqs: [
      { question: "表示金額は固定価格ですか？", answer: "いいえ。規模を話すための目安です。同じ種類のWebサイトでも、content量、CMS、外部連携、権限、migration、公開条件によって必要な仕事は変わります。正式金額は提案書で確定します。" },
      { question: "landing pageだけでも依頼できますか？", answer: "はい。目的、対象者、content、action pathが明確ならfocused scopeとして進められます。templateへの差し替えだけでなく、情報構造、visual direction、responsive実装、production品質まで扱います。" },
      { question: "相談や技術reviewだけで始められますか？", answer: "はい。advisoryは独立して実施できます。成果を社内teamで使うことも、次の設計・開発段階をTUNGに依頼することもできます。" },
      { question: "VND以外の通貨で支払えますか？", answer: "言語別換算は規模比較の参考です。契約通貨、税、送金方法、payment milestoneはprojectと契約主体に応じて提案書で確定します。" },
      { question: "timelineと支払日程はいつ決まりますか？", answer: "主要成果物、review担当者、外部依存関係が十分明確になった段階です。開始前にphase、decision point、受入、payment milestoneを提案書に記載します。" },
    ],
    ctaLabel: "START A CONVERSATION",
    ctaHeading: "要件が固まる前でも、実際の課題から始められる。",
    ctaBody: "つくりたいもの、利用者、現在止まっている場所、予算目安を送ってください。最初に、進める価値のある範囲と次に明確にすべき判断を整理します。",
    ctaPrimary: "プロジェクトを相談する",
    ctaSecondary: "これまでの仕事を見る",
    responseNote: "返信目安：2営業日以内",
  },
  zh: {
    navLabel: "服务与价格",
    metaTitle: "服务与项目投入 — TUNG",
    metaDescription: "面向中小企业的网站设计与开发：从专注前端的落地页，到企业官网、定制后端与SaaS产品。",
    label: "SERVICES / INVESTMENT",
    headingLead: "更好的网站始于",
    headingEmphasis: "一个清晰的商业问题。",
    intro: "TUNG为中小企业设计和开发网站：从快速上线的前端页面、建立信任的企业官网，到包含真实业务流程的后端和SaaS。你将获得一个快速、清晰，并能在上线后继续成长的系统。",
    facts: [{ label: "从", value: "前端落地页 → SaaS后端" }, { label: "面向", value: "中小企业、产品团队与创始人" }, { label: "合作", value: "清晰方案 · 里程碑 · 交接" }],
    servicesLabel: "核心服务",
    servicesHeading: "为企业当前阶段选择合适的复杂度。",
    servicesIntro: "以下三种合作覆盖成长型企业最常见的需求。可以从小范围开始验证方向，再沿用同一基础继续扩展，无需从头重做。",
    services: [
      { label: "01 / FRONTEND", title: "落地页与前端上线", summary: "围绕一个核心信息、加载速度和转化路径打造落地页或微型网站，提供定制设计、响应式实现并可直接用于推广。", fit: "适合在较短周期内高质量发布新服务、产品或营销活动。", engagement: "边界明确，尽早确认内容，通过一到两个里程碑交付。", deliverables: ["核心信息与页面结构", "视觉方向与响应式UI", "交互、表单与基础数据追踪", "速度、技术SEO与无障碍", "上线、编辑指南与交接"] },
      { label: "02 / BUSINESS WEBSITE", title: "建立信任的企业官网", summary: "把企业定位、服务、案例、博客、招聘和线索收集整理成一个易于维护的多页面内容系统。", fit: "适合需要帮助潜在客户理解、信任并联系企业的网站，而不只是线上宣传册。", engagement: "按正式方案和里程碑端到端推进，并根据需要加入CMS或系统集成。", deliverables: ["定位、sitemap与内容计划", "视觉系统与响应式前端", "CMS、博客、表单与analytics", "站内SEO、schema与redirect计划", "性能、上线、培训与交接"] },
      { label: "03 / CUSTOM SAAS", title: "定制Web应用、后端与SaaS", summary: "构建包含账号、角色、数据、业务流程、支付或API的Web产品，从后端架构到团队每天使用的操作界面。", fit: "适合数字化内部运营，或建设需要长期支持多类用户的平台。", engagement: "短期需求探索后分阶段交付，包含测试环境、验收和下一阶段路线图。", deliverables: ["产品范围、用户角色与数据结构", "响应式前端与设计系统", "后端、认证、数据库、API与集成", "运行记录、安全基线、部署与监控", "技术文档、培训与交接"] },
    ],
    budgetLabel: "参考价格",
    budgetHeading: "三个清晰区间，用于匹配合适的投入。",
    budgetIntro: "这是中小企业常见项目的规划区间，并非固定套餐。最终范围会根据内容量、页面数、系统集成、数据、运营要求与验收标准确定。",
    budgetImageAlt: "从落地页到企业官网和SaaS平台逐层扩展的项目范围插图",
    budgetFitLabel: "适合情况",
    budgetTimelineLabel: "常见周期",
    budgetIncludedLabel: "通常包括",
    budgetFeaturedLabel: "最常选择",
    budgetBands: {
      focused: { label: "01 / FRONTEND STARTER", title: "专注型落地页", description: "包含清晰信息、定制UI、响应式实现和转化路径的落地页或微型网站。", fit: "适合快速验证市场、获取线索或介绍一项新服务。", timeline: "1–2周", options: [{ label: "Launch landing page · 1–2周", pricePoint: "landing" }], examples: ["1–3个重点页面", "表单与基础analytics", "技术SEO与上线"] },
      build: { label: "02 / SME WEBSITE", title: "企业官网", description: "包含CMS／博客、案例、表单和SEO基础，可由团队自行运营的多页面企业网站。", fit: "适合需要建立信任、获得咨询并长期支持销售的网站。", timeline: "3–8周", options: [{ label: "Business lead-gen · 3–5周", pricePoint: "businessLeadGen" }, { label: "Growth / corporate · 5–8周", pricePoint: "businessGrowth" }], examples: ["5–12个内容页面", "CMS、博客与线索表单", "站内SEO、schema与培训"], featured: true },
      platform: { label: "03 / CUSTOM SAAS", title: "Web应用与SaaS", description: "包含账号、权限、数据、业务流程、API或支付的Web产品，通过分阶段开发控制风险。", fit: "适合数字化运营或构建能够扩展到多类用户的平台。", timeline: "8周–6个月以上", options: [{ label: "Commerce / portal · 8–12周", pricePoint: "commercePortal" }, { label: "SaaS discovery · 2–3周，开发可抵扣", pricePoint: "saasDiscovery" }, { label: "SaaS MVP · 8–12周", pricePoint: "saasMvp" }, { label: "Multi-tenant SaaS · 3–6个月", pricePoint: "saasMultiTenant" }, { label: "Advanced platform · 正式方案", pricePoint: "advanced" }], examples: ["认证、角色与数据库", "后端／API与系统集成", "测试环境、正式上线与交接"] },
    },
    addOnsLabel: "可选扩展",
    addOnsHeading: "只增加项目真正需要的部分，并明确费用。",
    addOnsIntro: "这些选项可以加入任何合作范围，并单独报价，便于确定优先级和控制预算。",
    addOns: [
      { title: "网站与产品咨询", body: "评估现有网站、商业目标、客户路径与信息架构，并制定优先路线图。", price: "按workshop或审计" },
      { title: "内容与视觉方向", body: "页面文案、越南语／英语编辑、视觉指导，以及AI或图库图片。", price: "按页面／工作量" },
      { title: "性能、SEO与GEO", body: "Core Web Vitals、关键词、metadata、schema、内部链接、sitemap、Search Console与本地意图。", price: "按审计＋实施" },
      { title: "安全与中小企业基础设施", body: "hardening、备份、Cloudflare、domain／DNS、监控、企业邮箱与安全运营账号。", price: "按系统／账号数量" },
      { title: "人事与运营模块", body: "权限、员工资料、考勤、排班、表单、审批、dashboard与内部报表。", price: "按module或phase" },
      { title: "系统集成与持续开发", body: "支付、CRM、邮件自动化、Telegram、AI、数据迁移、API与上线后支持。", price: "Care 350万 · Growth 750万 · Product 1,500–3,000万 VND / 月" },
    ],
    proofLabel: "能力证据",
    proofHeading: "让投入与可检查的工作相连。",
    proofIntro: "不使用未经验证的marketing指标。以下案例展示从product framing到architecture、implementation和production的完整路径。",
    proofItems: [
      { label: "F&B OPERATIONS", title: "LogiVN", body: "连接QR点单、厨房、桌台、库存、支付和运营workspace的multi-tenant product。", href: "/work/logivn", linkLabel: "查看案例" },
      { label: "CLUB OPERATIONS", title: "Fball.vn", body: "覆盖日程、出勤、阵容、member role、财务和public discovery的俱乐部运营system。", href: "/work/fball", linkLabel: "查看案例" },
      { label: "DELIVERY SYSTEM", title: "TUNG platform", body: "基于Astro与Cloudflare Workers的多语言platform，集成D1、R2、auth、内容运营和经过验证的deploy。", href: "/about", linkLabel: "查看工作方式" },
    ],
    proposalLabel: "正式方案会定义",
    proposalHeading: "责任边界足够清楚，价格才有意义。",
    proposalItems: [{ title: "Outcome & acceptance", body: "目标结果、review方式与验收条件。" }, { title: "Scope & milestones", body: "交付物、依赖、decision point与项目外范围。" }, { title: "Ownership & handover", body: "IP、repository、文档、access与交接路径。" }, { title: "Commercial boundaries", body: "币种、税费、第三方成本、付款计划与上线后运维。" }],
    processLabel: "流程",
    processHeading: "从正确的问题，到可以运营的release。",
    process: [{ title: "定义问题", body: "确认目标、用户、现有workflow、限制和成功标准。" }, { title: "设计系统", body: "在深入开发前，对齐信息架构、flow、visual direction与data/service boundary。" }, { title: "构建并验证", body: "按可审阅阶段推进，使用真实内容与设备验证行为、响应式、performance和accessibility。" }, { title: "上线与交接", body: "部署production，确认route和monitoring，再交接文档与需要持续观察的事项。" }],
    scopeLabel: "范围边界",
    scopeHeading: "改变系统之前，先把费用边界说清楚。",
    includedLabel: "在正式方案中定义",
    included: ["交付物与review轮次", "技术、browser与device要求", "系统集成、migration与输入data", "production deploy与验收标准", "文档、access与handover"],
    outsideLabel: "仅在明确写入时包含",
    outside: ["domain、hosting、SaaS、license与provider费用", "copywriting、摄影、视频与翻译", "paid media、campaign运营或SEO排名", "法律审核、compliance认证与税务建议", "持续维护、SLA或长期product operation"],
    faqLabel: "常见问题",
    faqHeading: "发送brief前应该明确的事项。",
    faqs: [
      { question: "页面上的金额是固定价格吗？", answer: "不是。这些是讨论规模的规划区间。即使是同类网站，content量、CMS、集成、权限、migration和上线要求不同，所需工作也会不同。正式价格以项目方案为准。" },
      { question: "只做一个landing page可以吗？", answer: "可以。目标、受众、content和action path明确时，可以作为focused scope推进。工作会覆盖信息结构、visual direction、responsive实现和production质量，而不只是替换template文字。" },
      { question: "可以先只做顾问或技术评审吗？", answer: "可以。advisory可以独立进行。内部team可以使用成果，也可以继续由TUNG负责下一阶段的设计与开发。" },
      { question: "全球客户使用什么币种付款？", answer: "按语言显示的换算只用于比较规模。合同币种、税费、转账方式和payment milestone会结合项目与签约主体写入正式方案。" },
      { question: "项目周期和付款节点何时确定？", answer: "主要交付物、review负责人和外部依赖足够明确后。开始前，正式方案会记录phase、decision point、验收与payment milestone。" },
    ],
    ctaLabel: "START A CONVERSATION",
    ctaHeading: "需求还没完全写好，也可以从真实问题开始。",
    ctaBody: "请告诉我你想构建什么、谁会使用、当前卡在哪一步，以及大致预算。第一步是找出值得推进的范围和下一个需要明确的决定。",
    ctaPrimary: "沟通项目",
    ctaSecondary: "查看项目案例",
    responseNote: "预计在2个工作日内回复",
  },
} satisfies Record<Locale, PricingCopy>;

// Keep translated pricing copy focused on outcomes instead of exposing an
// implementation checklist in the public surface.
const polishPricingStrings = <T>(value: T, locale: "ja" | "zh"): T => {
  const replacements = locale === "ja"
    ? [
        ["未検証のmarketing指標は使いません。product framingからarchitecture、implementation、productionまでの流れを示します。", "見栄えの数字ではなく、確認できる仕事を紹介します。"],
        ["公開後の運用", "公開後の改善"], ["production公開", "公開"], ["production品質", "公開品質"],
        ["production環境", "公開環境"], ["production", "公開"], ["runtime", "実行基盤"], ["deploy", "公開"],
        ["service boundary", "責任範囲"], ["security baseline", "安全性の基準"], ["CI/CD", "公開フロー"],
        ["logging", "記録"], ["障害確認経路", "問題を確認する手順"], ["monitoring", "確認"], ["handover", "引き継ぎ"],
        ["repository", "コードと資料"], ["data model", "データ設計"], ["workflow", "業務の流れ"], ["prototype", "試作"],
        ["運用できるrelease", "使える状態"],
      ]
    : [
        ["不使用未经验证的marketing指标。以下案例展示从product framing到architecture、implementation和production的完整路径。", "不依赖夸大的营销数字，以下案例展示真实完成的工作。"],
        ["production上线", "正式上线"], ["production底座", "可靠底座"], ["production环境", "正式环境"], ["production质量", "上线质量"],
        ["production", "上线"], ["runtime", "运行基础"], ["service boundary", "职责边界"], ["security baseline", "安全标准"],
        ["CI/CD", "发布流程"], ["logging", "运行记录"], ["deploy", "发布"], ["monitoring", "观察"], ["handover", "交接"],
        ["repository", "代码与资料"], ["data model", "数据结构"], ["workflow", "工作流程"], ["prototype", "试作"],
        ["可以运营的release", "可以使用的版本"],
      ];
  const clean = (input: unknown): unknown => {
    if (typeof input === "string") return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), input);
    if (Array.isArray(input)) return input.map(clean);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, child]) => [key, clean(child)]));
    return input;
  };
  return clean(value) as T;
};

const pricingCopy = {
  ...pricingCopyBase,
  ja: polishPricingStrings(pricingCopyBase.ja, "ja"),
  zh: polishPricingStrings(pricingCopyBase.zh, "zh"),
} satisfies Record<Locale, PricingCopy>;

export function getPricingCopy(locale: Locale): PricingCopy {
  return pricingCopy[locale];
}
