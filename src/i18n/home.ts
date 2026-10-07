import type { Locale } from "./dictionaries";

export type HomeServiceItem = {
  number: string;
  label: string;
  title: string;
  outcome: string;
  description: string;
  deliverables: string[];
  fit: string;
  evidenceLabel: string;
  evidence: string;
  evidenceHref: string;
  evidenceLink: string;
};

export type HomeServiceCopy = {
  schemaName: string;
  label: string;
  heading: string;
  intro: string;
  items: HomeServiceItem[];
  fitLabel: string;
  visualCaption: string;
  proofLabel: string;
  proof: string[];
  pricingCta: string;
  contactCta: string;
};

const copy: Record<Locale, HomeServiceCopy> = {
  vi: {
    schemaName: "TUNG — Thiết kế website và phát triển SaaS",
    label: "Dịch vụ thiết kế & phát triển",
    heading: "Bắt đầu bằng website đúng nhu cầu. Mở rộng đến backend khi giá trị kinh doanh đòi hỏi.",
    intro: "Không ép mọi dự án vào một template hay một gói cố định. Tôi chọn độ sâu kỹ thuật theo mục tiêu: tư vấn đúng hướng, ra mắt nhanh, cải thiện tốc độ và SEO, bảo vệ hạ tầng, hay biến quy trình riêng thành SaaS.",
    items: [
      {
        number: "01",
        label: "WEBSITE / LANDING PAGE",
        title: "Website khiến khách hàng hiểu và tin bạn.",
        outcome: "Thông điệp rõ, trải nghiệm gọn, đường đi đến liên hệ dễ thấy.",
        description: "Định hình nội dung, cấu trúc trang, visual direction, responsive frontend, accessibility, performance và technical SEO để website sẵn sàng ra mắt.",
        deliverables: ["Landing page chuyển đổi", "Website giới thiệu doanh nghiệp", "Case study và trang dịch vụ", "Performance, analytics & technical SEO"],
        fit: "Doanh nghiệp cần một điểm hiện diện chuyên nghiệp thay cho website cũ, trang tạm hoặc template không còn phản ánh giá trị thật.",
        evidenceLabel: "Bằng chứng giao diện",
        evidence: "LogiVN nối trải nghiệm QR công khai với các bề mặt vận hành responsive trong cùng một sản phẩm.",
        evidenceHref: "/work/logivn",
        evidenceLink: "Xem LogiVN",
      },
      {
        number: "02",
        label: "CMS / TÍCH HỢP",
        title: "Website trở thành một phần của quy trình bán hàng.",
        outcome: "Đội ngũ tự cập nhật nội dung, nhận lead và kết nối đúng công cụ.",
        description: "Thiết kế CMS, form, khu vực thành viên và tích hợp CRM, email doanh nghiệp, booking, thanh toán hoặc API khi website cần làm nhiều hơn việc trình bày.",
        deliverables: ["CMS và content model", "Form, lead routing, email doanh nghiệp", "Booking, CRM hoặc thanh toán", "Quyền chỉnh sửa và hướng dẫn bàn giao"],
        fit: "Website đã có traffic hoặc dữ liệu vận hành, nhưng đội ngũ vẫn phải copy-paste và kiểm tra thủ công giữa nhiều công cụ.",
        evidenceLabel: "Bằng chứng mô-đun",
        evidence: "Fball.vn cho thấy workspace, vai trò, điểm danh và mô-đun ngày thi đấu có thể dùng chung một trạng thái rõ ràng.",
        evidenceHref: "/work/fball",
        evidenceLink: "Xem Fball.vn",
      },
      {
        number: "03",
        label: "SAAS / FULL-STACK",
        title: "Biến workflow riêng thành sản phẩm có thể vận hành.",
        outcome: "Một nền tảng có trạng thái, quyền hạn và nền móng đủ chắc để phát triển tiếp.",
        description: "Từ discovery và product framing đến auth, multi-tenant, permissions, database, API, realtime, payment, admin, security review và observability.",
        deliverables: ["MVP và product architecture", "Backend, data model, auth", "Multi-tenant, phân quyền & security", "Production release và handover"],
        fit: "Doanh nghiệp muốn số hóa một quy trình đặc thù, xây sản phẩm SaaS mới hoặc đưa prototype hiện tại lên production đáng tin cậy.",
        evidenceLabel: "Bằng chứng kiến trúc",
        evidence: "Nghiên cứu thanh toán thể hiện cách tôi thiết kế bằng chứng, idempotency và ranh giới trạng thái trước khi tự động hóa.",
        evidenceHref: "/work/payment-infrastructure",
        evidenceLink: "Xem nghiên cứu",
      },
    ],
    fitLabel: "Phù hợp khi",
    visualCaption: "Một lộ trình, nhiều độ sâu",
    proofLabel: "Mọi dự án đều được xây với",
    proof: ["Responsive, accessibility và performance", "SEO kỹ thuật ngay từ cấu trúc", "Security và hạ tầng vừa đủ", "Mốc bàn giao có thể kiểm tra"],
    pricingCta: "Xem phạm vi & mức đầu tư",
    contactCta: "Nhận đề xuất cho dự án",
  },
  en: {
    schemaName: "TUNG — Website design and SaaS development",
    label: "Website & product engineering",
    heading: "Start with the website you need. Add the backend when the business earns it.",
    intro: "Projects do not get forced into one template or one fixed package. The technical depth follows the goal: get the right advice, launch clearly, improve speed and SEO, secure the foundation, or turn a distinctive workflow into SaaS.",
    items: [
      {
        number: "01",
        label: "WEBSITE / LANDING PAGE",
        title: "A website that helps people understand and trust you.",
        outcome: "Clear message, calm experience, obvious path to contact.",
        description: "Content framing, information architecture, visual direction, responsive frontend, accessibility, performance and technical SEO — ready for launch.",
        deliverables: ["Conversion-focused landing page", "Business website", "Case studies and service pages", "Performance, analytics & technical SEO"],
        fit: "A business is replacing an outdated site, a temporary page or a template that no longer reflects the value it provides.",
        evidenceLabel: "Interface evidence",
        evidence: "LogiVN connects a public QR experience to responsive operational surfaces inside one product.",
        evidenceHref: "/work/logivn",
        evidenceLink: "View LogiVN",
      },
      {
        number: "02",
        label: "CMS / INTEGRATIONS",
        title: "A website that joins the way your business sells.",
        outcome: "Your team can update content, capture leads and connect the right tools.",
        description: "CMS, forms, member areas and integrations with CRM, business email, booking, payments or APIs when a website needs to do more than present information.",
        deliverables: ["CMS and content model", "Forms, lead routing, business email", "Booking, CRM or payments", "Editing permissions and handover"],
        fit: "A team has traffic or operational data but still copies, pastes and reconciles work across disconnected tools.",
        evidenceLabel: "Module evidence",
        evidence: "Fball.vn shows workspaces, roles, attendance and match-day modules sharing one legible state.",
        evidenceHref: "/work/fball",
        evidenceLink: "View Fball.vn",
      },
      {
        number: "03",
        label: "SAAS / FULL-STACK",
        title: "Turn a distinctive workflow into a product people can run.",
        outcome: "A platform with state, permissions and a foundation that can keep growing.",
        description: "Discovery and product framing through auth, multi-tenant boundaries, database, APIs, realtime, payments, admin, security review and observability.",
        deliverables: ["MVP and product architecture", "Backend, data model, auth", "Multi-tenant, permissions & security", "Production release and handover"],
        fit: "A business is digitising a distinct process, building a new SaaS, or taking an existing prototype to dependable production.",
        evidenceLabel: "Architecture evidence",
        evidence: "The payment research shows how I model evidence, idempotency and state boundaries before adding automation.",
        evidenceHref: "/work/payment-infrastructure",
        evidenceLink: "View the research",
      },
    ],
    fitLabel: "A good fit when",
    visualCaption: "One path, different depths",
    proofLabel: "Every engagement includes",
    proof: ["Responsive, accessible, fast surfaces", "Technical SEO in the structure", "Security and right-sized infrastructure", "Reviewable delivery milestones"],
    pricingCta: "See scope & investment",
    contactCta: "Discuss your project",
  },
  ja: {
    schemaName: "TUNG — ウェブサイト制作・SaaS開発",
    label: "ウェブサイト・プロダクト開発",
    heading: "必要なウェブサイトから始め、事業に必要な時だけバックエンドを加える。",
    intro: "一つのテンプレートや固定パッケージに押し込めません。方向性の相談、速度とSEOの改善、セキュリティと基盤、独自業務のSaaS化まで、目的に合わせて技術の深さを決めます。",
    items: [
      {
        number: "01",
        label: "WEBSITE / LANDING PAGE",
        title: "理解と信頼につながるウェブサイト。",
        outcome: "伝えることが明確で、問い合わせまでの道筋が見える体験。",
        description: "コンテンツ整理、情報設計、ビジュアル方針、responsive frontend、アクセシビリティ、performance、technical SEOまで公開品質へ仕上げます。",
        deliverables: ["コンバージョン重視のLP", "企業・サービスサイト", "事例とサービスページ", "Performance・Analytics・technical SEO"],
        fit: "古いサイト、仮のページ、価値を伝えきれないテンプレートを置き換えたい場合に向いています。",
        evidenceLabel: "インターフェースの実例",
        evidence: "LogiVNは公開QR体験と、同じプロダクト内のresponsiveな運用画面をつないでいます。",
        evidenceHref: "/work/logivn",
        evidenceLink: "LogiVNを見る",
      },
      {
        number: "02",
        label: "CMS / INTEGRATIONS",
        title: "販売や問い合わせの流れにつながるウェブサイト。",
        outcome: "チームが自分で更新し、リードを受け取り、必要なツールと連携できる。",
        description: "CMS、フォーム、会員エリア、CRM、法人メール、予約、決済、API連携を必要な範囲で設計します。",
        deliverables: ["CMSとコンテンツモデル", "フォーム、リード振り分け、法人メール", "予約、CRM、決済", "編集権限と引き継ぎ"],
        fit: "アクセスや運用データはあるのに、複数ツール間の転記と確認が残っているチームに向いています。",
        evidenceLabel: "モジュールの実例",
        evidence: "Fball.vnはworkspace、役割、出欠、試合日のモジュールを一つの状態につないでいます。",
        evidenceHref: "/work/fball",
        evidenceLink: "Fball.vnを見る",
      },
      {
        number: "03",
        label: "SAAS / FULL-STACK",
        title: "独自の業務を、運用できるプロダクトへ。",
        outcome: "状態と権限が明確で、次の成長を支えられるプラットフォーム。",
        description: "Discovery、プロダクト定義から認証、マルチテナント、データベース、API、realtime、決済、管理画面、security review、observabilityまで。",
        deliverables: ["MVPとプロダクト設計", "Backend、データモデル、認証", "マルチテナント・権限・security", "Production公開と引き継ぎ"],
        fit: "独自業務のデジタル化、新しいSaaS、既存prototypeのproduction化に向いています。",
        evidenceLabel: "アーキテクチャの実例",
        evidence: "決済研究では、自動化の前に証拠、冪等性、状態境界を設計しています。",
        evidenceHref: "/work/payment-infrastructure",
        evidenceLink: "研究を見る",
      },
    ],
    fitLabel: "向いているケース",
    visualCaption: "一つの道筋、複数の深さ",
    proofLabel: "すべての協業で重視すること",
    proof: ["Responsive・アクセシビリティ・速度", "構造から考えるtechnical SEO", "Securityと適切なインフラ", "確認できる納品マイルストーン"],
    pricingCta: "範囲と投資額を見る",
    contactCta: "プロジェクトを相談する",
  },
  zh: {
    schemaName: "TUNG — 企业网站设计与 SaaS 开发",
    label: "网站与产品工程",
    heading: "先做好需要的网站；当业务真正需要时，再加入后端。",
    intro: "不会把项目强行塞进同一套模板或固定套餐。技术深度跟随目标：先获得正确建议、清晰上线、改善速度与 SEO、保护基础，或把独特流程变成 SaaS。",
    items: [
      {
        number: "01",
        label: "WEBSITE / LANDING PAGE",
        title: "帮助客户理解并信任你的企业网站。",
        outcome: "信息清楚、体验从容、联系路径一眼可见。",
        description: "从内容梳理、信息架构、视觉方向到响应式前端、无障碍、性能与技术 SEO，做到可上线的完整质量。",
        deliverables: ["以转化为目标的落地页", "企业与服务网站", "案例与服务页面", "性能、Analytics 与技术 SEO"],
        fit: "适合替换过时网站、临时页面，或已经无法体现真实价值的模板站。",
        evidenceLabel: "界面证据",
        evidence: "LogiVN 将公开 QR 体验与同一产品中的响应式运营界面连接起来。",
        evidenceHref: "/work/logivn",
        evidenceLink: "查看 LogiVN",
      },
      {
        number: "02",
        label: "CMS / INTEGRATIONS",
        title: "加入销售与运营流程的网站。",
        outcome: "团队可以自己更新内容、接收线索，并连接正确的工具。",
        description: "按需设计 CMS、表单、会员区，以及 CRM、企业邮箱、预约、支付或 API 集成，让网站不只负责展示。",
        deliverables: ["CMS 与内容模型", "表单、线索分配、企业邮箱", "预约、CRM 或支付", "编辑权限与交接"],
        fit: "适合已经有流量或运营数据，却仍在多个工具之间复制、粘贴和核对的团队。",
        evidenceLabel: "模块证据",
        evidence: "Fball.vn 让工作区、角色、出勤与比赛日模块共享同一套清晰状态。",
        evidenceHref: "/work/fball",
        evidenceLink: "查看 Fball.vn",
      },
      {
        number: "03",
        label: "SAAS / FULL-STACK",
        title: "把独特流程变成真正可以运营的产品。",
        outcome: "拥有状态、权限和可以继续成长的系统基础。",
        description: "从 discovery、产品定义到认证、多租户边界、数据库、API、实时能力、支付、管理后台、安全审查与可观测性。",
        deliverables: ["MVP 与产品架构", "后端、数据模型、认证", "多租户、权限与安全", "Production 上线与交接"],
        fit: "适合数字化独特流程、构建新的 SaaS，或把已有 prototype 推进到可靠 production。",
        evidenceLabel: "架构证据",
        evidence: "支付研究展示了在自动化之前，如何设计证据、幂等性与状态边界。",
        evidenceHref: "/work/payment-infrastructure",
        evidenceLink: "查看研究",
      },
    ],
    fitLabel: "适合情况",
    visualCaption: "一条路径，多种深度",
    proofLabel: "每项合作都会关注",
    proof: ["响应式、无障碍与速度", "从结构开始的技术 SEO", "安全与适度的基础设施", "可以复核的交付里程碑"],
    pricingCta: "查看范围与投入",
    contactCta: "讨论你的项目",
  },
};

export function getHomeServiceCopy(locale: Locale): HomeServiceCopy {
  return copy[locale];
}
