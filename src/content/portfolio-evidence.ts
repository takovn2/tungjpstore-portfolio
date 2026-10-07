import type { Locale } from "../i18n/dictionaries";

type LocalizedText = Record<Locale, string>;

export type EvidenceMetric = {
  value: string;
  label: string;
  note: string;
};

export type StackDecision = {
  layer: string;
  technology: string;
  reason: string;
  effect: string;
};

export type DecisionRecord = {
  title: string;
  context: string;
  decision: string;
  tradeoff: string;
};

export type EvidenceVisual = {
  src: string;
  alt: string;
  caption: string;
  kind: "capture" | "system" | "flow" | "detail";
};

export type ProjectEvidence = {
  metrics: EvidenceMetric[];
  stack: StackDecision[];
  decisions: DecisionRecord[];
  visuals: EvidenceVisual[];
  fieldNote: {
    eyebrow: string;
    title: string;
    body: string;
    image: string;
    alt: string;
  };
};

export type SkillEntry = {
  name: string;
  level: string;
  evidence: string;
};

export type SkillGroup = {
  label: string;
  description: string;
  skills: SkillEntry[];
};

const pick = (locale: Locale, value: LocalizedText) => value[locale];

const common = {
  verified: {
    vi: "Góc nhìn sản phẩm",
    en: "Product view",
    ja: "プロダクトの視点",
    zh: "产品视角",
  },
  modelCaption: {
    vi: "Một góc nhìn minh họa cho cách sản phẩm kết nối các bước trong công việc.",
    en: "An illustrative view of how the product connects the work from one step to the next.",
    ja: "プロダクトが仕事の流れをつなぐ様子を示すイメージ。",
    zh: "展示产品如何把工作中的步骤连接起来。",
  },
  productCapture: {
    vi: "Một màn hình từ trải nghiệm sản phẩm dành cho công việc hằng ngày.",
    en: "A screen from the product experience built for everyday work.",
    ja: "日々の仕事のために設計したプロダクト画面。",
    zh: "面向日常工作的产品界面。",
  },
  portraitAlt: {
    vi: "Tung trong không gian studio tối, đại diện cho ghi chú cá nhân phía sau dự án",
    en: "Tung in a dark studio setting, accompanying a personal project note",
    ja: "プロジェクトの個人的なメモに添えた、暗いスタジオでのTungのポートレート",
    zh: "Tung在深色影棚中的肖像，用于项目个人札记",
  },
} satisfies Record<string, LocalizedText>;

const localized = (locale: Locale, values: Record<string, LocalizedText>) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, pick(locale, value)])) as Record<string, string>;

export const caseStudyLabels = (locale: Locale) => localized(locale, {
  evidence: { vi: "Bằng chứng và tác động", en: "Evidence and impact", ja: "根拠とインパクト", zh: "证据与影响" },
  evidenceHeading: { vi: "Những thay đổi có thể kiểm tra, kể cả khi con số còn nhỏ.", en: "Changes that can be checked, even when the numbers are small.", ja: "数字が小さくても確認できる変化。", zh: "即使数字不大，也能被核验的变化。" },
  evidenceNote: { vi: "Mỗi chỉ dấu đều có phạm vi rõ; không suy rộng thành tăng trưởng hay doanh thu.", en: "Each signal has a defined scope and is not stretched into a growth or revenue claim.", ja: "各指標の範囲を明示し、成長や売上の主張には広げません。", zh: "每项指标都有明确范围，不延伸为增长或收入结论。" },
  walkthrough: { vi: "Luồng sản phẩm", en: "Product walkthrough", ja: "プロダクトフロー", zh: "产品流程" },
  walkthroughHeading: { vi: "Một vòng vận hành, nhìn qua nhiều trạng thái.", en: "One operating loop, seen through several states.", ja: "複数の状態から見る、一つの運用ループ。", zh: "从多个状态看同一条运营循环。" },
  architecture: { vi: "Tech stack và kiến trúc", en: "Tech stack and architecture", ja: "技術スタックと設計", zh: "技术栈与架构" },
  architectureHeading: { vi: "Mỗi công nghệ phải giải thích được vai trò của nó.", en: "Every technology must explain the job it is doing.", ja: "各技術は、その役割を説明できなければならない。", zh: "每项技术都必须说明它承担的职责。" },
  layer: { vi: "Lớp", en: "Layer", ja: "レイヤー", zh: "层级" },
  technology: { vi: "Công nghệ", en: "Technology", ja: "技術", zh: "技术" },
  reason: { vi: "Vì sao", en: "Why", ja: "理由", zh: "原因" },
  effect: { vi: "Tác động", en: "Effect", ja: "効果", zh: "作用" },
  decisions: { vi: "Architecture decisions", en: "Architecture decisions", ja: "アーキテクチャ判断", zh: "架构决策" },
  decisionsHeading: { vi: "Lựa chọn, lý do và phần đánh đổi được đặt cạnh nhau.", en: "The choice, rationale and trade-off stay together.", ja: "選択、理由、トレードオフを一緒に示す。", zh: "把选择、理由与取舍放在一起。" },
  context: { vi: "Bối cảnh", en: "Context", ja: "背景", zh: "背景" },
  decision: { vi: "Quyết định", en: "Decision", ja: "判断", zh: "决策" },
  tradeoff: { vi: "Đánh đổi", en: "Trade-off", ja: "トレードオフ", zh: "取舍" },
  fieldNote: { vi: "Góc nhìn cá nhân", en: "Personal perspective", ja: "個人的な視点", zh: "个人视角" },
});

const evidenceByProject = {
  logivn: {
    metrics: [
      ["3", { vi: "bề mặt sản phẩm dùng chung trạng thái vận hành", en: "product surfaces sharing operational state", ja: "運用状態を共有するプロダクト面", zh: "共享运营状态的产品界面" }],
      ["5", { vi: "ranh giới kiến trúc được mô tả công khai", en: "architecture boundaries described publicly", ja: "公開しているアーキテクチャ境界", zh: "公开描述的架构边界" }],
      ["1", { vi: "order xuyên suốt khách → sàn → bếp", en: "order carried across guest → floor → kitchen", ja: "来客 → フロア → キッチンを通る注文", zh: "贯穿顾客 → 楼面 → 厨房的一笔订单" }],
    ],
    stack: [
      ["Product surfaces", "Next.js App Router · React · TypeScript", { vi: "Tách trải nghiệm khách, nhân viên và quản trị nhưng giữ chung domain state.", en: "Separate guest, staff and admin experiences while retaining shared domain state.", ja: "来客、スタッフ、管理画面を分けながらドメイン状態を共有する。", zh: "分离顾客、员工与管理体验，同时保留共享领域状态。" }, { vi: "Mỗi vai trò chỉ thấy quyết định cần thiết mà không tạo ba sản phẩm rời.", en: "Each role sees the decisions it needs without creating three disconnected products.", ja: "三つの別製品にせず、各役割に必要な判断だけを見せる。", zh: "不同角色只看到所需决策，但不会形成三个割裂产品。" }],
      ["Operational data", "Supabase · PostgreSQL · Auth · Realtime · Storage", { vi: "Một nền dữ liệu tenant-aware cho order, bàn, bếp, nhân sự và media.", en: "A tenant-aware data foundation for orders, tables, kitchen, staff and media.", ja: "注文、テーブル、キッチン、スタッフ、メディアのテナント対応データ基盤。", zh: "面向订单、餐桌、厨房、员工和媒体的租户感知数据基础。" }, { vi: "State thay đổi ở bếp hoặc sàn có thể phản ánh trên cùng một luồng.", en: "Kitchen and floor updates can move through the same operating flow.", ja: "キッチンとフロアの更新が同じ運用フローに反映される。", zh: "厨房与楼面的更新可以进入同一运营流程。" }],
      ["Boundaries", "Zod · Zustand · provider adapters", { vi: "Giữ validation, client state và tích hợp ngoài ở ranh giới có thể thay thế.", en: "Keep validation, client state and external providers behind explicit replaceable boundaries.", ja: "検証、クライアント状態、外部プロバイダーを明示的で交換可能な境界に置く。", zh: "将校验、客户端状态与外部服务放在明确且可替换的边界后。" }, { vi: "Maps, VietQR và AI không sở hữu mô hình vận hành cốt lõi.", en: "Maps, VietQR and AI do not own the core operating model.", ja: "地図、VietQR、AIが中核の運用モデルを支配しない。", zh: "地图、VietQR与AI不会拥有核心运营模型。" }],
    ],
    decisions: [
      [{ vi: "Tenant trước tính năng", en: "Tenancy before features", ja: "機能より先にテナント境界", zh: "先明确租户，再扩展功能" }, { vi: "Sản phẩm mở rộng qua nhiều quán, vai trò và bề mặt.", en: "The product expands across venues, roles and interfaces.", ja: "複数店舗、役割、画面へ拡張する。", zh: "产品会扩展到多个门店、角色与界面。" }, { vi: "Đưa tenant và permission vào nền truy cập dữ liệu ngay từ đầu.", en: "Put tenant and permission checks into the data access foundation from the start.", ja: "テナントと権限チェックを最初からデータアクセス基盤に入れる。", zh: "从一开始就在数据访问基础中加入租户与权限校验。" }, { vi: "Mô hình ban đầu chặt hơn, đổi lại tránh vá quyền hạn sau khi UI đã lan rộng.", en: "The initial model is stricter, avoiding permission patches after the UI expands.", ja: "初期モデルは厳密になるが、画面拡張後の権限パッチを避けられる。", zh: "初始模型更严格，但避免界面扩展后再补权限漏洞。" }],
      [{ vi: "Realtime chỉ nơi chờ đợi làm hỏng công việc", en: "Realtime where waiting breaks the work", ja: "待ち時間が業務を壊す場所だけリアルタイム", zh: "只在等待会破坏工作的地方使用实时更新" }, { vi: "Order và bếp bị sai lệch trạng thái sẽ tạo phối hợp lặp lại ngay lập tức.", en: "Stale order and kitchen state creates immediate coordination work.", ja: "注文とキッチン状態のずれは即座に再確認を生む。", zh: "订单与厨房状态过期会立刻制造重复沟通。" }, { vi: "Dùng realtime cho trạng thái vận hành quan trọng, không biến mọi dữ liệu thành subscription.", en: "Use realtime for critical operational state instead of subscribing to everything.", ja: "重要な運用状態に限定し、すべてを購読しない。", zh: "实时更新只用于关键运营状态，而不是订阅所有数据。" }, { vi: "Cần quản lý vòng đời subscription và fallback khi kết nối không ổn định.", en: "Subscription lifecycle and degraded connectivity need explicit handling.", ja: "購読ライフサイクルと不安定な接続への対応が必要。", zh: "需要明确处理订阅生命周期与弱网退化。" }],
    ],
    visuals: [
      "/images/projects/logivn-showcase-cover.webp",
      "/images/projects/logivn-showcase-overview.webp",
      "/images/projects/logivn-showcase-orders.webp",
      "/images/projects/logivn-showcase-staff.webp",
      "/images/projects/logivn-showcase-ai.webp",
    ],
    fieldNote: {
      title: { vi: "Một order chỉ có giá trị khi mọi người cùng tin vào trạng thái của nó.", en: "An order is only useful when every role trusts its state.", ja: "注文は、すべての役割がその状態を信頼して初めて役に立つ。", zh: "只有当所有角色都信任订单状态时，它才真正有用。" },
      body: { vi: "Khi nhìn một ca phục vụ bận, vấn đề hiếm khi là thiếu thêm một màn hình. Vấn đề là cùng một order bị kể lại bằng nhiều cách: khách vừa gửi, sàn chưa thấy, bếp đã làm, quản lý lại hỏi. Từ đó, mình chọn lấy trạng thái dùng chung làm xương sống và để từng giao diện chỉ trả lời quyết định tiếp theo.", en: "During a busy service, the problem is rarely one missing screen. It is the same order being retold in several places: the guest sent it, the floor has not seen it, the kitchen started it and the manager asks again. That observation made shared state the spine of the product, with each interface focused on the next decision.", ja: "忙しい営業中に不足しているのは、たいてい新しい画面ではありません。同じ注文が、来客、フロア、キッチン、管理者の間で別々に語り直されることです。そこで共有状態をプロダクトの背骨にし、各画面は次の判断だけに集中させました。", zh: "忙碌营业时，问题通常不是少一个页面，而是同一笔订单在顾客、楼面、厨房和管理者之间被反复讲述。因此我把共享状态作为产品骨架，让每个界面只回答下一步决策。" },
    },
  },
  fball: {
    metrics: [
      ["3", { vi: "route khám phá công khai đang hoạt động", en: "public discovery routes currently live", ja: "公開中のディスカバリールート", zh: "正在运行的公开发现路径" }],
      ["1", { vi: "workspace theo đội cho lịch, điểm danh và quỹ", en: "team-scoped workspace for matches, attendance and funds", ja: "試合、出欠、資金を扱うチーム単位ワークスペース", zh: "面向比赛、出勤与球队资金的团队工作区" }],
      ["5", { vi: "bước trong vòng lặp ngày thi đấu", en: "steps in the observable match-day loop", ja: "確認できる試合日ループのステップ", zh: "可观察比赛日循环中的步骤" }],
    ],
    stack: [
      ["Club workspace", "Next.js App Router · React · TypeScript · Tailwind", { vi: "Một bề mặt responsive cho lịch, điểm danh, đội hình, thành viên và quỹ.", en: "One responsive surface for matches, attendance, lineups, members and funds.", ja: "試合、出欠、ラインアップ、メンバー、資金を一つのレスポンシブ面にまとめる。", zh: "用一个响应式界面承载比赛、出勤、阵容、成员与球队资金。" }, { vi: "Đội trưởng có control rõ; thành viên vẫn thao tác nhanh trên mobile.", en: "Captains keep clear controls while members retain a fast mobile path.", ja: "キャプテンには明確な操作を、メンバーには速いモバイル導線を提供。", zh: "队长拥有清晰控制，成员仍能在移动端快速操作。" }],
      ["Team boundary", "Supabase Auth · PostgreSQL · Row Level Security", { vi: "Mọi trận, điểm danh, vai trò và ledger thuộc một team có kiểm soát.", en: "Every match, attendance response, role and ledger entry belongs to a controlled team.", ja: "試合、出欠、役割、台帳を管理されたチーム境界に置く。", zh: "每场比赛、出勤、角色和账本条目都归属受控团队。" }, { vi: "Ranh giới được kiểm tra gần dữ liệu thay vì chỉ ẩn nút trên UI.", en: "The boundary is enforced near the data rather than only hiding UI controls.", ja: "UIで隠すだけでなく、データ近くで境界を強制する。", zh: "边界在数据层附近执行，而不仅是隐藏界面按钮。" }],
      ["Optional capability", "Feature flags · quotas · provider adapters", { vi: "Maps, media, AI và messaging có chi phí và độ tin cậy riêng.", en: "Maps, media, AI and messaging carry separate cost and reliability profiles.", ja: "地図、メディア、AI、メッセージングはコストと信頼性が異なる。", zh: "地图、媒体、AI和消息服务具有不同成本与可靠性。" }, { vi: "Module phụ chỉ bật khi được cấu hình và có lý do vận hành.", en: "Secondary modules activate only when configured and operationally justified.", ja: "補助モジュールは設定され、運用上の理由がある時だけ有効化。", zh: "辅助模块仅在完成配置且有运营理由时启用。" }],
    ],
    decisions: [
      [{ vi: "Team là tenant", en: "The team is the tenant", ja: "チームをテナントにする", zh: "以球队作为租户" }, { vi: "Thành viên có thể thuộc nhiều đội với vai trò khác nhau.", en: "A member can belong to several teams with different roles.", ja: "一人が複数チームで異なる役割を持てる。", zh: "一个成员可以属于多个球队并拥有不同角色。" }, { vi: "Gắn match, attendance, role và ledger vào team boundary rõ ràng.", en: "Attach matches, attendance, roles and ledger entries to an explicit team boundary.", ja: "試合、出欠、役割、台帳を明示的なチーム境界に紐づける。", zh: "将比赛、出勤、角色和账本绑定到明确的球队边界。" }, { vi: "Mọi truy vấn và luồng mời cần mang team context; đổi lại tránh trộn dữ liệu giữa đội.", en: "Every query and invitation flow carries team context, preventing cross-team leakage.", ja: "すべてのクエリと招待にチーム文脈が必要だが、チーム間混在を防げる。", zh: "所有查询与邀请流程都需携带球队上下文，以避免跨队数据混淆。" }],
      [{ vi: "Tự động hóa cần xác nhận", en: "Automation requires confirmation", ja: "自動化には確認が必要", zh: "自动化必须经过确认" }, { vi: "AI hoặc tích hợp ngoài có thể đề xuất nhưng không nên âm thầm đổi trạng thái đội.", en: "AI and external providers may propose changes but should not silently mutate club state.", ja: "AIや外部連携は提案できても、チーム状態を黙って変更すべきではない。", zh: "AI与外部服务可以提出建议，但不应静默修改球队状态。" }, { vi: "Đặt bước xác nhận của người có quyền trước mutation quan trọng.", en: "Place an authorized human confirmation before important mutations.", ja: "重要な変更の前に権限を持つ人の確認を置く。", zh: "重要变更前加入有权限人员的确认。" }, { vi: "Thêm một bước thao tác, đổi lại giữ accountability và audit rõ.", en: "It adds one action while preserving accountability and auditability.", ja: "操作は一つ増えるが、責任と監査可能性を保てる。", zh: "多一步操作，但保留责任归属与审计能力。" }],
    ],
    visuals: [
      "/images/projects/fball-showcase-cover.webp",
      "/images/projects/fball-showcase-core.webp",
      "/images/projects/fball-showcase-story.webp",
      "/images/projects/fball-showcase-modules.webp",
      "/images/projects/fball-showcase-home.webp",
      "/images/projects/fball-showcase-attendance.webp",
    ],
    fieldNote: {
      title: { vi: "Trước giờ bóng lăn, một danh sách đúng quan trọng hơn mười tính năng mới.", en: "Before kick-off, one correct list matters more than ten new features.", ja: "キックオフ前は、十の新機能より一つの正しい名簿が重要。", zh: "开球前，一份正确名单比十个新功能更重要。" },
      body: { vi: "Nhịp thật của một đội bóng phong trào rất đơn giản: đá lúc nào, ai đi và chia đội ra sao. Nhưng khi ba câu hỏi này nằm trong hàng trăm tin nhắn, đội trưởng trở thành bộ nhớ thủ công của cả đội. Fball bắt đầu từ việc trả lại trạng thái đó cho tập thể, rồi mới mở rộng sang quỹ, tìm đội và ghép trận.", en: "A grassroots team has a simple rhythm: when is the match, who is coming and how will the sides be split? When those answers sit inside hundreds of messages, the captain becomes the team's manual memory. Fball began by giving that state back to the whole club, then expanded into funds and discovery.", ja: "草サッカーチームの基本は、いつ試合か、誰が来るか、どう分けるかです。その答えが大量のメッセージに埋もれると、キャプテンがチーム全体の手動メモリになります。Fballはその状態をチームに返すところから始めました。", zh: "业余球队的节奏很简单：什么时候比赛、谁会来、如何分队。当答案埋在数百条消息里，队长就成了全队的人工记忆。Fball先把这些状态还给整个团队，再扩展到球队资金与公开发现。" },
    },
  },
  "payment-infrastructure": {
    metrics: [
      ["5", { vi: "giai đoạn từ intent đến webhook", en: "stages from intent to webhook delivery", ja: "intentからWebhook配信までの段階", zh: "从意图到Webhook投递的阶段" }],
      ["1×", { vi: "mục tiêu commit trạng thái nghiệp vụ", en: "target business-state commit", ja: "業務状態コミットの目標回数", zh: "业务状态提交目标次数" }],
      ["3", { vi: "lớp bảo vệ: matching, idempotency, audit", en: "safeguards: matching, idempotency and audit", ja: "照合、冪等性、監査の保護層", zh: "匹配、幂等与审计三层保护" }],
    ],
    stack: [
      ["Intent", "Reference · amount · validity window", { vi: "Định nghĩa điều hệ thống đang chờ trước khi nhận tín hiệu ngoài.", en: "Define what the system expects before external evidence arrives.", ja: "外部証拠が届く前に期待値を定義する。", zh: "在外部证据到达前定义系统预期。" }, { vi: "Matching có điều kiện rõ thay vì suy đoán từ một màn hình thành công.", en: "Matching uses explicit conditions instead of trusting a success screen.", ja: "成功画面を信じず、明示条件で照合する。", zh: "匹配依据明确条件，而不是相信成功页面。" }],
      ["State transition", "Matching rules · idempotency key · audit store", { vi: "Một tín hiệu có thể lặp lại nhưng nghiệp vụ chỉ được đổi một lần.", en: "A signal may repeat while business state changes only once.", ja: "信号は繰り返されても、業務状態は一度だけ変わる。", zh: "信号可以重复，但业务状态只能变化一次。" }, { vi: "Retry không tạo lại hành động merchant và mọi quyết định có lịch sử.", en: "Retries do not repeat merchant actions and every decision remains inspectable.", ja: "再試行で加盟店アクションを重複せず、判断履歴を残す。", zh: "重试不会重复商户动作，并保留每次决策历史。" }],
      ["Delivery", "Signed webhook · retry policy · delivery log", { vi: "Merchant state và trạng thái gửi cần hai vòng đời riêng.", en: "Merchant state and delivery state need separate lifecycles.", ja: "加盟店状態と配信状態は別のライフサイクルが必要。", zh: "商户状态与投递状态需要独立生命周期。" }, { vi: "Có thể phục hồi delivery mà không đảo ngược confirmation đã ghi nhận.", en: "Delivery can recover without undoing a confirmed state transition.", ja: "確認済み状態を戻さずに配信だけ回復できる。", zh: "可以恢复投递，而无需撤销已确认的状态变更。" }],
    ],
    decisions: [
      [{ vi: "Bằng chứng trước merchant state", en: "Evidence before merchant state", ja: "加盟店状態より先に証拠", zh: "先有证据，再改商户状态" }, { vi: "UI thành công không chứng minh giao dịch đã được đối chiếu đúng.", en: "A successful UI does not prove that a transaction was matched correctly.", ja: "成功UIは取引が正しく照合された証明ではない。", zh: "成功界面不能证明交易已被正确匹配。" }, { vi: "Chỉ commit sau khi amount, reference và thời gian vượt qua rule rõ ràng.", en: "Commit only after amount, reference and time satisfy explicit rules.", ja: "金額、参照、時間が明示ルールを満たした後だけコミットする。", zh: "只有金额、参考号与时间满足明确规则后才提交。" }, { vi: "Luồng dài hơn happy path, đổi lại có thể giải thích sai lệch và phục hồi.", en: "The happy path becomes longer, but mismatches and recovery become explainable.", ja: "正常系は長くなるが、不一致と回復を説明できる。", zh: "正常路径更长，但异常与恢复过程可以解释。" }],
      [{ vi: "Ghi trước, gửi sau", en: "Commit first, deliver second", ja: "先に記録、後で配信", zh: "先提交，再投递" }, { vi: "Webhook có thể timeout hoặc được gửi lại nhiều lần.", en: "Webhook delivery can time out or repeat.", ja: "Webhook配信はタイムアウトや重複が起きる。", zh: "Webhook投递可能超时或重复。" }, { vi: "Ghi trạng thái idempotent trước, sau đó gửi sự kiện có chữ ký và retry độc lập.", en: "Commit idempotently, then send a signed event with an independent retry lifecycle.", ja: "冪等に記録し、その後署名イベントを独立した再試行で配信する。", zh: "先幂等提交，再以独立重试生命周期发送签名事件。" }, { vi: "Cần audit log và worker phục hồi, nhưng không đánh đổi tính đúng đắn của merchant state.", en: "It requires an audit log and recovery worker without compromising merchant-state correctness.", ja: "監査ログと回復ワーカーが必要だが、加盟店状態の正しさを守れる。", zh: "需要审计日志与恢复任务，但不会牺牲商户状态正确性。" }],
    ],
    visuals: ["/images/projects/payment-research.webp", "/images/blog/payment-evidence-first.webp", "/images/blog/payment-evidence-first-detail.webp"],
    fieldNote: {
      title: { vi: "Luồng thuận lợi là demo; lịch sử lỗi mới là sản phẩm.", en: "The happy path is a demo; the failure history is the product.", ja: "正常系はデモであり、失敗履歴こそプロダクト。", zh: "顺利路径只是演示，失败历史才是产品。" },
      body: { vi: "Nghiên cứu này bắt đầu từ một câu hỏi khó chịu: nếu người dùng thấy “thành công” nhưng webhook thất bại thì đơn hàng đang ở trạng thái nào? Khi theo câu hỏi đó đến cùng, checkout không còn là trung tâm. Intent, matching, idempotency, audit và recovery mới là phần quyết định liệu merchant có thể tin vào tín hiệu hay không.", en: "This research began with an uncomfortable question: if the user sees success but the webhook fails, what state is the order in? Following that question moves the centre away from checkout. Intent, matching, idempotency, audit and recovery determine whether a merchant can trust the signal.", ja: "この研究は、ユーザーには成功と見えてWebhookが失敗した時、注文はどの状態なのかという問いから始まりました。問いを追うと中心はcheckoutではなく、intent、照合、冪等性、監査、回復へ移ります。", zh: "这项研究始于一个不舒服的问题：用户看到成功，但Webhook失败时，订单究竟是什么状态？沿着这个问题追下去，中心不再是结账页面，而是意图、匹配、幂等、审计与恢复。" },
    },
  },
} as const;

export function getProjectEvidence(slug: string, locale: Locale): ProjectEvidence | null {
  const source = evidenceByProject[slug as keyof typeof evidenceByProject];
  if (!source) return null;
  const projectName = slug === "logivn" ? "LogiVN" : slug === "fball" ? "Fball.vn" : "Payment Operations";
  return {
    metrics: source.metrics.map(([value, label]) => ({ value, label: pick(locale, label), note: pick(locale, common.verified) })),
    stack: source.stack.map(([layer, technology, reason, effect]) => ({ layer, technology, reason: pick(locale, reason), effect: pick(locale, effect) })),
    decisions: source.decisions.map(([title, context, decision, tradeoff]) => ({ title: pick(locale, title), context: pick(locale, context), decision: pick(locale, decision), tradeoff: pick(locale, tradeoff) })),
    visuals: source.visuals.map((src, index) => {
      const capture = src.includes("-capture") || src.includes("showcase");
      const realProductVisual = capture || src.includes("operations-v2");
      const caption = pick(locale, realProductVisual ? common.productCapture : common.modelCaption);
      const modelIndex = capture ? index - 1 : index;
      return {
        src,
        alt: `${projectName} — ${caption}`,
        caption,
        kind: capture ? "capture" : modelIndex === 0 ? "system" : modelIndex === 1 ? "flow" : "detail",
      };
    }),
    fieldNote: {
      eyebrow: caseStudyLabels(locale).fieldNote,
      title: pick(locale, source.fieldNote.title),
      body: pick(locale, source.fieldNote.body),
      image: "/images/tung-hero-v2.webp",
      alt: pick(locale, common.portraitAlt),
    },
  };
}

export function getSkillGroups(locale: Locale): SkillGroup[] {
  const level = {
    shipped: pick(locale, { vi: "Đã triển khai", en: "Shipped", ja: "実装済み", zh: "已交付" }),
    operated: pick(locale, { vi: "Đang vận hành", en: "Operating", ja: "運用中", zh: "运行中" }),
    researched: pick(locale, { vi: "Đang nghiên cứu", en: "Researching", ja: "研究中", zh: "研究中" }),
  };
  return [
    {
      label: pick(locale, { vi: "Product", en: "Product", ja: "プロダクト", zh: "产品" }),
      description: pick(locale, { vi: "Đóng khung bài toán, trạng thái và phạm vi có thể kiểm chứng.", en: "Frame the problem, states and a scope that can be verified.", ja: "課題、状態、検証可能な範囲を定義する。", zh: "界定问题、状态与可验证的范围。" }),
      skills: [
        { name: pick(locale, { vi: "Định hình sản phẩm", en: "Product framing", ja: "プロダクト定義", zh: "产品定义" }), level: level.operated, evidence: "LogiVN · Fball.vn" },
        { name: pick(locale, { vi: "Mô hình workflow", en: "Workflow modelling", ja: "ワークフローモデリング", zh: "工作流建模" }), level: level.operated, evidence: "Order loop · Match-day loop" },
        { name: pick(locale, { vi: "Kiến trúc thông tin", en: "Information architecture", ja: "情報設計", zh: "信息架构" }), level: level.shipped, evidence: "Guest · Staff · Admin" },
      ],
    },
    {
      label: pick(locale, { vi: "Frontend", en: "Frontend", ja: "フロントエンド", zh: "前端" }),
      description: pick(locale, { vi: "Giao diện responsive, đa ngôn ngữ, ưu tiên quyết định tiếp theo.", en: "Responsive, multilingual interfaces focused on the next decision.", ja: "次の判断を優先するレスポンシブ・多言語UI。", zh: "响应式、多语言，并优先呈现下一步决策。" }),
      skills: [
        { name: "React · Next.js · TypeScript", level: level.operated, evidence: "LogiVN · Fball.vn" },
        { name: "Astro · progressive enhancement", level: level.shipped, evidence: "tung.codes" },
        { name: pick(locale, { vi: "Responsive và accessibility", en: "Responsive and accessibility", ja: "レスポンシブとアクセシビリティ", zh: "响应式与无障碍" }), level: level.shipped, evidence: "VI · EN · JA · ZH" },
      ],
    },
    {
      label: pick(locale, { vi: "Backend và dữ liệu", en: "Backend and data", ja: "バックエンドとデータ", zh: "后端与数据" }),
      description: pick(locale, { vi: "Giữ dữ liệu, quyền truy cập và trạng thái công việc rõ ràng.", en: "Keep data, access and working state clear as the product grows.", ja: "データ、アクセス、業務状態をプロダクトの成長に合わせて明確に保つ。", zh: "让数据、访问权限和工作状态随着产品成长保持清晰。" }),
      skills: [
        { name: "PostgreSQL · Supabase · RLS", level: level.operated, evidence: "LogiVN · Fball.vn" },
        { name: pick(locale, { vi: "Luồng realtime kết nối", en: "Connected realtime workflows", ja: "つながるリアルタイムフロー", zh: "连接式实时流程" }), level: level.operated, evidence: "Order · Kitchen · Attendance" },
        { name: pick(locale, { vi: "Cập nhật dữ liệu tin cậy", en: "Reliable data updates", ja: "信頼できるデータ更新", zh: "可靠的数据更新" }), level: level.researched, evidence: "Zod · Payment research" },
      ],
    },
    {
      label: pick(locale, { vi: "Hạ tầng và vận hành", en: "Infrastructure and operations", ja: "インフラと運用", zh: "基础设施与运营" }),
      description: pick(locale, { vi: "Xây nền tảng ổn định, sẵn sàng thích ứng khi sản phẩm lớn lên.", en: "Build a stable foundation that can adapt as the product grows.", ja: "プロダクトの成長に合わせて適応できる、安定した基盤をつくる。", zh: "打造稳定且能随产品成长调整的基础。" }),
      skills: [
        { name: "Cloudflare Workers · D1 · R2", level: level.operated, evidence: "Portfolio · Shop · CMS" },
        { name: pick(locale, { vi: "Chất lượng phát hành", en: "Release quality", ja: "リリース品質", zh: "发布质量" }), level: level.shipped, evidence: "Worker deployment pipeline" },
        { name: pick(locale, { vi: "Tích hợp dịch vụ linh hoạt", en: "Flexible service integrations", ja: "柔軟なサービス連携", zh: "灵活的服务集成" }), level: level.operated, evidence: "Maps · VietQR · AI · Telegram" },
      ],
    },
  ];
}
