import type { TransactionalEmailMessage } from "./provider";

type AuthEmailLocale = "vi" | "en" | "ja" | "zh";
type AuthAddress = { email: string; name?: string };

const authEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeAuthEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !authEmailPattern.test(email)) throw new Error("email_recipient_invalid");
  return email;
}

function authEscapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function validateAuthUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("email_auth_url_invalid");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("email_auth_url_invalid");
  if (url.username || url.password) throw new Error("email_auth_url_invalid");
  return url.toString();
}

function authLocale(value: string): AuthEmailLocale {
  return value === "en" || value === "ja" || value === "zh" ? value : "vi";
}

function authAddress(value: AuthAddress): AuthAddress {
  return { email: normalizeAuthEmail(value.email), ...(value.name ? { name: value.name.slice(0, 100) } : {}) };
}

function authFrom(value: AuthAddress): AuthAddress {
  return { email: normalizeAuthEmail(value.email), ...(value.name ? { name: value.name.slice(0, 100) } : {}) };
}

function authShell(title: string, greeting: string, body: string, detail: string, action: { label: string; url: string }, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f0;color:#17201d;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="border:1px solid #d8ded9;border-radius:18px;background:#fff;padding:28px"><p style="margin:0 0 20px;color:#0f766e;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">TUNG Shop</p><h1 style="margin:0 0 18px;font-size:26px;line-height:1.2">${authEscapeHtml(title)}</h1><p>${authEscapeHtml(greeting)}</p><p style="line-height:1.65">${authEscapeHtml(body)}</p><div style="margin:22px 0;border-radius:12px;background:#f5f7f5;padding:16px;line-height:1.65">${authEscapeHtml(detail)}</div><p style="margin:24px 0"><a href="${authEscapeHtml(action.url)}" style="display:inline-block;border-radius:10px;background:#0f766e;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">${authEscapeHtml(action.label)}</a></p><p style="margin-top:26px;border-top:1px solid #e3e7e4;padding-top:18px;color:#59635e;font-size:13px;line-height:1.6">${authEscapeHtml(footer)}</p></div></div></body></html>`;
}

const copy = {
  vi: {
    welcomeSubject: "Chào mừng bạn đến TUNG Shop", welcomeTitle: "Tài khoản TUNG Shop đã sẵn sàng", welcomeBody: "Bạn đã đăng ký và đăng nhập thành công. Các đơn hàng dùng cùng email đã xác minh sẽ tự động xuất hiện trong tài khoản.", welcomeDetail: "Từ trang tài khoản, bạn có thể theo dõi đơn hàng, trạng thái thanh toán và mở nội dung giao hàng được bảo vệ.", welcomeAction: "Mở tài khoản", welcomeFooter: "TUNG Shop không bao giờ yêu cầu mật khẩu, OTP hoặc license key qua email. Nếu bạn không thực hiện đăng ký này, hãy liên hệ hỗ trợ.",
    verifySubject: "Xác minh email TUNG Shop", verifyTitle: "Xác minh địa chỉ email", verifyBody: "Hãy xác minh email để hoàn tất đăng ký tài khoản TUNG Shop.", verifyDetail: "Liên kết này chỉ dùng một lần và sẽ hết hạn theo thời gian hiển thị trong ứng dụng.", verifyAction: "Xác minh email", verifyFooter: "Nếu bạn không tạo tài khoản, hãy bỏ qua email này. Không chia sẻ liên kết xác minh.",
    loginSubject: "Cảnh báo đăng nhập TUNG Shop", loginTitle: "Phát hiện lần đăng nhập mới", loginBody: "Một lần đăng nhập mới đã được ghi nhận cho tài khoản của bạn.", loginAction: "Mở cài đặt bảo mật", loginFooter: "Nếu không phải bạn, hãy đổi mật khẩu và liên hệ hỗ trợ ngay.",
    resetSubject: "Đặt lại mật khẩu TUNG Shop", resetTitle: "Yêu cầu đặt lại mật khẩu", resetBody: "Bạn vừa yêu cầu tạo mật khẩu mới cho tài khoản TUNG Shop.", resetDetail: "Liên kết đặt lại chỉ dùng một lần và sẽ hết hạn theo thời gian hiển thị trong ứng dụng.", resetAction: "Đặt lại mật khẩu", resetFooter: "Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu hiện tại vẫn giữ nguyên.",
  },
  en: {
    welcomeSubject: "Welcome to TUNG Shop", welcomeTitle: "Your TUNG Shop account is ready", welcomeBody: "You signed up and signed in successfully. Orders placed with the same verified email are linked to your account automatically.", welcomeDetail: "Use your account to track orders, review payment status, and open protected delivery details.", welcomeAction: "Open your account", welcomeFooter: "TUNG Shop never asks for passwords, OTPs, or license keys by email. Contact support if you did not create this account.",
    verifySubject: "Verify your TUNG Shop email", verifyTitle: "Verify your email address", verifyBody: "Verify your email to finish creating your TUNG Shop account.", verifyDetail: "This link is single-use and expires according to the time shown in the app.", verifyAction: "Verify email", verifyFooter: "If you did not create an account, ignore this email. Never share the verification link.",
    loginSubject: "New TUNG Shop login", loginTitle: "A new login was detected", loginBody: "A new login was recorded for your account.", loginAction: "Open security settings", loginFooter: "If this was not you, change your password and contact support immediately.",
    resetSubject: "Reset your TUNG Shop password", resetTitle: "Password reset requested", resetBody: "A new password was requested for your TUNG Shop account.", resetDetail: "This reset link is single-use and expires according to the time shown in the app.", resetAction: "Reset password", resetFooter: "If you did not request this, ignore the email. Your current password remains unchanged.",
  },
  ja: {
    welcomeSubject: "TUNG Shop へようこそ", welcomeTitle: "TUNG Shop アカウントの準備ができました", welcomeBody: "登録とログインが完了しました。同じ確認済みメールアドレスで購入した注文は、アカウントに自動的に紐づきます。", welcomeDetail: "アカウントページで注文、支払い状況、保護された配送情報を確認できます。", welcomeAction: "アカウントを開く", welcomeFooter: "TUNG Shop がメールでパスワード、OTP、ライセンスキーを求めることはありません。登録に心当たりがない場合はサポートへご連絡ください。",
    verifySubject: "TUNG Shop メールアドレスの確認", verifyTitle: "メールアドレスを確認", verifyBody: "TUNG Shop アカウントの登録を完了するには、メールアドレスを確認してください。", verifyDetail: "このリンクは一度だけ使用でき、アプリに表示された期限で失効します。", verifyAction: "メールを確認", verifyFooter: "登録していない場合は無視してください。確認リンクを共有しないでください。",
    loginSubject: "TUNG Shop 新しいログイン", loginTitle: "新しいログインを検知しました", loginBody: "アカウントへの新しいログインが記録されました。", loginAction: "セキュリティ設定を開く", loginFooter: "身に覚えがない場合は、すぐにパスワードを変更してください。",
    resetSubject: "TUNG Shop パスワード再設定", resetTitle: "パスワード再設定の申請", resetBody: "TUNG Shop アカウントの新しいパスワードが申請されました。", resetDetail: "このリンクは一度だけ使用でき、アプリに表示された期限で失効します。", resetAction: "パスワードを再設定", resetFooter: "申請していない場合は無視してください。現在のパスワードは変更されません。",
  },
  zh: {
    welcomeSubject: "欢迎加入 TUNG Shop", welcomeTitle: "您的 TUNG Shop 账户已准备就绪", welcomeBody: "您已成功注册并登录。使用同一已验证邮箱购买的订单会自动关联到您的账户。", welcomeDetail: "您可以在账户页面跟踪订单、查看付款状态并打开受保护的交付信息。", welcomeAction: "打开账户", welcomeFooter: "TUNG Shop 绝不会通过邮件索要密码、验证码或许可证密钥。如果不是您本人注册，请联系支持。",
    verifySubject: "验证 TUNG Shop 邮箱", verifyTitle: "验证您的邮箱地址", verifyBody: "验证邮箱以完成 TUNG Shop 账户注册。", verifyDetail: "此链接只能使用一次，并会按照应用中显示的时间过期。", verifyAction: "验证邮箱", verifyFooter: "如果您没有注册账户，请忽略此邮件。不要分享验证链接。",
    loginSubject: "TUNG Shop 新登录提醒", loginTitle: "检测到新的登录", loginBody: "您的账户记录了一次新的登录。", loginAction: "打开安全设置", loginFooter: "如果不是您本人，请立即修改密码并联系支持。",
    resetSubject: "重置 TUNG Shop 密码", resetTitle: "请求重置密码", resetBody: "有人请求为您的 TUNG Shop 账户设置新密码。", resetDetail: "此重置链接只能使用一次，并会按照应用中显示的时间过期。", resetAction: "重置密码", resetFooter: "如果不是您发起的请求，请忽略此邮件。当前密码不会改变。",
  },
} as const;

export function buildWelcomeEmail(input: { recipient: AuthAddress; displayName?: string; accountUrl: string; locale?: string; from: AuthAddress }): TransactionalEmailMessage {
  const locale = authLocale(input.locale ?? "vi");
  const text = copy[locale];
  const url = validateAuthUrl(input.accountUrl);
  const name = input.displayName?.trim() || input.recipient.name || input.recipient.email;
  return {
    to: authAddress({ ...input.recipient, name }),
    from: authFrom(input.from),
    subject: text.welcomeSubject,
    text: `${text.welcomeSubject}\n\n${name}\n${text.welcomeBody}\n${text.welcomeDetail}\n\n${url}\n\n${text.welcomeFooter}`,
    html: authShell(text.welcomeTitle, name, text.welcomeBody, text.welcomeDetail, { label: text.welcomeAction, url }, text.welcomeFooter),
  };
}

export function buildSignupVerificationEmail(input: { recipient: AuthAddress; displayName?: string; verificationUrl: string; locale?: string; from: AuthAddress }): TransactionalEmailMessage {
  const locale = authLocale(input.locale ?? "vi"); const text = copy[locale]; const url = validateAuthUrl(input.verificationUrl); const name = input.displayName?.trim() || input.recipient.name || input.recipient.email;
  return { to: authAddress({ ...input.recipient, name }), from: authFrom(input.from), subject: text.verifySubject, text: `${text.verifySubject}\n\n${text.verifyBody}\n${text.verifyDetail}\n\n${url}\n\n${text.verifyFooter}`, html: authShell(text.verifyTitle, name, text.verifyBody, text.verifyDetail, { label: text.verifyAction, url }, text.verifyFooter) };
}

export function buildLoginAlertEmail(input: { recipient: AuthAddress; displayName?: string; occurredAt: string | Date; approximateLocation?: string; deviceSummary?: string; securityUrl: string; locale?: string; from: AuthAddress }): TransactionalEmailMessage {
  const locale = authLocale(input.locale ?? "vi"); const text = copy[locale]; const url = validateAuthUrl(input.securityUrl); const when = new Date(input.occurredAt); if (Number.isNaN(when.getTime())) throw new Error("email_auth_timestamp_invalid"); const name = input.displayName?.trim() || input.recipient.name || input.recipient.email;
  const detail = [when.toISOString(), input.approximateLocation?.trim(), input.deviceSummary?.trim()].filter(Boolean).join(" · ");
  return { to: authAddress({ ...input.recipient, name }), from: authFrom(input.from), subject: text.loginSubject, text: `${text.loginSubject}\n\n${text.loginBody}\n\n${detail}\n\n${url}\n\n${text.loginFooter}`, html: authShell(text.loginTitle, name, text.loginBody, detail, { label: text.loginAction, url }, text.loginFooter) };
}

export function buildPasswordResetEmail(input: { recipient: AuthAddress; displayName?: string; resetUrl: string; expiresAt: string | Date; locale?: string; from: AuthAddress }): TransactionalEmailMessage {
  const locale = authLocale(input.locale ?? "vi"); const text = copy[locale]; const url = validateAuthUrl(input.resetUrl); const expires = new Date(input.expiresAt); if (Number.isNaN(expires.getTime())) throw new Error("email_auth_timestamp_invalid"); const name = input.displayName?.trim() || input.recipient.name || input.recipient.email; const detail = `${text.resetDetail} (${expires.toISOString()})`;
  return { to: authAddress({ ...input.recipient, name }), from: authFrom(input.from), subject: text.resetSubject, text: `${text.resetSubject}\n\n${text.resetBody}\n${detail}\n\n${url}\n\n${text.resetFooter}`, html: authShell(text.resetTitle, name, text.resetBody, detail, { label: text.resetAction, url }, text.resetFooter) };
}

const magicCopy = {
  vi: {
    subject: "Liên kết đăng nhập TUNG Shop",
    title: "Đăng nhập TUNG Shop",
    body: "Nhấn nút bên dưới để đăng nhập. Liên kết chỉ dùng một lần và hết hạn sau vài phút.",
    detail: "Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.",
    action: "Đăng nhập ngay",
    footer: "Không chia sẻ liên kết này. TUNG Shop không bao giờ hỏi mật khẩu qua email.",
  },
  en: {
    subject: "Your TUNG Shop sign-in link",
    title: "Sign in to TUNG Shop",
    body: "Use the button below to sign in. This link works once and expires in a few minutes.",
    detail: "If you did not request this, you can ignore the email.",
    action: "Sign in",
    footer: "Do not share this link. TUNG Shop never asks for a password by email.",
  },
  ja: {
    subject: "TUNG Shop ログインリンク",
    title: "TUNG Shop にログイン",
    body: "下のボタンからログインできます。リンクは一度だけ使え、数分で失効します。",
    detail: "心当たりがない場合はこのメールを無視してください。",
    action: "ログイン",
    footer: "このリンクを共有しないでください。TUNG Shop がメールでパスワードを尋ねることはありません。",
  },
  zh: {
    subject: "TUNG Shop 登录链接",
    title: "登录 TUNG Shop",
    body: "点击下方按钮即可登录。此链接只能使用一次，并会在几分钟后失效。",
    detail: "如果不是您本人请求，请忽略此邮件。",
    action: "立即登录",
    footer: "请勿分享此链接。TUNG Shop 绝不会通过邮件索要密码。",
  },
} as const;

export function buildMagicLinkEmail(input: { recipient: AuthAddress; displayName?: string; magicUrl: string; locale?: string; from: AuthAddress }): TransactionalEmailMessage {
  const locale = authLocale(input.locale ?? "vi");
  const text = magicCopy[locale];
  const url = validateAuthUrl(input.magicUrl);
  const name = input.displayName?.trim() || input.recipient.name || input.recipient.email;
  return {
    to: authAddress({ ...input.recipient, name }),
    from: authFrom(input.from),
    subject: text.subject,
    text: `${text.subject}\n\n${text.body}\n${text.detail}\n\n${url}\n\n${text.footer}`,
    html: authShell(text.title, name, text.body, text.detail, { label: text.action, url }, text.footer),
  };
}
