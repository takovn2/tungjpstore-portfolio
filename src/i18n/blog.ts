import type { Locale } from "./dictionaries";

export type BlogCopy = {
  metaTitle: string;
  metaDescription: string;
  label: string;
  heading: string;
  intro: string;
  audienceLabel: string;
  audienceHeading: string;
  audienceIntro: string;
  audiencePillars: Array<{ index: string; title: string; description: string; slug: string }>;
  audienceReadLabel: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  serviceBridgeLabel: string;
  serviceBridgeHeading: string;
  serviceBridgeBody: string;
  serviceBridgePrimary: string;
  serviceBridgeSecondary: string;
  articleCount: (count: number) => string;
  readArticle: string;
  publishedLabel: string;
  authorLabel: string;
  readingTime: (minutes: number) => string;
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  backToArticles: string;
  continueExploring: string;
  contactCta: string;
  rssLabel: string;
  publicationName: string;
  publicationDescription: string;
  homeLabel: string;
  homeHeading: string;
  homeIntro: string;
  viewAll: string;
  postRailLabel: string;
  postRailBody: string;
  postCtaLabel: string;
  postCtaHeading: string;
  postCtaBody: string;
  postPricingCta: string;
};

// Publication-specific copy lives here so the core page dictionary remains stable.
export const blogCopy: Record<Locale, BlogCopy> = {
  vi: {
    metaTitle: "Góc nhìn xây website & SaaS cho doanh nghiệp — TUNG",
    metaDescription: "Góc nhìn thực tế khi thiết kế website cho doanh nghiệp vừa và nhỏ, xây sản phẩm SaaS và nối giao diện với hệ thống vận hành đáng tin cậy.",
    label: "Góc nhìn triển khai",
    heading: "Website tốt bắt đầu từ những quyết định đúng.",
    intro: "Tôi viết cho chủ doanh nghiệp và đội ngũ sản phẩm đang cần biến một ý tưởng thành website, công cụ nội bộ hoặc SaaS có thể vận hành. Từ frontend tinh gọn đến backend nhiều quy tắc, mỗi bài đều bắt đầu từ bài toán thật.",
    audienceLabel: "Đọc theo bài toán",
    audienceHeading: "Một blog dành cho những người cần xây thứ có ích, không chỉ có hình thức.",
    audienceIntro: "Chọn điểm bắt đầu phù hợp với giai đoạn của bạn. Các chủ đề giao nhau, vì một website doanh nghiệp tốt thường cần cả nội dung, dữ liệu và quy trình phía sau.",
    audiencePillars: [
      { index: "01", title: "Website cho SME", description: "Cấu trúc trang, nội dung, SEO và chuyển đổi cho doanh nghiệp cần một nền tảng rõ ràng để bán hàng hoặc nhận yêu cầu.", slug: "multilingual-products-without-translation-debt" },
      { index: "02", title: "Sản phẩm & SaaS", description: "Từ prototype đến hệ thống đa tenant: luồng người dùng, phân quyền, dữ liệu, tích hợp và các quyết định cần kiểm chứng.", slug: "ai-starts-with-the-workflow" },
      { index: "03", title: "Vận hành đáng tin", description: "Thanh toán, AI, tự động hóa và các trạng thái backend được thiết kế để đội ngũ hiểu, kiểm tra và tiếp tục làm việc.", slug: "safe-agentic-ai-authority-boundaries" },
    ],
    audienceReadLabel: "Đọc bài liên quan",
    heroPrimaryCta: "Xem dịch vụ & bảng giá",
    heroSecondaryCta: "Xem dự án đã triển khai",
    serviceBridgeLabel: "Từ góc nhìn đến triển khai",
    serviceBridgeHeading: "Bạn đang cần website hay một hệ thống đứng sau website?",
    serviceBridgeBody: "Tôi nhận các dự án phù hợp từ landing page và website giới thiệu đến nền tảng SaaS có backend phức tạp. Bắt đầu bằng phạm vi rõ ràng, sau đó mở rộng khi dữ liệu và nhu cầu đã đủ chắc.",
    serviceBridgePrimary: "Xem phạm vi & giá",
    serviceBridgeSecondary: "Trao đổi nhu cầu",
    articleCount: (count) => `${count} bài viết đã xuất bản`,
    readArticle: "Đọc bài viết",
    publishedLabel: "Xuất bản",
    authorLabel: "Tác giả",
    readingTime: (minutes) => `${minutes} phút đọc`,
    emptyTitle: "Chưa có bài viết bằng tiếng Việt.",
    emptyBody: "Các bài viết mới sẽ xuất hiện tại đây khi đã đủ rõ ràng và hữu ích cho người đọc.",
    emptyCta: "Xem các dự án",
    backToArticles: "Quay lại danh sách bài viết",
    continueExploring: "Tiếp tục khám phá",
    contactCta: "Trao đổi về một bài toán tương tự",
    rssLabel: "Theo dõi qua RSS",
    publicationName: "Bài viết của Tung",
    publicationDescription: "Những bài viết về sản phẩm, thiết kế và công nghệ được rút ra từ các dự án thực tế.",
    homeLabel: "Mới trên blog",
    homeHeading: "Góc nhìn thực tế khi xây website và sản phẩm số.",
    homeIntro: "Không chạy theo thuật ngữ. Mỗi bài viết bắt đầu từ một vấn đề cụ thể, giúp bạn biết nên làm gì trước, điều gì cần kiểm chứng và khi nào nên đầu tư sâu hơn.",
    viewAll: "Xem tất cả bài viết",
    postRailLabel: "Góc nhìn triển khai",
    postRailBody: "Bài viết này nằm trong chuỗi ghi chép về cách biến bài toán kinh doanh thành trải nghiệm, dữ liệu và hệ thống có thể vận hành.",
    postCtaLabel: "Áp dụng vào dự án",
    postCtaHeading: "Biến quyết định này thành một website hoặc sản phẩm có thể vận hành.",
    postCtaBody: "Nếu bạn đang ở giai đoạn cần người cùng làm rõ phạm vi, hãy bắt đầu bằng một cuộc trao đổi ngắn.",
    postPricingCta: "Xem dịch vụ & bảng giá",
  },
  en: {
    metaTitle: "Website & SaaS Delivery Notes for Small Businesses — TUNG",
    metaDescription: "Practical notes on designing SME websites, building SaaS products and connecting polished frontend work to reliable operational systems.",
    label: "Delivery notes",
    heading: "A good website starts with the right decisions.",
    intro: "I write for business owners and product teams turning an idea into a marketing website, internal tool or SaaS product. From focused frontend work to complex backend systems, every note starts with a real delivery question.",
    audienceLabel: "Choose your starting point",
    audienceHeading: "For people who need something useful, not just something that looks finished.",
    audienceIntro: "Start with the problem closest to you. The themes overlap because a strong business website often needs clear content, trustworthy data and an operational path behind it.",
    audiencePillars: [
      { index: "01", title: "SME websites", description: "Information architecture, content, SEO and conversion for businesses that need a clear foundation for enquiries or sales.", slug: "multilingual-products-without-translation-debt" },
      { index: "02", title: "Products & SaaS", description: "From prototype to multi-tenant product: user flows, permissions, data, integrations and decisions worth validating.", slug: "ai-starts-with-the-workflow" },
      { index: "03", title: "Reliable operations", description: "Payments, AI, automation and backend states designed so teams can understand, verify and keep working.", slug: "safe-agentic-ai-authority-boundaries" },
    ],
    audienceReadLabel: "Read a related article",
    heroPrimaryCta: "View services & pricing",
    heroSecondaryCta: "See delivered projects",
    serviceBridgeLabel: "From notes to delivery",
    serviceBridgeHeading: "Do you need a website, or the system behind the website?",
    serviceBridgeBody: "I take on a focused range of work, from landing pages and company websites to SaaS platforms with complex backend rules. We start with a clear scope, then extend it when the evidence and demand are there.",
    serviceBridgePrimary: "View scope & pricing",
    serviceBridgeSecondary: "Discuss your project",
    articleCount: (count) => `${count} published ${count === 1 ? "article" : "articles"}`,
    readArticle: "Read article",
    publishedLabel: "Published",
    authorLabel: "By",
    readingTime: (minutes) => `${minutes} min read`,
    emptyTitle: "No English articles are published yet.",
    emptyBody: "New articles will appear here when they are clear, useful and ready to share.",
    emptyCta: "Explore projects",
    backToArticles: "Back to all articles",
    continueExploring: "Continue exploring",
    contactCta: "Discuss a similar problem",
    rssLabel: "Follow via RSS",
    publicationName: "Tung's Articles",
    publicationDescription: "Writing on product, design and technology drawn from real projects.",
    homeLabel: "Latest from the blog",
    homeHeading: "Practical thinking on websites and digital products.",
    homeIntro: "No trend-chasing. Each article starts with a concrete problem and clarifies what to do first, what to validate and when deeper engineering is justified.",
    viewAll: "View all articles",
    postRailLabel: "Delivery note",
    postRailBody: "This article is part of a working collection on turning business problems into experiences, data and systems that teams can operate.",
    postCtaLabel: "Apply it to a project",
    postCtaHeading: "Turn this decision into a website or product your team can run.",
    postCtaBody: "If you are deciding what to build next, start with a short conversation about scope, constraints and the next useful release.",
    postPricingCta: "View services & pricing",
  },
  ja: {
    metaTitle: "中小企業のWebサイト・SaaS開発ノート — TUNG",
    metaDescription: "中小企業向けWebサイトの設計、SaaSプロダクト開発、フロントエンドと信頼できる業務システムをつなぐ実務ノートです。",
    label: "開発ノート",
    heading: "良いWebサイトは、正しい判断から始まる。",
    intro: "事業者やプロダクトチームが、アイデアを会社サイト、業務ツール、SaaSへ育てるときの判断を記録します。絞り込んだフロントエンドから複雑なバックエンドまで、実際の開発課題から書いています。",
    audienceLabel: "課題から読む",
    audienceHeading: "見た目だけでなく、役に立つものをつくりたい人へ。",
    audienceIntro: "いま一番近い課題から選んでください。良い企業サイトには、明快なコンテンツ、信頼できるデータ、運用の流れが必要になることがあります。",
    audiencePillars: [
      { index: "01", title: "中小企業のWebサイト", description: "問い合わせや販売につながる情報設計、コンテンツ、SEO、コンバージョンを考える。", slug: "multilingual-products-without-translation-debt" },
      { index: "02", title: "プロダクトとSaaS", description: "プロトタイプからマルチテナントまで、ユーザーフロー、権限、データ、連携を検証する。", slug: "ai-starts-with-the-workflow" },
      { index: "03", title: "信頼できる運用", description: "決済、AI、自動化、バックエンドの状態を、チームが理解・確認できる形にする。", slug: "safe-agentic-ai-authority-boundaries" },
    ],
    audienceReadLabel: "関連記事を読む",
    heroPrimaryCta: "サービスと料金を見る",
    heroSecondaryCta: "実装したプロジェクトを見る",
    serviceBridgeLabel: "ノートから実装へ",
    serviceBridgeHeading: "必要なのはWebサイトですか、それともその裏側のシステムですか。",
    serviceBridgeBody: "ランディングページや企業サイトから、複雑なバックエンドを持つSaaSまで、適切な規模の案件に取り組みます。まず範囲を明確にし、根拠と需要に合わせて広げます。",
    serviceBridgePrimary: "範囲と料金を見る",
    serviceBridgeSecondary: "相談する",
    articleCount: (count) => `公開済みの記事 ${count}件`,
    readArticle: "記事を読む",
    publishedLabel: "公開日",
    authorLabel: "執筆者",
    readingTime: (minutes) => `読了目安 ${minutes}分`,
    emptyTitle: "日本語の記事はまだ公開されていません。",
    emptyBody: "新しい記事は、読みやすく役立つ形に整えてから公開します。",
    emptyCta: "プロジェクトを見る",
    backToArticles: "記事一覧へ戻る",
    continueExploring: "続けて見る",
    contactCta: "似た課題について相談する",
    rssLabel: "RSSでフォロー",
    publicationName: "Tungの記事",
    publicationDescription: "実際のプロジェクトから得た、プロダクト・デザイン・技術についての文章です。",
    homeLabel: "ブログの新着",
    homeHeading: "Webサイトとデジタルプロダクトを実務から考える。",
    homeIntro: "流行語を追うのではなく、具体的な課題から出発し、まず何を作るか、何を検証するかを整理します。",
    viewAll: "すべての記事を見る",
    postRailLabel: "開発ノート",
    postRailBody: "事業の課題を、体験・データ・チームが運用できるシステムへ変換するための記録です。",
    postCtaLabel: "プロジェクトに活かす",
    postCtaHeading: "この判断を、チームが運用できるWebサイトやプロダクトへ。",
    postCtaBody: "次に何を作るか迷っているなら、範囲・制約・最初のリリースについて短く相談してください。",
    postPricingCta: "サービスと料金を見る",
  },
  zh: {
    metaTitle: "中小企业网站与 SaaS 交付笔记 — TUNG",
    metaDescription: "记录中小企业网站设计、SaaS 产品开发，以及将前端体验连接到可靠业务系统的实务方法。",
    label: "交付笔记",
    heading: "一个好网站，始于正确的判断。",
    intro: "写给正在把想法变成企业官网、内部工具或 SaaS 产品的经营者与产品团队。从聚焦的前端页面到复杂的后端系统，每篇文章都从真实交付问题开始。",
    audienceLabel: "按问题开始阅读",
    audienceHeading: "献给需要真正有用的系统，而不只是看起来完成的人。",
    audienceIntro: "从最接近你的问题开始。三类主题彼此相连，因为一个强健的企业网站往往也需要清晰内容、可信数据和可执行的运营流程。",
    audiencePillars: [
      { index: "01", title: "中小企业网站", description: "为咨询或销售建立清晰基础的信息架构、内容、SEO 与转化路径。", slug: "multilingual-products-without-translation-debt" },
      { index: "02", title: "产品与 SaaS", description: "从原型到多租户产品：用户流程、权限、数据、集成，以及值得验证的关键判断。", slug: "ai-starts-with-the-workflow" },
      { index: "03", title: "可靠运营", description: "让支付、AI、自动化与后端状态可被团队理解、检查并持续运行。", slug: "safe-agentic-ai-authority-boundaries" },
    ],
    audienceReadLabel: "阅读相关文章",
    heroPrimaryCta: "查看服务与价格",
    heroSecondaryCta: "查看已交付项目",
    serviceBridgeLabel: "从笔记到交付",
    serviceBridgeHeading: "你需要的是一个网站，还是网站背后的系统？",
    serviceBridgeBody: "我承接从落地页、企业网站到具备复杂后端规则的 SaaS 平台。先把范围讲清楚，再根据证据与需求逐步扩展。",
    serviceBridgePrimary: "查看范围与价格",
    serviceBridgeSecondary: "讨论你的项目",
    articleCount: (count) => `已发布 ${count} 篇文章`,
    readArticle: "阅读文章",
    publishedLabel: "发布于",
    authorLabel: "作者",
    readingTime: (minutes) => `阅读约 ${minutes} 分钟`,
    emptyTitle: "暂时还没有发布中文文章。",
    emptyBody: "新文章会在内容清晰、对读者有帮助时发布到这里。",
    emptyCta: "查看项目",
    backToArticles: "返回文章列表",
    continueExploring: "继续浏览",
    contactCta: "讨论类似问题",
    rssLabel: "通过 RSS 订阅",
    publicationName: "Tung 的文章",
    publicationDescription: "来自真实项目的产品、设计与技术文章。",
    homeLabel: "博客新文章",
    homeHeading: "从实践出发，思考网站与数字产品。",
    homeIntro: "不追逐概念热度。每篇文章都从具体问题出发，梳理先做什么、验证什么，以及何时值得投入更深的工程。",
    viewAll: "查看全部文章",
    postRailLabel: "交付笔记",
    postRailBody: "记录如何把业务问题转化为体验、数据和团队能够运行的系统。",
    postCtaLabel: "应用到你的项目",
    postCtaHeading: "把这个判断，变成团队真正能运行的网站或产品。",
    postCtaBody: "如果你正在决定下一步做什么，可以先聊聊范围、约束和最有价值的首个版本。",
    postPricingCta: "查看服务与价格",
  },
};

export const getBlogCopy = (locale: Locale) => blogCopy[locale];

export const blogLanguageTag: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en",
  ja: "ja-JP",
  zh: "zh-Hans",
};

export const blogFeedPath = (locale: Locale) => locale === "vi" ? "/rss.xml" : `/${locale}/rss.xml`;
