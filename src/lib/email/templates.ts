import type { TransactionalEmailMessage } from "./provider";
import { loadFulfilledOrderEmailKeys, type DeliveryKeyGroup, type ShopEmailCryptoBindings } from "./delivery";

export type ShopOrderEmailTopic =
  | "shop.order.created"
  | "shop.order.payment_confirmed"
  | "shop.order.fulfilled";

export type TransactionalEmailTopic =
  | ShopOrderEmailTopic
  | "shop.customer.welcome"
  | "contact.submission.confirmed";

export type TransactionalEmailSource = "shop" | "contact";

type EmailLocale = "vi" | "en" | "ja" | "zh";

type ShopOrderEmailRow = {
  order_number: string;
  locale: EmailLocale;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  customer_email_snapshot: string;
  customer_name_snapshot: string;
  expires_at: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
};

type ShopOrderItemEmailRow = {
  product_title_snapshot: string;
  variant_title_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  total_minor: number;
};

type ContactEmailRow = {
  name: string;
  email: string;
  locale: EmailLocale;
  created_at: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !emailPattern.test(email)) throw new Error("email_recipient_invalid");
  return email;
}

function localeOf(value: string): EmailLocale {
  return value === "en" || value === "ja" || value === "zh" ? value : "vi";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("email_public_origin_invalid");
  }
  return url.origin;
}

function formatMoney(amountMinor: number, currency: string, locale: EmailLocale) {
  const localeTag = locale === "vi" ? "vi-VN" : locale === "ja" ? "ja-JP" : locale === "zh" ? "zh-CN" : "en-US";
  try {
    const formatter = new Intl.NumberFormat(localeTag, { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "symbol" });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / (10 ** fractionDigits));
  } catch {
    return `${amountMinor.toLocaleString("en-US")} ${currency}`;
  }
}

function shopStoreUrl(origin: string, locale: EmailLocale) {
  return `${safeOrigin(origin)}${locale === "vi" ? "" : `/${locale}`}/shop`;
}

const shopCopy = {
  vi: {
    createdSubject: (number: string) => `TUNG Shop đã nhận đơn ${number}`,
    paidSubject: (number: string) => `Đã xác nhận thanh toán đơn ${number}`,
    fulfilledSubject: (number: string) => `Đơn ${number} đã sẵn sàng` ,
    hello: (name: string) => `Xin chào ${name},`,
    created: "Đơn hàng của bạn đã được tạo và hàng đã được giữ trong thời gian thanh toán.",
    paid: "Thanh toán đã được xác minh. TUNG Shop đang xử lý giao hàng theo đúng trạng thái kho.",
    fulfilled: "Đơn hàng đã hoàn tất. License key được bảo vệ và chỉ hiển thị khi bạn bật gửi key qua email.",
    fulfilledWithKeys: "Đơn hàng đã hoàn tất. Các license key của bạn được liệt kê bên dưới. Hãy lưu trữ an toàn và không chia sẻ.",
    keys: "License key",
    mailboxRisk: "Email có thể được chuyển tiếp, lưu trữ hoặc quét bởi nhà cung cấp hộp thư. Trang giao hàng được bảo vệ vẫn là nơi an toàn hơn.",
    action: "Mở TUNG Shop",
    total: "Tổng thanh toán",
    items: "Sản phẩm",
    privacy: "TUNG Shop không bao giờ yêu cầu bạn gửi lại mật khẩu, mã OTP hoặc license key qua email.",
  },
  en: {
    createdSubject: (number: string) => `TUNG Shop received order ${number}`,
    paidSubject: (number: string) => `Payment confirmed for order ${number}`,
    fulfilledSubject: (number: string) => `Order ${number} is ready`,
    hello: (name: string) => `Hello ${name},`,
    created: "Your order was created and inventory is reserved during the payment window.",
    paid: "Payment has been verified. TUNG Shop is processing delivery against the reserved inventory.",
    fulfilled: "Your order is complete. License keys are protected and appear here only when email delivery is explicitly enabled.",
    fulfilledWithKeys: "Your order is complete. Your license keys are listed below. Store them securely and do not share them.",
    keys: "License keys",
    mailboxRisk: "Email can be forwarded, retained, or scanned by your mailbox provider. The protected order page remains safer.",
    action: "Open TUNG Shop",
    total: "Total",
    items: "Items",
    privacy: "TUNG Shop will never ask you to reply with a password, OTP, or license key.",
  },
  ja: {
    createdSubject: (number: string) => `TUNG Shop 注文 ${number} を受け付けました`,
    paidSubject: (number: string) => `注文 ${number} の支払いを確認しました`,
    fulfilledSubject: (number: string) => `注文 ${number} の準備が完了しました`,
    hello: (name: string) => `${name} 様`,
    created: "ご注文を作成し、支払い期限まで在庫を確保しました。",
    paid: "お支払いを確認しました。確保済み在庫に基づいて配送処理を進めています。",
    fulfilled: "ご注文が完了しました。ライセンスキーは、メール配送を明示的に有効にした場合のみ記載されます。",
    fulfilledWithKeys: "ご注文が完了しました。ライセンスキーを以下に記載します。安全に保管し、共有しないでください。",
    keys: "ライセンスキー",
    mailboxRisk: "メールは転送、保存、プロバイダーによるスキャンが行われる可能性があります。保護された注文ページの方が安全です。",
    action: "TUNG Shop を開く",
    total: "合計",
    items: "商品",
    privacy: "TUNG Shop がメール返信でパスワード、OTP、ライセンスキーを求めることはありません。",
  },
  zh: {
    createdSubject: (number: string) => `TUNG Shop 已收到订单 ${number}`,
    paidSubject: (number: string) => `订单 ${number} 已确认付款`,
    fulfilledSubject: (number: string) => `订单 ${number} 已准备完成`,
    hello: (name: string) => `${name}，您好：`,
    created: "订单已创建，库存会在付款时限内为您保留。",
    paid: "付款已验证，TUNG Shop 正根据已锁定库存处理交付。",
    fulfilled: "订单已完成。只有在明确开启邮件交付时，本邮件才会显示许可证密钥。",
    fulfilledWithKeys: "订单已完成。您的许可证密钥列在下方。请安全保存，不要分享。",
    keys: "许可证密钥",
    mailboxRisk: "邮件可能被转发、保存或由邮箱提供商扫描。受保护的订单页面更安全。",
    action: "打开 TUNG Shop",
    total: "合计",
    items: "商品",
    privacy: "TUNG Shop 不会要求您通过邮件回复密码、验证码或许可证密钥。",
  },
} as const;

const contactCopy = {
  vi: { subject: "TUNG Shop đã nhận được yêu cầu của bạn", hello: (name: string) => `Xin chào ${name},`, body: "Biểu mẫu của bạn đã được tiếp nhận an toàn. Chúng tôi sẽ phản hồi qua đúng địa chỉ email này.", privacy: "Không gửi mật khẩu, OTP, license key hoặc dữ liệu thanh toán qua email phản hồi." },
  en: { subject: "TUNG Shop received your request", hello: (name: string) => `Hello ${name},`, body: "Your form was received securely. We will respond using this email address.", privacy: "Do not send passwords, OTPs, license keys, or payment data in an email reply." },
  ja: { subject: "TUNG Shop がお問い合わせを受け付けました", hello: (name: string) => `${name} 様`, body: "フォームを安全に受け付けました。このメールアドレス宛に返信いたします。", privacy: "メール返信にパスワード、OTP、ライセンスキー、決済情報を含めないでください。" },
  zh: { subject: "TUNG Shop 已收到您的请求", hello: (name: string) => `${name}，您好：`, body: "您的表单已安全接收，我们会通过此邮箱回复。", privacy: "请勿在邮件回复中发送密码、验证码、许可证密钥或付款信息。" },
} as const;

function emailShell(title: string, greeting: string, body: string, detailsHtml: string, action?: { label: string; url: string }, privacy?: string) {
  const actionHtml = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;border-radius:10px;background:#0f766e;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f0;color:#17201d;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="border:1px solid #d8ded9;border-radius:18px;background:#fff;padding:28px"><p style="margin:0 0 20px;color:#0f766e;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">TUNG Shop</p><h1 style="margin:0 0 18px;font-size:26px;line-height:1.2">${escapeHtml(title)}</h1><p>${escapeHtml(greeting)}</p><p style="line-height:1.65">${escapeHtml(body)}</p>${detailsHtml}${actionHtml}<p style="margin-top:26px;border-top:1px solid #e3e7e4;padding-top:18px;color:#59635e;font-size:13px;line-height:1.6">${escapeHtml(privacy ?? "")}</p></div></div></body></html>`;
}

export async function buildShopOrderEmail(
  db: D1Database,
  topic: ShopOrderEmailTopic,
  orderId: string,
  options: {
    origin: string;
    from: { email: string; name?: string };
    deliverKeysByEmail?: boolean;
    cryptoBindings?: ShopEmailCryptoBindings;
  },
): Promise<TransactionalEmailMessage> {
  const order = await db.prepare(`SELECT order_number, locale, status, payment_status, fulfillment_status, currency,
      subtotal_minor, discount_minor, total_minor, customer_email_snapshot, customer_name_snapshot,
      expires_at, paid_at, fulfilled_at
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(orderId).first<ShopOrderEmailRow>();
  if (!order) throw new Error("email_aggregate_not_found");
  if (topic === "shop.order.payment_confirmed" && order.payment_status !== "paid") throw new Error("email_order_not_paid");
  if (topic === "shop.order.fulfilled" && order.fulfillment_status !== "fulfilled") throw new Error("email_order_not_fulfilled");
  const items = await db.prepare(`SELECT product_title_snapshot, variant_title_snapshot, sku_snapshot, quantity, total_minor
    FROM shop_order_items WHERE order_id = ? ORDER BY line_number, id LIMIT 100`).bind(orderId).all<ShopOrderItemEmailRow>();
  if (!items.results.length) throw new Error("email_order_items_missing");
  const locale = localeOf(order.locale);
  const copy = shopCopy[locale];
  const subject = topic === "shop.order.created"
    ? copy.createdSubject(order.order_number)
    : topic === "shop.order.payment_confirmed"
      ? copy.paidSubject(order.order_number)
      : copy.fulfilledSubject(order.order_number);
  const deliveryKeys: DeliveryKeyGroup[] = topic === "shop.order.fulfilled" && options.deliverKeysByEmail
    ? await loadFulfilledOrderEmailKeys(db, orderId, options.cryptoBindings ?? {})
    : [];
  const body = topic === "shop.order.created" ? copy.created : topic === "shop.order.payment_confirmed" ? copy.paid : deliveryKeys.length ? copy.fulfilledWithKeys : copy.fulfilled;
  const itemText = items.results.map((item) => `${item.quantity} x ${item.variant_title_snapshot || item.product_title_snapshot} (${item.sku_snapshot})`).join("\n");
  const total = formatMoney(order.total_minor, order.currency, locale);
  const text = `${subject}\n\n${copy.hello(order.customer_name_snapshot)}\n${body}\n\n${copy.items}:\n${itemText}\n\n${copy.total}: ${total}\n${shopStoreUrl(options.origin, locale)}\n\n${copy.privacy}`;
  const keyText = deliveryKeys.flatMap((group) => group.keys.map((key, index) => `${group.variantTitle || group.productTitle} · ${group.sku} #${index + 1}: ${key}`)).join("\n");
  const keyHtml = deliveryKeys.length
    ? `<div style="margin:22px 0;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0;padding:16px"><p style="margin:0 0 10px;font-weight:800">${escapeHtml(copy.keys)}</p>${deliveryKeys.map((group) => `<p style="margin:12px 0 6px;font-weight:700">${escapeHtml(group.variantTitle || group.productTitle)} <span style="color:#66716b">(${escapeHtml(group.sku)})</span></p>${group.keys.map((key) => `<code style="display:block;margin:6px 0;padding:10px;border-radius:8px;background:#fff;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(key)}</code>`).join("")}`).join("")}<p style="margin:14px 0 0;color:#59635e;font-size:13px;line-height:1.6">${escapeHtml(copy.mailboxRisk)}</p></div>`
    : "";
  const detailsHtml = `<div style="margin:22px 0;border-radius:12px;background:#f5f7f5;padding:16px"><p style="margin:0 0 10px;font-weight:700">${escapeHtml(copy.items)}</p><ul style="margin:0;padding-left:20px">${items.results.map((item) => `<li style="margin:7px 0">${item.quantity} × ${escapeHtml(item.variant_title_snapshot || item.product_title_snapshot)} <span style="color:#66716b">(${escapeHtml(item.sku_snapshot)})</span></li>`).join("")}</ul><p style="margin:16px 0 0;font-weight:800">${escapeHtml(copy.total)}: ${escapeHtml(total)}</p></div>${keyHtml}`;
  const deliveryText = keyText ? `\n\n${copy.keys}:\n${keyText}\n\n${copy.mailboxRisk}` : "";
  return {
    to: { email: normalizedEmail(order.customer_email_snapshot), name: order.customer_name_snapshot.slice(0, 100) },
    from: { email: normalizedEmail(options.from.email), ...(options.from.name ? { name: options.from.name.slice(0, 100) } : {}) },
    subject,
    text: `${text}${deliveryText}`,
    html: emailShell(subject, copy.hello(order.customer_name_snapshot), body, detailsHtml, { label: copy.action, url: shopStoreUrl(options.origin, locale) }, copy.privacy),
  };
}

export async function buildContactConfirmationEmail(
  db: D1Database,
  submissionId: string,
  options: { from: { email: string; name?: string } },
): Promise<TransactionalEmailMessage> {
  const contact = await db.prepare("SELECT name, email, locale, created_at FROM contact_submissions WHERE id = ? LIMIT 1")
    .bind(submissionId).first<ContactEmailRow>();
  if (!contact) throw new Error("email_aggregate_not_found");
  const locale = localeOf(contact.locale);
  const copy = contactCopy[locale];
  const text = `${copy.subject}\n\n${copy.hello(contact.name)}\n${copy.body}\n\n${copy.privacy}`;
  return {
    to: { email: normalizedEmail(contact.email), name: contact.name.slice(0, 100) },
    from: { email: normalizedEmail(options.from.email), ...(options.from.name ? { name: options.from.name.slice(0, 100) } : {}) },
    subject: copy.subject,
    text,
    html: emailShell(copy.subject, copy.hello(contact.name), copy.body, "", undefined, copy.privacy),
  };
}
