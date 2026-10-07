/**
 * Shop 24/7 Automated Support and Activation Assistant.
 * Provides instant answers for software key activation, warranty, and common troubleshooting.
 */

import type { ShopLocale } from "./types";

export type AssistantTopic = "windows_activation" | "office_activation" | "chatgpt_guide" | "edu_mail_login" | "vpn_setup" | "warranty_policy" | "order_tracking" | "general_faq";

export type AssistantResponse = {
  topic: AssistantTopic;
  title: string;
  answer: string;
  steps?: string[];
  helpLinks?: Array<{ title: string; url: string }>;
};

const KNOWLEDGE_BASE: Record<AssistantTopic, Record<ShopLocale, AssistantResponse>> = {
  windows_activation: {
    vi: {
      topic: "windows_activation",
      title: "Hướng dẫn kích hoạt Windows 10/11 Pro",
      answer: "Để kích hoạt bản quyền Windows, bạn hãy vào Cài đặt và nhập mã bản quyền (Product Key) nhận được.",
      steps: [
        "1. Mở Cài đặt (Settings) -> Chọn Hệ thống (System) -> Kích hoạt (Activation).",
        "2. Nhấn 'Thay đổi mã sản phẩm' (Change product key).",
        "3. Nhập key gồm 25 ký tự và nhấn 'Kích hoạt' (Activate).",
      ],
    },
    en: {
      topic: "windows_activation",
      title: "Windows 10/11 Pro Activation Guide",
      answer: "To activate Windows, navigate to Settings and enter your 25-character product key.",
      steps: [
        "1. Open Settings -> System -> Activation.",
        "2. Click 'Change product key'.",
        "3. Enter the 25-character key and select 'Activate'.",
      ],
    },
    ja: {
      topic: "windows_activation",
      title: "Windows 10/11 Pro 有効化手順",
      answer: "設定画面からプロダクトキーを入力して有効化します。",
      steps: [
        "1. 設定 -> システム -> ライセンス認証を開きます。",
        "2. 「プロダクトキーの変更」を選択します。",
        "3. 25桁のキーを入力して「認証」をクリックします。",
      ],
    },
    zh: {
      topic: "windows_activation",
      title: "Windows 10/11 Pro 激活教程",
      answer: "进入系统设置并输入25位激活码即可完成激活。",
      steps: [
        "1. 打开设置 -> 系统 -> 激活。",
        "2. 点击'更改产品密钥'。",
        "3. 输入25位密钥并点击'激活'。",
      ],
    },
  },
  chatgpt_guide: {
    vi: {
      topic: "chatgpt_guide",
      title: "Hướng dẫn sử dụng tài khoản ChatGPT Plus",
      answer: "Đăng nhập trực tiếp tại chatgpt.com bằng email và mật khẩu được cấp.",
      steps: [
        "1. Truy cập https://chatgpt.com/ và bấm 'Log in'.",
        "2. Nhập email và mật khẩu tài khoản.",
        "3. Không đổi email liên kết để đảm bảo quyền lợi bảo hành.",
      ],
    },
    en: {
      topic: "chatgpt_guide",
      title: "ChatGPT Plus Login & Usage Guide",
      answer: "Sign in directly at chatgpt.com using the provided credentials.",
      steps: [
        "1. Go to https://chatgpt.com/ and click 'Log in'.",
        "2. Enter your account email and password.",
        "3. Do not alter the recovery email to keep warranty active.",
      ],
    },
    ja: {
      topic: "chatgpt_guide",
      title: "ChatGPT Plus ログイン手順",
      answer: "提供された認証情報で chatgpt.com にログインしてください。",
      steps: [
        "1. https://chatgpt.com/ にアクセスしログインをクリックします。",
        "2. メールアドレスとパスワードを入力します。",
      ],
    },
    zh: {
      topic: "chatgpt_guide",
      title: "ChatGPT Plus 使用说明",
      answer: "请使用提供的账号密码直接登录 chatgpt.com。",
      steps: [
        "1. 访问 https://chatgpt.com/ 并点击登录。",
        "2. 输入账号邮箱和密码。",
      ],
    },
  },
  warranty_policy: {
    vi: {
      topic: "warranty_policy",
      title: "Chính sách bảo hành & Đổi trả",
      answer: "Toàn bộ sản phẩm số được bảo hành 1 đổi 1 trong suốt thời hạn gói dịch vụ đã mua.",
      steps: [
        "1. Lỗi key không kích hoạt được: Đổi key mới trong 5 phút.",
        "2. Hỗ trợ kỹ thuật 24/7 qua Telegram Bot.",
      ],
    },
    en: {
      topic: "warranty_policy",
      title: "Warranty and Replacement Policy",
      answer: "All digital items include a 1-to-1 replacement warranty for their full subscription duration.",
      steps: [
        "1. Invalid key: Instant replacement within 5 minutes.",
        "2. 24/7 priority support via Telegram Bot.",
      ],
    },
    ja: {
      topic: "warranty_policy",
      title: "保証・交換ポリシー",
      answer: "すべてのデジタル商品は利用期間中1対1の無償交換保証が付帯します。",
    },
    zh: {
      topic: "warranty_policy",
      title: "售后与质保政策",
      answer: "所有数字商品在订阅有效期内均享受1对1免费换新保障。",
    },
  },
  office_activation: {
    vi: { topic: "office_activation", title: "Kích hoạt Microsoft Office", answer: "Truy cập setup.office.com và đăng nhập tài khoản Microsoft để đổi key." },
    en: { topic: "office_activation", title: "Microsoft Office Activation", answer: "Visit setup.office.com, log in to your Microsoft account, and redeem your key." },
    ja: { topic: "office_activation", title: "Office 有効化", answer: "setup.office.com にアクセスしてキーを認証してください。" },
    zh: { topic: "office_activation", title: "Office 激活教程", answer: "访问 setup.office.com 并登录微软账号兑换密钥。" },
  },
  edu_mail_login: {
    vi: { topic: "edu_mail_login", title: "Đăng nhập Mail Edu", answer: "Đăng nhập tại mail.google.com hoặc outlook.com theo đúng tên miền trường." },
    en: { topic: "edu_mail_login", title: "Edu Mail Login", answer: "Sign in at mail.google.com or outlook.com depending on your university portal." },
    ja: { topic: "edu_mail_login", title: "学生メールログイン", answer: "大学ポータルまたはGmail/Outlookからログインしてください。" },
    zh: { topic: "edu_mail_login", title: "教育邮箱登录", answer: "根据学校系统直接在 Gmail 或 Outlook 登录。" },
  },
  vpn_setup: {
    vi: { topic: "vpn_setup", title: "Cài đặt VPN", answer: "Tải app chính thức của nhà cung cấp và đăng nhập bằng tài khoản được cấp." },
    en: { topic: "vpn_setup", title: "VPN Setup Guide", answer: "Download the official app and sign in with the provided credentials." },
    ja: { topic: "vpn_setup", title: "VPN 設定手順", answer: "公式アプリをダウンロードしてログインしてください。" },
    zh: { topic: "vpn_setup", title: "VPN 配置教程", answer: "下载官方客户端并使用所提供的账号登录即可。" },
  },
  order_tracking: {
    vi: { topic: "order_tracking", title: "Tra cứu đơn hàng", answer: "Bạn có thể xem lại mã key bất cứ lúc nào trong mục 'Đơn hàng của tôi' tại trang tài khoản hoặc link đơn hàng." },
    en: { topic: "order_tracking", title: "Order Tracking", answer: "View and reveal your license keys anytime in your account dashboard under 'My Orders'." },
    ja: { topic: "order_tracking", title: "注文の確認", answer: "マイアカウントの「注文履歴」からいつでもキーを確認できます。" },
    zh: { topic: "order_tracking", title: "订单与卡密查询", answer: "随时可以在个人中心的'我的订单'中查看已购卡密。" },
  },
  general_faq: {
    vi: { topic: "general_faq", title: "Câu hỏi thường gặp", answer: "Hệ thống bàn giao key tự động ngay sau khi xác nhận thanh toán thành công." },
    en: { topic: "general_faq", title: "General FAQ", answer: "Keys and credentials are delivered instantly upon automated payment confirmation." },
    ja: { topic: "general_faq", title: "よくある質問", answer: "決済完了後、自動的にライセンスキーが即時発行されます。" },
    zh: { topic: "general_faq", title: "常见问题", answer: "支付确认后系统将在几秒内自动发送卡密。" },
  },
};

/**
 * Resolves user search intent into a tailored knowledge response.
 */
export function resolveAssistantQuery(
  query: string,
  locale: ShopLocale = "vi",
): AssistantResponse {
  const q = query.toLowerCase();

  if (/windows|win\s*1[01]|product\s*key/i.test(q)) {
    return KNOWLEDGE_BASE.windows_activation[locale] || KNOWLEDGE_BASE.windows_activation.vi;
  }
  if (/office|word|excel|365/i.test(q)) {
    return KNOWLEDGE_BASE.office_activation[locale] || KNOWLEDGE_BASE.office_activation.vi;
  }
  if (/gpt|chatgpt|openai|plus/i.test(q)) {
    return KNOWLEDGE_BASE.chatgpt_guide[locale] || KNOWLEDGE_BASE.chatgpt_guide.vi;
  }
  if (/mail|edu|sinh viên/i.test(q)) {
    return KNOWLEDGE_BASE.edu_mail_login[locale] || KNOWLEDGE_BASE.edu_mail_login.vi;
  }
  if (/vpn|nord|express|surfshark/i.test(q)) {
    return KNOWLEDGE_BASE.vpn_setup[locale] || KNOWLEDGE_BASE.vpn_setup.vi;
  }
  if (/bảo hành|đổi|lỗi|warranty|refund/i.test(q)) {
    return KNOWLEDGE_BASE.warranty_policy[locale] || KNOWLEDGE_BASE.warranty_policy.vi;
  }
  if (/đơn hàng|mã đơn|key ở đâu|order/i.test(q)) {
    return KNOWLEDGE_BASE.order_tracking[locale] || KNOWLEDGE_BASE.order_tracking.vi;
  }

  return KNOWLEDGE_BASE.general_faq[locale] || KNOWLEDGE_BASE.general_faq.vi;
}
