import type { APIRoute } from "astro";
import { env, waitUntil } from "cloudflare:workers";
import {
  getPublicProductById,
  getPublicVariantContext,
  getPublicVariantLabels,
  listPublicProductSummaries,
  type PublicProductSummary,
} from "../../../lib/shop/repository";
import { deliverCustomerOwnedOrder, ShopConflictError } from "../../../lib/shop/service";
import {
  buyVariantFromTelegram,
  checkoutTelegramCart,
  commerceCopy,
  ensureTelegramCustomer,
  formatShopMoney,
  getTelegramCart,
  listTelegramCustomerOrders,
  menuKeyboard,
  mutateTelegramCart,
  statusForTelegramOrder,
  type TelegramCommerceBindings,
} from "../../../lib/shop/telegram-commerce";
import {
  answerTelegramCallback,
  buildTelegramStartReply,
  buildTelegramStaticReply,
  getTelegramMiniAppEnabledSetting,
  telegramMiniAppUrl,
  claimTelegramUpdate,
  completeTelegramUpdate,
  editTelegramCaption,
  editTelegramMessage,
  failTelegramUpdate,
  parseTelegramCommand,
  readTelegramUpdate,
  sendTelegramChatAction,
  sendTelegramMessage,
  sendTelegramPhoto,
  isTelegramQrPhotoUrl,
  telegramPrivateOnlyReply,
  verifyTelegramWebhookSecret,
  TelegramApiError,
  type TelegramInlineKeyboardButton,
  type TelegramReply,
  type TelegramUpdate,
  type TelegramUser,
} from "../../../lib/shop/telegram";
import { resolveTelegramBotByWebhookSecret } from "../../../lib/shop/telegram-bot-config";
import type { PublicVariant, ShopLocale } from "../../../lib/shop/types";

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function commerceBindings(): TelegramCommerceBindings {
  return {
    CONTENT_DB: env.CONTENT_DB,
    VIETQR_BANK_ACCOUNT: env.VIETQR_BANK_ACCOUNT,
    SHOP_ORDER_TOKEN_SECRET: env.SHOP_ORDER_TOKEN_SECRET,
    PAYOS_CLIENT_ID: env.PAYOS_CLIENT_ID,
    PAYOS_API_KEY: env.PAYOS_API_KEY,
    PAYOS_CHECKSUM_KEY: env.PAYOS_CHECKSUM_KEY,
    SHOP_PUBLIC_ORIGIN: env.SHOP_PUBLIC_ORIGIN,
    SHOP_KEY_ENCRYPTION_SECRET: env.SHOP_KEY_ENCRYPTION_SECRET,
    SHOP_KEY_ENCRYPTION_KEY_VERSION: env.SHOP_KEY_ENCRYPTION_KEY_VERSION,
  };
}

function paymentLabel(status: string, locale: ShopLocale) {
  const c = commerceCopy(locale);
  if (status === "paid") return c.paid;
  return c.unpaid;
}

function miniAppButton(locale: ShopLocale, text?: string, miniAppEnabled = false) {
  if (!miniAppEnabled) return null;
  const url = telegramMiniAppUrl(env.SHOP_PUBLIC_ORIGIN);
  if (!url) return null;
  return { text: text || `✨ Mini App`, web_app: { url } };
}

async function paymentResultReply(
  user: TelegramUser,
  locale: ShopLocale,
  order: { orderId: string; orderNumber: string; orderReference: string; totalMinor: number; currency: string },
  payment: { checkoutUrl?: string; qrUrl?: string; paymentDescription?: string } | null,
  snapshot: Awaited<ReturnType<typeof statusForTelegramOrder>> | null,
): Promise<TelegramReply & { photoUrl?: string | null }> {
  const c = commerceCopy(locale);
  const amount = formatShopMoney(order.totalMinor, order.currency, locale);

  let walletAvailable = 0;
  if (env.CONTENT_DB) {
    try {
      const { getTelegramCustomerWallet } = await import("../../../lib/shop/telegram-commerce");
      const w = await getTelegramCustomerWallet(commerceBindings(), user, locale);
      walletAvailable = order.currency.toUpperCase() === "USD" ? w.balanceUsdMinor : w.balanceVndMinor;
    } catch {}
  }
  const canPayWithWallet = walletAvailable >= order.totalMinor;

  const lines = [
    `🧾 *ĐƠN HÀNG #${order.orderNumber}*`,
    `──────────────────────────────`,
    `💰 Tổng thanh toán: *${amount}*`,
    `🟡 Trạng thái: *Chờ thanh toán*`,
    `──────────────────────────────`,
  ];

  if (canPayWithWallet) {
    lines.push(
      `⚡ *SỐ DƯ VÍ KHẢ DỤNG:*`,
      `Bạn có đủ số dư ví để thanh toán đơn hàng này tức thì!`,
      `👉 Bấm nút *⚡ DÙNG VÍ SỐ DƯ* bên dưới để nhận key ngay trong 1s.`,
      `──────────────────────────────`,
    );
  }

  const qrUrl = payment?.qrUrl || snapshot?.payment?.qr_image_url || null;

  if (qrUrl) {
    lines.push(
      `📸 *THANH TOÁN VIETQR TỰ ĐỘNG:*`,
      `• Quét mã VietQR đính kèm bằng app Ngân hàng của bạn.`,
      `• Hoặc bấm nút *🌐 Mở payOS* bên dưới để mở cổng thanh toán.`,
      `──────────────────────────────`,
      `⚡ Hệ thống tự động xác nhận và giao key ngay 24/7.`,
      `Bấm *🔄 Làm mới trạng thái* sau khi chuyển khoản nếu chưa nhận được key.`,
    );
  } else {
    lines.push(
      `⏳ Đang chuẩn bị cổng thanh toán VietQR...`,
      `Vui lòng bấm nút *🔄 Làm mới trạng thái* sau vài giây nếu chưa thấy mã QR.`,
    );
  }

  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [];

  if (canPayWithWallet) {
    rows.push([{ text: `⚡ DÙNG VÍ SỐ DƯ (Nhận Key Ngay 1s)`, callback_data: `wp:${order.orderId}` }]);
  }

  rows.push([{ text: `🔄 ${c.refresh}`, callback_data: `rf:${order.orderId}` }]);

  const checkoutUrl = payment?.checkoutUrl || snapshot?.payment?.checkout_url;
  if (checkoutUrl?.startsWith("https://")) {
    rows[rows.length - 1].push({ text: `🌐 ${c.openPay}`, url: checkoutUrl });
  }

  rows.push([
    { text: `💳 Nạp Tiền Vào Ví`, callback_data: "topup" },
    { text: `📦 ${c.myOrders}`, callback_data: "my" },
  ]);
  rows.push([{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }]);

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
    photoUrl: isTelegramQrPhotoUrl(qrUrl) ? qrUrl : null,
  };
}

function checkoutErrorReply(locale: ShopLocale, error: unknown): TelegramReply {
  const c = commerceCopy(locale);
  if (error instanceof ShopConflictError) {
    if (error.code === "checkout_rate_limited") return { text: c.rateLimited, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
    if (error.code === "customer_blocked") return { text: c.blocked, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
    if (error.code === "cart_empty") return { text: c.cartEmpty, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
    if (error.code === "cart_full") return { text: c.cartFull, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
    if (error.code === "discount_invalid" || error.code === "discount_not_applicable" || error.code === "discount_outside_window" || error.code === "discount_limit_reached" || error.code === "discount_customer_limit_reached" || error.code === "discount_minimum_not_met" || error.code === "discount_currency_mismatch") {
      return { text: c.discountInvalid, replyMarkup: { inline_keyboard: [[{ text: c.cart, callback_data: "cart" }], [{ text: c.backMenu, callback_data: "menu" }]] } };
    }
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "customer_blocked") return { text: c.blocked, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
  return { text: c.buyFailed, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
}

function categoryToken(slug: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < slug.length; index += 1) {
    hash = Math.imul(hash ^ slug.charCodeAt(index), 16_777_619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function catalogGroups(products: PublicProductSummary[], locale: ShopLocale) {
  const c = commerceCopy(locale);
  const groups = new Map<string, { token: string; slug: string; title: string; products: PublicProductSummary[] }>();
  for (const product of products) {
    const slug = product.categorySlug || "uncategorized";
    const current = groups.get(slug) ?? {
      token: categoryToken(slug),
      slug,
      title: product.category || c.otherCategory,
      products: [],
    };
    current.products.push(product);
    groups.set(slug, current);
  }
  return [...groups.values()];
}

function productPriceLabel(product: PublicProductSummary, locale: ShopLocale) {
  const c = commerceCopy(locale);
  const minimum = formatShopMoney(product.minPriceMinor, product.currency, locale);
  if (product.minPriceMinor === product.maxPriceMinor) return minimum;
  return `${c.from} ${minimum}`;
}

function lowStockLabel(locale: ShopLocale) {
  if (locale === "en") return "Low stock";
  if (locale === "ja") return "残りわずか";
  if (locale === "zh") return "库存紧张";
  return "Sắp hết hàng";
}

function hotLabel(locale: ShopLocale) {
  if (locale === "en") return "Hot";
  if (locale === "ja") return "人気";
  if (locale === "zh") return "热销";
  return "Hot";
}

function strikeThrough(value: string) {
  return [...value].map((character) => character === " " ? character : `${character}\u0336`).join("");
}

function productIsHot(product: PublicProductSummary) {
  return product.soldQuantity30d >= 3;
}

function productStockLabel(product: PublicProductSummary, locale: ShopLocale) {
  const c = commerceCopy(locale);
  if (product.availability === "out_of_stock") return `⛔ ${c.unavailable}`;
  if (product.availability === "low_stock") return `⚠️ ${lowStockLabel(locale)}`;
  return `⚡ Giao tự động`;
}

function humanizeVariantOption(value: unknown, locale: ShopLocale) {
  const text = typeof value === "string"
    ? value.trim()
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";
  if (!text) return "";
  const normalized = text.toLowerCase();
  const duration = /^(\d+)-(day|month|year)s?$/.exec(normalized);
  if (duration) {
    const count = Number(duration[1]);
    const unit = duration[2];
    if (locale === "vi") return `${count} ${unit === "day" ? "ngày" : unit === "month" ? "tháng" : "năm"}`;
    if (locale === "ja") return `${count}${unit === "day" ? "日" : unit === "month" ? "か月" : "年"}`;
    if (locale === "zh") return `${count}${unit === "day" ? "天" : unit === "month" ? "个月" : "年"}`;
    return `${count} ${unit}${count === 1 ? "" : "s"}`;
  }
  return text.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()).slice(0, 40);
}

function variantDisplayName(variant: Pick<PublicVariant, "title" | "optionValues">, locale: ShopLocale) {
  if (variant.title && variant.title.trim().length > 0) {
    return variant.title.trim().slice(0, 64);
  }
  const priority = ["plan", "tier", "package", "edition", "duration", "term", "billingPeriod", "region", "device"];
  const entries = Object.entries(variant.optionValues as Record<string, unknown>).sort(([left], [right]) => {
    const leftIndex = priority.indexOf(left);
    const rightIndex = priority.indexOf(right);
    return (leftIndex < 0 ? priority.length : leftIndex) - (rightIndex < 0 ? priority.length : rightIndex);
  });
  const values = entries.map(([, value]) => humanizeVariantOption(value, locale)).filter(Boolean);
  return (values.length ? values.join(" · ") : "Variant").slice(0, 64);
}

function prioritizeTelegramProducts(products: PublicProductSummary[]) {
  const rank = (product: PublicProductSummary) => {
    const slug = product.slug.toLowerCase();
    if (slug === "chatgpt-plus" || slug.startsWith("chatgpt")) return 0;
    if (slug === "kiro" || slug.startsWith("kiro-")) return 1;
    if (productIsHot(product)) return 2;
    return product.featured ? 3 : 4;
  };
  return products
    .map((product, index) => ({ product, index }))
    .sort((left, right) => rank(left.product) - rank(right.product)
      || right.product.soldQuantity30d - left.product.soldQuantity30d
      || left.index - right.index)
    .map(({ product }) => product);
}

async function loadCatalog(locale: ShopLocale) {
  const products = env.CONTENT_DB ? await listPublicProductSummaries(env.CONTENT_DB, { locale, limit: 100 }) : [];
  return prioritizeTelegramProducts(products);
}

async function buildMainMenuReply(user: TelegramUser, locale: ShopLocale, botName: string, miniAppEnabled = false): Promise<TelegramReply> {
  const { getTelegramCustomerWallet } = await import("../../../lib/shop/telegram-commerce");
  let userStats: { displayName?: string; walletBalance?: string; tierBadge?: string } | undefined;
  if (env.CONTENT_DB) {
    try {
      const wallet = await getTelegramCustomerWallet(commerceBindings(), user, locale);
      userStats = {
        displayName: user.first_name || user.username || "bạn",
        walletBalance: wallet.balanceFormatted,
        tierBadge: wallet.tierBadge,
      };
    } catch {}
  }
  return buildTelegramStartReply(env.SHOP_PUBLIC_ORIGIN, locale, botName, miniAppEnabled, userStats);
}

async function buildCategoryMenuReply(locale: ShopLocale): Promise<TelegramReply> {
  const c = commerceCopy(locale);
  const products = await loadCatalog(locale);
  const groups = catalogGroups(products, locale);
  if (!groups.length) return { text: c.cartEmpty, replyMarkup: menuKeyboard(locale) };
  const lines = [
    `📂 *DANH MỤC SẢN PHẨM:*`,
    `──────────────────────────────`,
    `Chọn danh mục bên dưới để xem sản phẩm theo nhóm:`,
    "",
  ];
  for (const group of groups) {
    const s = group.slug.toLowerCase();
    const icon = s.includes("ai") || s.includes("gpt") ? "🤖"
      : s.includes("edu") || s.includes("mail") ? "🎓"
      : s.includes("dev") || s.includes("tool") || s.includes("code") ? "💻"
      : s.includes("media") || s.includes("ent") || s.includes("giai-tri") ? "🎬"
      : "📦";
    lines.push(`${icon} *${group.title}* (${group.products.length} sản phẩm)`);
  }
  lines.push(`──────────────────────────────`);
  lines.push(`👇 *Chạm vào danh mục để khám phá:*`);

  const catButtons: TelegramInlineKeyboardButton[] = groups.map((group) => {
    const s = group.slug.toLowerCase();
    const icon = s.includes("ai") || s.includes("gpt") ? "🤖"
      : s.includes("edu") || s.includes("mail") ? "🎓"
      : s.includes("dev") || s.includes("tool") || s.includes("code") ? "💻"
      : s.includes("media") || s.includes("ent") || s.includes("giai-tri") ? "🎬"
      : "📦";
    return {
      text: `${icon} ${group.title.slice(0, 24)} (${group.products.length})`,
      callback_data: `cg:${group.token}:0`,
    };
  });

  const rows: TelegramInlineKeyboardButton[][] = [];
  for (let i = 0; i < catButtons.length; i += 2) {
    if (i + 1 < catButtons.length) {
      rows.push([catButtons[i]!, catButtons[i + 1]!]);
    } else {
      rows.push([catButtons[i]!]);
    }
  }
  rows.push([{ text: `🛍️ ${c.allProducts}`, callback_data: "cat:0" }]);
  rows.push([{ text: `🔻 Quay Lại 🔻`, callback_data: "menu" }]);
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: rows } };
}

function buildLanguageMenuReply(locale: ShopLocale): TelegramReply {
  const title = locale === "vi" ? "🌐 *CHỌN NGÔN NGỮ*"
    : locale === "en" ? "🌐 *SELECT LANGUAGE*"
    : locale === "ja" ? "🌐 *言語を選択*"
    : "🌐 *选择语言*";
  const prompt = locale === "vi" ? "Vui lòng chọn ngôn ngữ bạn muốn hiển thị trên Bot:"
    : locale === "en" ? "Please choose your preferred language:"
    : locale === "ja" ? "使用する言語を選択してください:"
    : "请选择您要使用的语言:";

  const rows: TelegramInlineKeyboardButton[][] = [
    [
      { text: `🇻🇳 Tiếng Việt ${locale === "vi" ? "✓" : ""}`, callback_data: "lang:vi" },
      { text: `🇬🇧 English ${locale === "en" ? "✓" : ""}`, callback_data: "lang:en" },
    ],
    [
      { text: `🇯🇵 日本語 ${locale === "ja" ? "✓" : ""}`, callback_data: "lang:ja" },
      { text: `🇨🇳 中文 ${locale === "zh" ? "✓" : ""}`, callback_data: "lang:zh" },
    ],
    [{ text: "🔻 Quay Lại 🔻", callback_data: "menu" }],
  ];

  return {
    text: `${title}\n\n${prompt}`,
    replyMarkup: { inline_keyboard: rows },
  };
}

function buildSupportReply(locale: ShopLocale, botName: string, botUsername?: string): TelegramReply {
  void botName;
  const adminContact = botUsername ? `@${botUsername.replace(/^@/, "")}` : "@tungcodes";
  const lines = [
    `📇 *TRUNG TÂM HỖ TRỢ KHÁCH HÀNG*`,
    `──────────────────────────────`,
    `Chào bạn! Nếu bạn cần hỗ trợ kích hoạt, nạp tiền hoặc bảo hành:`,
    ``,
    `⏰ *Thời gian trực:* 24/7 (Phản hồi nhanh trong 3-5 phút)`,
    `🛡️ *Chính sách bảo hành:* 1-đổi-1 trọn đời dịch vụ`,
    `⚡ *Tự động:* Nhận mã & kích hoạt ngay tức thì sau thanh toán`,
    `💬 *Admin trực tiếp:* ${adminContact}`,
    `──────────────────────────────`,
    `👇 Bấm nút bên dưới để liên hệ hỗ trợ hoặc quay lại:`,
  ];

  const adminUrl = botUsername ? `https://t.me/${botUsername.replace(/^@/, "")}` : "https://t.me/tungcodes";
  const rows: TelegramInlineKeyboardButton[][] = [
    [{ text: "💬 Nhắn Tin Trực Tiếp Cho Admin", url: adminUrl }],
    [{ text: "💎 Cửa Hàng", callback_data: "cat:0" }, { text: "🔻 Quay Lại 🔻", callback_data: "menu" }],
  ];

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
  };
}

async function buildCatalogReply(locale: ShopLocale, page: number, groupToken?: string): Promise<TelegramReply> {
  const c = commerceCopy(locale);
  const { getTelegramProductIcon, cleanTelegramProductTitle } = await import("../../../lib/shop/telegram-commerce");
  const allProducts = await loadCatalog(locale);
  const group = groupToken ? catalogGroups(allProducts, locale).find((item) => item.token === groupToken) : null;
  if (groupToken && !group) return buildCategoryMenuReply(locale);
  const products = group?.products ?? allProducts;
  if (!products.length) return { text: c.cartEmpty, replyMarkup: menuKeyboard(locale) };
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const currentPage = Math.max(0, Math.min(totalPages - 1, Math.floor(page)));
  const visible = products.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const lines: string[] = [];
  if (group) {
    lines.push(`📁 *DANH MỤC: ${group.title.toUpperCase()}*`);
    lines.push(`Vui lòng chọn sản phẩm bạn muốn mua:\n`);
    lines.push(`🔥 *Sản phẩm trong nhóm*`);
    lines.push(`_Trang ${currentPage + 1}/${totalPages}_`);
  } else {
    lines.push(`📁 *DANH MỤC SẢN PHẨM:*`);
    lines.push(`Vui lòng chọn danh mục bạn muốn mua:\n`);
    lines.push(`🔥 *Sản phẩm nổi bật*`);
    lines.push(`_Trang ${currentPage + 1}/${totalPages}_`);
  }

  const rows: TelegramInlineKeyboardButton[][] = [];

  // 1. Featured Products / Group Products (single column, full width)
  for (const product of visible) {
    if (product.availability === "out_of_stock") continue;
    const icon = getTelegramProductIcon(product.title, product.slug);
    const cleanTitle = cleanTelegramProductTitle(product.title);
    const price = formatShopMoney(product.minPriceMinor, product.currency, locale);
    rows.push([{
      text: `${icon} ${cleanTitle} · ${price}`,
      callback_data: `pd:${product.id}`,
    }]);
  }

  // 2. 2-column Quick Category / Service Grid on main catalog
  if (!group) {
    const quickGridItems: { text: string; callback_data: string }[] = [];
    const aiGroup = catalogGroups(allProducts, locale).find((g) => /ai|gpt/i.test(g.slug));
    quickGridItems.push({ text: `🤖 AI`, callback_data: aiGroup ? `cg:${aiGroup.token}:0` : "cats" });

    const brands = [
      { key: "chatgpt", label: "ChatGPT", icon: "🤖" },
      { key: "capcut", label: "CapCut", icon: "🎬" },
      { key: "spotify", label: "Spotify", icon: "🎵" },
      { key: "netflix", label: "Netflix", icon: "🍿" },
      { key: "duolingo", label: "Duolingo", icon: "🦉" },
      { key: "youtube", label: "YouTube", icon: "▶️" },
      { key: "hotmail", label: "Hotmail", icon: "📧" },
      { key: "microsoft", label: "Microsoft 365", icon: "🪟" },
      { key: "turnitin", label: "Turnitin", icon: "📑" },
      { key: "adobe", label: "Adobe", icon: "🌈" },
      { key: "elsa", label: "Elsa Speak", icon: "🗣️" },
    ];

    for (const b of brands) {
      const match = allProducts.find(
        (p) => p.slug.toLowerCase().includes(b.key) || p.title.toLowerCase().includes(b.key),
      );
      if (match) {
        quickGridItems.push({
          text: `${b.icon} ${b.label}`,
          callback_data: `pd:${match.id}`,
        });
      }
    }

    for (let i = 0; i < quickGridItems.length; i += 2) {
      if (i + 1 < quickGridItems.length) {
        rows.push([quickGridItems[i]!, quickGridItems[i + 1]!]);
      } else {
        rows.push([quickGridItems[i]!]);
      }
    }
  }

  // 3. Numbered pagination row: [🔘 1] [ 2 ] [ 3 ] [ 4 ]
  const paginationRow: TelegramInlineKeyboardButton[] = [];
  const prefix = group ? `cg:${group.token}` : "cat";
  for (let p = 0; p < totalPages && p < 5; p++) {
    paginationRow.push({
      text: p === currentPage ? `🔘 ${p + 1}` : `${p + 1}`,
      callback_data: `${prefix}:${p}`,
    });
  }
  if (paginationRow.length > 1) {
    rows.push(paginationRow);
  }

  // 4. Action & Return rows
  rows.push([{ text: `🔄 Cập nhật sản phẩm`, callback_data: `${prefix}:${currentPage}` }]);
  if (group) {
    rows.push([{ text: `📂 Xem Theo Danh Mục`, callback_data: "cats" }]);
  }
  rows.push([{ text: `🔻 Quay Lại 🔻`, callback_data: "menu" }]);

  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: rows } };
}

async function buildProductDetailReply(productId: string, locale: ShopLocale, variantPage = 0): Promise<TelegramReply & { photoUrl?: string | null }> {
  const c = commerceCopy(locale);
  if (!env.CONTENT_DB || !/^[A-Za-z0-9-]{8,80}$/.test(productId)) {
    return { text: c.buyFailed, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
  }
  const product = await getPublicProductById(env.CONTENT_DB, productId, locale);
  if (!product) return { text: c.buyFailed, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };

  let photoUrl: string | null = null;
  if (product.media?.length && product.media[0]?.url) {
    const raw = product.media[0].url;
    photoUrl = raw.startsWith("http") ? raw : `${env.MEDIA_PUBLIC_BASE_URL || "https://media.tung.codes"}${raw.startsWith("/") ? "" : "/"}${raw}`;
  } else if (product.slug) {
    photoUrl = `${env.MEDIA_PUBLIC_BASE_URL || "https://media.tung.codes"}/images/shop/${product.slug}.webp`;
  }

  const { getTelegramProductIcon, cleanTelegramProductTitle } = await import("../../../lib/shop/telegram-commerce");
  const icon = getTelegramProductIcon(product.title, product.slug);
  const cleanTitle = cleanTelegramProductTitle(product.title);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(product.variants.length / pageSize));
  const currentPage = Math.max(0, Math.min(totalPages - 1, Math.floor(variantPage)));
  const visibleVariants = product.variants.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const lines = [
    `${icon} *${product.title.toUpperCase()}*`,
    `──────────────────────────────`,
  ];
  if (product.category) lines.push(`📂 Phân loại: *${product.category}*`);
  if (product.shortDescription) lines.push(`📌 ${product.shortDescription.slice(0, 240)}`);
  lines.push(
    `🛡️ Bảo hành 1-đổi-1 · ⚡ Giao tự động trong 3s`,
    `──────────────────────────────`,
    `💎 *BẢNG GIÁ THEO GÓI (${currentPage + 1}/${totalPages}):*`,
  );
  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [];
  for (const [index, variant] of visibleVariants.entries()) {
    const price = formatShopMoney(variant.priceMinor, variant.currency || product.currency, locale);
    const label = variantDisplayName(variant, locale);
    const stock = variant.availability === "out_of_stock"
      ? `⛔ Hết`
      : variant.availability === "low_stock"
        ? `⚠️ Sắp hết`
        : `⚡ Sẵn sàng`;
    lines.push(`💎 *Gói ${currentPage * pageSize + index + 1}: ${label}*`);
    lines.push(`   └ 💵 Giá: *${price}* • ${stock}`);
    if (variant.availability === "out_of_stock") continue;
    rows.push([{ text: `👉 Chọn gói: ${label.slice(0, 24)} · ${price}`, callback_data: `qs:${variant.id}:1` }]);
  }
  lines.push(`──────────────────────────────`);
  lines.push(`👇 Bấm vào gói bên dưới để chọn số lượng & mua:`);
  const pagination: TelegramInlineKeyboardButton[] = [];
  if (currentPage > 0) pagination.push({ text: "⬅️ Trước", callback_data: `pd:${product.id}:${currentPage - 1}` });
  if (currentPage + 1 < totalPages) pagination.push({ text: "Sau ➡️", callback_data: `pd:${product.id}:${currentPage + 1}` });
  if (pagination.length) rows.push(pagination);
  rows.push([{ text: `🛍️ ${c.backProducts}`, callback_data: "cat:0" }, { text: `🛒 ${c.cart}`, callback_data: "cart" }]);
  rows.push([{ text: `📂 ${c.categories}`, callback_data: "cats" }, { text: `🏠 ${c.backMenu}`, callback_data: "menu" }]);
  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
    photoUrl,
  };
}

async function buildWalletReply(user: TelegramUser, locale: ShopLocale): Promise<TelegramReply> {
  const { getTelegramCustomerWallet } = await import("../../../lib/shop/telegram-commerce");
  const wallet = await getTelegramCustomerWallet(commerceBindings(), user, locale);

  const lines = [
    `👛 *VÍ SỐ DƯ TÀI KHOẢN*`,
    `──────────────────────────────`,
    `👤 Khách hàng: *${user.first_name || user.username || "Quý khách"}*`,
    `👑 Hạng thành viên: *${wallet.tierBadge}*`,
    `💰 Tổng chi tiêu: *${wallet.lifetimeSpendFormatted}*`,
    `──────────────────────────────`,
    `💵 SỐ DƯ KHẢ DỤNG:`,
    `👉 *${wallet.balanceFormatted}*`,
    `──────────────────────────────`,
    `⚡ Dùng số dư ví để thanh toán 1-chạm (nhận key trong 1s) mà không cần quét mã chuyển khoản mỗi lần!`,
  ];

  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [
    [{ text: `💳 Nạp Tiền Vào Ví Ngay`, callback_data: "topup" }],
    [{ text: `🛍️ Khám Phá Shop`, callback_data: "cat:0" }, { text: `📦 Đơn Hàng Của Tôi`, callback_data: "my" }],
    [{ text: `🏠 Về Menu Chính`, callback_data: "menu" }],
  ];

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
  };
}

async function buildTopupMenuReply(user: TelegramUser, locale: ShopLocale): Promise<TelegramReply> {
  void user;
  void locale;
  const lines = [
    `💳 *NẠP TIỀN VÀO VÍ*`,
    `──────────────────────────────`,
    `Hệ thống tự động quét và cộng tiền vào ví trong 10-30 giây qua VietQR PayOS.`,
    `──────────────────────────────`,
    `👇 Chọn số tiền bạn muốn nạp:`,
  ];

  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [
    [
      { text: "50.000 ₫", callback_data: "tu:50000" },
      { text: "100.000 ₫", callback_data: "tu:100000" },
    ],
    [
      { text: "200.000 ₫", callback_data: "tu:200000" },
      { text: "500.000 ₫", callback_data: "tu:500000" },
    ],
    [
      { text: "1.000.000 ₫", callback_data: "tu:1000000" },
      { text: "2.000.000 ₫", callback_data: "tu:2000000" },
    ],
    [
      { text: `👛 Về Ví Của Tôi`, callback_data: "wallet" },
      { text: `🏠 Menu Chính`, callback_data: "menu" },
    ],
  ];

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
  };
}

async function buildTopupExecuteReply(user: TelegramUser, amountMinor: number, locale: ShopLocale): Promise<TelegramReply & { photoUrl?: string | null }> {
  const { createTelegramWalletTopup } = await import("../../../lib/shop/telegram-commerce");
  const topup = await createTelegramWalletTopup(commerceBindings(), user, amountMinor, locale);

  const lines = [
    `💳 *YÊU CẦU NẠP VÍ · ${topup.amountFormatted}*`,
    `──────────────────────────────`,
    `🏦 Ngân hàng: *${topup.bankName}*`,
    `• Số tài khoản: \`${topup.accountNumber}\` (chạm để chép)`,
    `• Tên chủ thẻ: *${topup.accountName}*`,
    `• Số tiền: \`${topup.amountMinor}\` (chạm để chép)`,
    `• Nội dung CK: \`${topup.description}\` (chạm để chép)`,
    `──────────────────────────────`,
    `⚠️ Vui lòng chuyển chính xác *Số tiền* và *Nội dung* trên để hệ thống tự động cộng tiền ngay sau 10-30s.`,
  ];

  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [
    [{ text: `🔄 Tôi Đã Chuyển Tiền / Kiểm Tra Ví`, callback_data: "wallet" }],
    [{ text: `💳 Chọn Mức Nạp Khác`, callback_data: "topup" }, { text: `🏠 Menu Chính`, callback_data: "menu" }],
  ];

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
    photoUrl: topup.qrUrl,
  };
}

type QuantitySelectorReply = TelegramReply & { maximum: number; quantity: number };

async function buildQuantitySelectorReply(variantId: string, requestedQuantity: number, locale: ShopLocale): Promise<QuantitySelectorReply> {
  const c = commerceCopy(locale);
  if (!env.CONTENT_DB || !/^[A-Za-z0-9-]{8,80}$/.test(variantId)) {
    return { text: c.buyFailed, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN), maximum: 0, quantity: 0 };
  }
  const selected = await getPublicVariantContext(env.CONTENT_DB, variantId, locale);
  if (!selected || selected.variant.availability === "out_of_stock") {
    return { text: c.outOfStock, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN), maximum: 0, quantity: 0 };
  }
  // maxPerOrder already equals available stock for tracked variants (repository).
  const availableLimit = selected.variant.availableQuantity == null
    ? selected.variant.maxPerOrder
    : Math.min(selected.variant.maxPerOrder, selected.variant.availableQuantity);
  const maximum = Math.max(1, Math.min(1000, availableLimit));
  const quantity = Math.max(1, Math.min(maximum, Math.floor(requestedQuantity) || 1));
  const unitPrice = formatShopMoney(selected.variant.priceMinor, selected.variant.currency, locale);
  const total = formatShopMoney(selected.variant.priceMinor * quantity, selected.variant.currency, locale);
  const lines = [
    `🧾 XÁC NHẬN GÓI MUA`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🛍️ Sản phẩm: ${selected.productTitle}`,
    `💼 Phiên bản: ${variantDisplayName(selected.variant, locale)}`,
    `💵 Đơn giá: \`${unitPrice}\` / 1 tài khoản`,
    `📦 Tối đa: \`${maximum}\``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🔢 Số lượng đã chọn: \`${quantity}\``,
    `💰 TỔNG THANH TOÁN: \`${total}\``,
  ];
  const quantityButtons = Array.from({ length: Math.min(5, maximum) }, (_, index) => {
    const value = index + 1;
    return {
      text: value === quantity ? `✅ ${value}` : String(value),
      callback_data: `qs:${variantId}:${value}`,
    };
  });
  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [quantityButtons];
  if (maximum > 5) rows.push([{ text: `✍️ ${c.customQuantity}`, callback_data: `qi:${variantId}` }]);
  rows.push(
    [{ text: `💳 MUA NGAY (×${quantity}) · ${total}`, callback_data: `bq:${variantId}:${quantity}` }],
    [{ text: `🛒 Thêm vào giỏ hàng (×${quantity})`, callback_data: `aq:${variantId}:${quantity}` }],
    [{ text: `💼 ${c.choosePackage}`, callback_data: `pd:${selected.productId}` }, { text: `🛒 ${c.cart}`, callback_data: "cart" }],
  );
  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
    maximum,
    quantity,
  };
}

async function buildCartReply(user: TelegramUser, locale: ShopLocale): Promise<TelegramReply> {
  const c = commerceCopy(locale);
  const cart = await getTelegramCart(commerceBindings(), user.id, locale);
  if (!cart.items.length) {
    return {
      text: `🛒 GIỎ HÀNG CỦA BẠN\n──────────────────────────────\n${c.cartEmpty}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: `🛍️ ${c.catalog}`, callback_data: "cats" }],
          [{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }],
        ],
      },
    };
  }

  const labels = env.CONTENT_DB
    ? await getPublicVariantLabels(env.CONTENT_DB, cart.items.map((item) => item.variantId), locale)
    : [];
  const variantTitle = new Map<string, string>();
  for (const label of labels) {
    variantTitle.set(label.variantId, `${label.productTitle} · ${variantDisplayName({
      title: label.variantTitle,
      optionValues: label.optionValues,
    }, locale)}`);
  }

  const lines = [
    `🛒 GIỎ HÀNG`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];
  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [];
  for (const [index, item] of cart.items.entries()) {
    const title = (variantTitle.get(item.variantId) || item.variantId).slice(0, 48);
    lines.push(`${index + 1}. ${title}`);
    lines.push(`   └ SL: \`${item.quantity}\``);
    rows.push([
      { text: "➖", callback_data: `qm:${item.variantId}` },
      { text: `SL: ${item.quantity}`, callback_data: `cart` },
      { text: "➕", callback_data: `qp:${item.variantId}` },
      { text: "🗑️ Xóa", callback_data: `qr:${item.variantId}` },
    ]);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  if (cart.discountCode) lines.push(`🎟️ Mã giảm giá: \`${cart.discountCode}\``);
  rows.push([{ text: `💳 ${c.checkout.toUpperCase()}`, callback_data: "ck" }]);
  rows.push([
    { text: `🎟️ ${c.discount}`, callback_data: "dc" },
    { text: "✕ Xóa mã", callback_data: "dx" },
  ]);
  rows.push([{ text: `🗑️ ${c.clearCart}`, callback_data: "cx" }, { text: `🛍️ ${c.catalog}`, callback_data: "cats" }]);
  rows.push([{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }]);
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: rows } };
}

async function buildOrdersReply(user: TelegramUser, locale: ShopLocale, botConfigId: string, miniAppEnabled = false): Promise<TelegramReply> {
  const c = commerceCopy(locale);
  const customer = await ensureTelegramCustomer(commerceBindings(), user, locale);
  const orders = await listTelegramCustomerOrders(commerceBindings(), customer.customerId, 10, botConfigId);
  if (!orders.length) {
    return {
      text: `📦 LỊCH SỬ ĐƠN HÀNG\n──────────────────────────────\n${c.noOrders}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: `🛍️ ${c.catalog}`, callback_data: "cats" }],
          [{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }],
        ],
      },
    };
  }
  const lines = [
    `📦 ĐƠN HÀNG CỦA BẠN`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];
  orders.forEach((order) => {
    const isPaid = order.paymentStatus === "paid";
    const statusIcon = isPaid ? "🟢" : "🟡";
    lines.push(`${statusIcon} \`${order.number}\` · ${formatShopMoney(order.totalMinor, order.currency, locale)}`);
    lines.push(`   └ Trạng thái: ${paymentLabel(order.paymentStatus, locale)}`);
  });
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Chọn một đơn để xem thanh toán và quyền truy cập.`);
  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [];
  for (const order of orders) {
    if (order.paymentStatus === "paid") {
      const button = miniAppButton(locale, `🔑 ${order.number}`, miniAppEnabled);
      if (button) rows.push([button]);
      else rows.push([{ text: `🔑 ${order.number} · Xem Key`, callback_data: `ko:${order.id}` }]);
    } else {
      rows.push([{ text: `🟡 ${order.number} · Thanh toán`, callback_data: `os:${order.id}` }]);
    }
  }
  rows.push([{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }]);
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: rows } };
}

async function buildKeysMenuReply(user: TelegramUser, locale: ShopLocale, botConfigId: string, miniAppEnabled = false): Promise<TelegramReply> {
  const c = commerceCopy(locale);
  const customer = await ensureTelegramCustomer(commerceBindings(), user, locale);
  const orders = (await listTelegramCustomerOrders(commerceBindings(), customer.customerId, 15, botConfigId))
    .filter((order) => order.paymentStatus === "paid");
  if (!orders.length) {
    return {
      text: `🔑 LICENSE KEY CỦA BẠN\n──────────────────────────────\n${c.noKeys}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: `🛍️ ${c.catalog}`, callback_data: "cats" }],
          [{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }],
        ],
      },
    };
  }
  const button = miniAppButton(locale, `✨ ${c.myKeys}`, miniAppEnabled);
  if (button) {
    return {
      text: `${c.keysTitle}\n\n${buildTelegramStaticReply("keys", env.SHOP_PUBLIC_ORIGIN, locale, "TUNG Shop", miniAppEnabled).text}`,
      replyMarkup: { inline_keyboard: [[button]] },
    };
  }
  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = orders.map((order) => [
    { text: `🔑 ${order.number} (${formatShopMoney(order.totalMinor, order.currency, locale)})`, callback_data: `ko:${order.id}` },
  ]);
  rows.push([{ text: `📦 ${c.myOrders}`, callback_data: "my" }, { text: `🏠 ${c.backMenu}`, callback_data: "menu" }]);
  return {
    text: `🔑 LICENSE KEY CỦA BẠN\n──────────────────────────────\nDanh sách các đơn hàng đã thanh toán thành công.\nBấm vào từng đơn bên dưới để xem/nhận License Key:`,
    replyMarkup: { inline_keyboard: rows },
  };
}

async function buildOrderStatusReply(user: TelegramUser, locale: ShopLocale, orderId: string, botConfigId: string, miniAppEnabled = false): Promise<TelegramReply & { photoUrl?: string | null }> {
  const c = commerceCopy(locale);
  const customer = await ensureTelegramCustomer(commerceBindings(), user, locale);
  const snapshot = await statusForTelegramOrder(commerceBindings(), customer.customerId, orderId, botConfigId);
  if (!snapshot) return { text: c.buyFailed, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
  const { order, payment } = snapshot;
  const paid = order.payment_status === "paid";
  const lines = [
    `📦 CHI TIẾT ĐƠN HÀNG: \`${order.order_number}\``,
    `──────────────────────────────`,
    `💰 Tổng thanh toán: \`${formatShopMoney(order.total_minor, order.currency, locale)}\``,
    `📌 Trạng thái: \`${paymentLabel(order.payment_status, locale)}\``,
  ];
  if (payment?.provider_description) lines.push(`• Nội dung chuyển khoản: \`${payment.provider_description}\``);
  if (!paid) {
    lines.push(`──────────────────────────────`);
    lines.push(c.payBody);
  }
  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = [];
  if (paid) {
    const button = miniAppButton(locale, `🔑 ${c.myKeys}`, miniAppEnabled);
    if (button) {
      rows.push([button]);
    } else {
      rows.push([{ text: `🔑 Xem Key sản phẩm`, callback_data: `ko:${order.id}` }]);
    }
  } else {
    rows.push([{ text: `🔄 ${c.refresh}`, callback_data: `rf:${order.id}` }]);
    if (payment?.checkout_url?.startsWith("https://")) rows.push([{ text: `🌐 ${c.openPay}`, url: payment.checkout_url }]);
  }
  rows.push([{ text: `📦 ${c.myOrders}`, callback_data: "my" }, { text: `🏠 ${c.backMenu}`, callback_data: "menu" }]);
  const qrUrl = !paid ? payment?.qr_image_url ?? null : null;
  if (qrUrl && isTelegramQrPhotoUrl(qrUrl) && qrUrl.length <= 512) {
    rows.unshift([{ text: "📷 Xem ảnh VietQR", url: qrUrl }]);
  }
  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: rows },
    photoUrl: isTelegramQrPhotoUrl(qrUrl) ? qrUrl : null,
  };
}

async function buildBuyReply(
  user: TelegramUser,
  locale: ShopLocale,
  botConfigId: string,
  variantId: string,
  quantity = 1,
): Promise<TelegramReply & { photoUrl?: string | null }> {
  const cart = await getTelegramCart(commerceBindings(), user.id, locale);
  try {
    const result = await buyVariantFromTelegram(commerceBindings(), {
      user,
      locale,
      botConfigId,
      variantId,
      quantity,
      discountCode: cart.discountCode,
    });
    // A successful checkout already contains the verified QR and transfer code.
    // Avoid a redundant D1 snapshot/recovery round-trip on the latency-critical path.
    const snapshot = result.payment
      ? null
      : await statusForTelegramOrder(commerceBindings(), result.customer.customerId, result.order.orderId, botConfigId);
    return await paymentResultReply(user, locale, result.order, result.payment, snapshot);
  } catch (error) {
    return checkoutErrorReply(locale, error);
  }
}

async function buildCheckoutCartReply(user: TelegramUser, locale: ShopLocale, botConfigId: string): Promise<TelegramReply & { photoUrl?: string | null }> {
  try {
    const result = await checkoutTelegramCart(commerceBindings(), {
      user,
      locale,
      botConfigId,
    });
    const snapshot = result.payment
      ? null
      : await statusForTelegramOrder(commerceBindings(), result.customer.customerId, result.order.orderId, botConfigId);
    return await paymentResultReply(user, locale, result.order, result.payment, snapshot);
  } catch (error) {
    return checkoutErrorReply(locale, error);
  }
}

async function buildLegacyKeyOpenReply(user: TelegramUser, locale: ShopLocale, orderId: string, botConfigId: string, miniAppEnabled = false): Promise<TelegramReply> {
  const c = commerceCopy(locale);
  const customer = await ensureTelegramCustomer(commerceBindings(), user, locale);
  try {
    const deliveryResult = await deliverCustomerOwnedOrder(commerceBindings(), customer.customerId, orderId, "telegram");
    const lines: string[] = [
      `🎉 BÀN GIAO ĐƠN HÀNG: \`${deliveryResult.orderNumber}\``,
      `──────────────────────────────`,
      `✅ Trạng thái: \`${paymentLabel("paid", locale)}\``,
      "",
      `📦 THÔNG TIN BẢN QUYỀN / KEY CỦA BẠN:`,
    ];
    let keyCount = 0;
    for (const item of deliveryResult.deliveries) {
      lines.push(`📌 ${item.title} (×${item.quantity}):`);
      for (const k of item.keys) {
        keyCount++;
        lines.push(`\`${k}\``);
      }
      lines.push("");
    }
    if (keyCount === 0) {
      lines.push("⏳ Key đang được hệ thống cấp phát hoặc giao thủ công. Vui lòng liên hệ hỗ trợ nếu cần gấp.");
    } else {
      lines.push("💡 Chạm vào mã key ở trên để sao chép nhanh.");
    }
    lines.push(`──────────────────────────────`);
    lines.push(`Cảm ơn bạn đã tin tưởng ủng hộ TUNG Shop!`);
    const rows = [
      [{ text: `📦 ${c.myOrders}`, callback_data: "my" }, { text: `🏠 ${c.backMenu}`, callback_data: "menu" }],
    ];
    return {
      text: lines.join("\n").trim(),
      replyMarkup: { inline_keyboard: rows },
      protectContent: true,
    };
  } catch (error) {
    const snapshot = await statusForTelegramOrder(commerceBindings(), customer.customerId, orderId, botConfigId).catch(() => null);
    if (!snapshot) return { text: c.buyFailed, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN, miniAppEnabled) };
    if (snapshot.order.payment_status !== "paid") return buildOrderStatusReply(user, locale, orderId, botConfigId, miniAppEnabled);
    return { text: `📦 Đơn hàng: \`${snapshot.order.order_number}\`\n⚠️ Đơn đã thanh toán nhưng chưa có key tự động. Vui lòng liên hệ hỗ trợ để nhận key.`, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN, miniAppEnabled) };
  }
}

async function buildSearchReply(query: string, locale: ShopLocale): Promise<TelegramReply | null> {
  const c = commerceCopy(locale);
  const allProducts = await loadCatalog(locale);
  const normalizedQuery = query.toLowerCase();
  const matched = allProducts.filter((product) =>
    product.title.toLowerCase().includes(normalizedQuery) ||
    (product.category && product.category.toLowerCase().includes(normalizedQuery)) ||
    product.slug.toLowerCase().includes(normalizedQuery)
  );

  if (!matched.length) {
    return {
      text: `🔍 KẾT QUẢ TÌM KIẾM: "${query}"\n──────────────────────────────\nKhông tìm thấy sản phẩm nào phù hợp với từ khóa trên.\n\n👇 Bấm nút bên dưới để xem toàn bộ danh mục:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: `🛍️ ${c.allProducts}`, callback_data: "cat:0" }],
          [{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }],
        ],
      },
    };
  }

  const visible = matched.slice(0, 6);
  const lines = [
    `🔍 TÌM KIẾM: "${query}" (${matched.length} kết quả)`,
    `──────────────────────────────`,
  ];
  visible.forEach((product, index) => {
    const displayTitle = product.availability === "out_of_stock" ? strikeThrough(product.title) : product.title;
    const hot = productIsHot(product) ? ` 🔥` : "";
    lines.push(`${index + 1}. ${displayTitle}${hot}`);
    lines.push(`   └ 💵 ${productPriceLabel(product, locale)} · ${productStockLabel(product, locale)}`);
  });
  lines.push(`──────────────────────────────`);
  lines.push(`💡 Bấm vào sản phẩm bên dưới để chọn gói & mua:`);

  const rows: NonNullable<TelegramReply["replyMarkup"]>["inline_keyboard"] = visible.flatMap((product) => {
    if (product.availability === "out_of_stock") return [];
    const icon = productIsHot(product) ? "🔥" : product.availability === "low_stock" ? "⚠️" : "🛒";
    return [[{
      text: `${icon} ${product.title.slice(0, 28)} · ${productPriceLabel(product, locale)}`,
      callback_data: `pd:${product.id}`,
    }]];
  });
  rows.push([{ text: `🛍️ ${c.allProducts}`, callback_data: "cat:0" }, { text: `🏠 ${c.backMenu}`, callback_data: "menu" }]);

  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: rows } };
}

async function buildOrderByNumberReply(user: TelegramUser, locale: ShopLocale, orderNumber: string, botConfigId: string, miniAppEnabled = false): Promise<TelegramReply & { photoUrl?: string | null }> {
  const c = commerceCopy(locale);
  if (!env.CONTENT_DB) return { text: c.buyFailed, replyMarkup: menuKeyboard(locale, env.SHOP_PUBLIC_ORIGIN) };
  const customer = await ensureTelegramCustomer(commerceBindings(), user, locale);
  const cleanNumber = orderNumber.trim().toUpperCase();
  const orderRow = await env.CONTENT_DB.prepare(
    "SELECT id FROM shop_orders WHERE customer_id = ? AND (UPPER(order_number) = ? OR UPPER(order_reference) = ?) LIMIT 1"
  ).bind(customer.customerId, cleanNumber, cleanNumber).first<{ id: string }>();

  if (!orderRow?.id) {
    return {
      text: `📦 TRA CỨU ĐƠN HÀNG: \`${cleanNumber}\`\n──────────────────────────────\nKhông tìm thấy đơn hàng này gắn với tài khoản Telegram của bạn.\n\n👇 Bấm nút bên dưới để xem danh sách đơn hàng đã mua:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: `📦 ${c.myOrders}`, callback_data: "my" }],
          [{ text: `🏠 ${c.backMenu}`, callback_data: "menu" }],
        ],
      },
    };
  }

  return buildOrderStatusReply(user, locale, orderRow.id, botConfigId, miniAppEnabled);
}

type Outbound = {
  chatId: number;
  text: string;
  editMessageId?: number;
  editCaption?: boolean;
  replyMarkup?: TelegramReply["replyMarkup"];
  photoUrl?: string | null;
  photoKind?: "payment" | "product";
  extraMessages?: string[];
  protectContent?: boolean;
  followUpReply?: {
    text: string;
    replyMarkup?: TelegramReply["replyMarkup"];
  };
};

function parseCallback(data: string | undefined): { kind: string; arg: string } | null {
  if (!data) return null;
  if (/^products:([0-9]{1,4})$/.test(data)) return { kind: "cat", arg: data.split(":")[1]! };
  const quantityAction = /^(bq|aq):([A-Za-z0-9-]{8,80}):([1-9]|[1-4][0-9]|50)$/.exec(data);
  if (quantityAction) return { kind: quantityAction[1]!, arg: `${quantityAction[2]}:${quantityAction[3]}` };
  const quantitySelect = /^qs:([A-Za-z0-9-]{8,80}):([1-5])$/.exec(data);
  if (quantitySelect) return { kind: "qs", arg: `${quantitySelect[1]}:${quantitySelect[2]}` };
  const quantityInput = /^qi:([A-Za-z0-9-]{8,80})$/.exec(data);
  if (quantityInput) return { kind: "qi", arg: quantityInput[1]! };
  const categoryPage = /^cg:([a-z0-9]{7}):([0-9]{1,4})$/.exec(data);
  if (categoryPage) return { kind: "cg", arg: `${categoryPage[1]}:${categoryPage[2]}` };
  const match = /^(menu|cats|my|keys|help|cat|pd|buy|os|rf|ko|cart|ad|qp|qm|qr|ck|cx|dc|dx|wallet|topup|tu|wp|lang):?(.*)$/.exec(data);
  if (!match) return null;
  return { kind: match[1]!, arg: match[2] ?? "" };
}

// Status refresh and old paid-key buttons remain available for existing orders,
// but key viewing is migrated to the authenticated Mini App.
const legacySupportCallbackKinds = new Set(["os", "rf", "ko"]);

async function handleUpdate(update: TelegramUpdate, locale: ShopLocale, botConfigId: string, botUsername?: string, botName = "TUNG Shop"): Promise<Outbound | null> {
  const miniAppEnabled = env.TELEGRAM_MINI_APP_ENABLED === "1" || env.TELEGRAM_MINI_APP_ENABLED === "true" || (env.CONTENT_DB ? await getTelegramMiniAppEnabledSetting(env.CONTENT_DB) : false);

  if (update.callback_query) {
    const callback = update.callback_query;
    const message = callback.message;
    if (!message) return null;
    if (message.chat.type !== "private") return { chatId: message.chat.id, ...telegramPrivateOnlyReply(locale) };
    const user = callback.from;
    const editCurrent = { editMessageId: message.message_id, editCaption: Boolean(message.hasPhoto) };
    const editTextNavigation = message.hasPhoto ? {} : editCurrent;
    const parsed = parseCallback(callback.data);
    if (!parsed) {
      const reply = buildTelegramStartReply(env.SHOP_PUBLIC_ORIGIN, locale, botName, miniAppEnabled);
      return { chatId: message.chat.id, ...editCurrent, text: reply.text, replyMarkup: reply.replyMarkup };
    }

    // Mini App ON: redirect non-payment callbacks to Mini App
    if (miniAppEnabled && !legacySupportCallbackKinds.has(parsed.kind)) {
      const reply = buildTelegramStartReply(env.SHOP_PUBLIC_ORIGIN, locale, botName, true);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }

    if (parsed.kind === "menu") {
      const reply = await buildMainMenuReply(user, locale, botName, miniAppEnabled);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "wallet") {
      const reply = await buildWalletReply(user, locale);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "topup") {
      const reply = await buildTopupMenuReply(user, locale);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "tu") {
      const amount = Number(parsed.arg) || 100000;
      const reply = await buildTopupExecuteReply(user, amount, locale);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, photoUrl: reply.photoUrl, photoKind: "payment" };
    }
    if (parsed.kind === "wp") {
      const { processTelegramWalletPayment } = await import("../../../lib/shop/telegram-commerce");
      const requestId = crypto.randomUUID();
      const result = await processTelegramWalletPayment(commerceBindings(), user, parsed.arg, locale, requestId);
      if (!result.ok) {
        return {
          chatId: message.chat.id,
          text: `❌ *Thanh toán không thành công:* ${result.code === "insufficient_wallet_balance" ? "Số dư ví không đủ để thanh toán đơn hàng này" : "Lỗi xử lý đơn hàng"}.\n\nVui lòng nạp thêm tiền vào ví hoặc quét mã VietQR để thanh toán.`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "💳 Nạp Tiền Vào Ví", callback_data: "topup" }],
              [{ text: "🔄 Thử Lại Đơn Hàng", callback_data: `os:${parsed.arg}` }],
              [{ text: "🏠 Về Menu Chính", callback_data: "menu" }],
            ],
          },
        };
      }
      const delivery = result.delivery;
      const lines = [
        `🎉 *THANH TOÁN THÀNH CÔNG!*`,
        `──────────────────────────────`,
        `🧾 Mã đơn hàng: *#${result.orderNumber}*`,
        `⚡ Trạng thái: *ĐÃ GIAO KEY TỨC THÌ*`,
        `──────────────────────────────`,
      ];
      for (const item of delivery.deliveries) {
        lines.push(`📦 *${item.title}* (SL: ${item.quantity})`);
        if (item.keys.length) {
          lines.push(`🔑 *KEY BẢN QUYỀN / THÔNG TIN TRUY CẬP:*`);
          for (const k of item.keys) {
            lines.push(`\`${k}\``);
          }
          lines.push(`_(Chạm vào dòng mã bên trên để sao chép)_`);
        }
        lines.push(`──────────────────────────────`);
      }
      lines.push(`🛡️ *Bảo hành 1-đổi-1 trọn đời dịch vụ.*`);
      lines.push(`Cần hỗ trợ, hãy nhắn tin trực tiếp cho bot hoặc bấm nút bên dưới.`);
      return {
        chatId: message.chat.id,
        text: lines.join("\n"),
        replyMarkup: {
          inline_keyboard: [
            [{ text: "📦 Xem Lại Trong Đơn Hàng", callback_data: "my" }],
            [{ text: "🛍️ Mua Thêm Sản Phẩm", callback_data: "cat:0" }, { text: "🏠 Menu Chính", callback_data: "menu" }],
          ],
        },
        protectContent: true,
      };
    }
    if (parsed.kind === "cats") {
      const reply = await buildCategoryMenuReply(locale);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "cat") {
      const page = Number(parsed.arg || "0");
      const reply = await buildCatalogReply(locale, Number.isFinite(page) ? page : 0);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "cg") {
      const [token, pageRaw] = parsed.arg.split(":");
      const page = Number(pageRaw || "0");
      const reply = await buildCatalogReply(locale, Number.isFinite(page) ? page : 0, token);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "pd") {
      const [productId, pageRaw] = parsed.arg.split(":");
      const page = Number(pageRaw || "0");
      const reply = await buildProductDetailReply(productId!, locale, Number.isFinite(page) ? page : 0);
      return {
        chatId: message.chat.id,
        text: reply.text,
        replyMarkup: reply.replyMarkup,
        photoUrl: reply.photoUrl,
        photoKind: reply.photoUrl ? "product" : undefined,
      };
    }
    if (parsed.kind === "buy") {
      const reply = await buildBuyReply(user, locale, botConfigId, parsed.arg, 1);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, photoUrl: reply.photoUrl, photoKind: reply.photoUrl ? "payment" : undefined };
    }
    if (parsed.kind === "qs") {
      const [variantId, qtyRaw] = parsed.arg.split(":");
      await mutateTelegramCart(commerceBindings(), { telegramUserId: user.id, locale, action: "clear_awaiting" });
      const reply = await buildQuantitySelectorReply(variantId!, Number(qtyRaw), locale);
      return { chatId: message.chat.id, ...editCurrent, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "qi") {
      const reply = await buildQuantitySelectorReply(parsed.arg, 1, locale);
      if (reply.maximum <= 5) {
        return { chatId: message.chat.id, ...editCurrent, text: reply.text, replyMarkup: reply.replyMarkup };
      }
      await mutateTelegramCart(commerceBindings(), {
        telegramUserId: user.id,
        locale,
        action: "await_quantity",
        variantId: parsed.arg,
        messageId: message.message_id,
        messageUsesCaption: Boolean(message.hasPhoto),
      });
      return {
        chatId: message.chat.id,
        ...editCurrent,
        text: `✍️ ${commerceCopy(locale).customQuantityPrompt.replace("{max}", String(reply.maximum))}\n\n${reply.text}`,
        replyMarkup: reply.replyMarkup,
      };
    }
    if (parsed.kind === "bq") {
      const [variantId, qtyRaw] = parsed.arg.split(":");
      const qty = Math.max(1, Math.min(1000, Number(qtyRaw) || 1));
      const reply = await buildBuyReply(user, locale, botConfigId, variantId!, qty);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, photoUrl: reply.photoUrl, photoKind: reply.photoUrl ? "payment" : undefined };
    }
    if (parsed.kind === "aq") {
      const [variantId, qtyRaw] = parsed.arg.split(":");
      try {
        await mutateTelegramCart(commerceBindings(), {
          telegramUserId: user.id,
          locale,
          action: "add",
          variantId,
          quantity: Math.max(1, Math.min(1000, Number(qtyRaw) || 1)),
        });
      } catch (error) {
        return { chatId: message.chat.id, ...checkoutErrorReply(locale, error) };
      }
      const reply = await buildCartReply(user, locale);
      return { chatId: message.chat.id, ...editCurrent, text: `${commerceCopy(locale).addedCart}\n\n${reply.text}`, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "ad" || parsed.kind === "qp" || parsed.kind === "qm" || parsed.kind === "qr") {
      const action = parsed.kind === "ad" ? "add" : parsed.kind === "qp" ? "inc" : parsed.kind === "qm" ? "dec" : "remove";
      try {
        await mutateTelegramCart(commerceBindings(), {
          telegramUserId: user.id,
          locale,
          action,
          variantId: parsed.arg,
          quantity: 1,
        });
      } catch (error) {
        return { chatId: message.chat.id, ...checkoutErrorReply(locale, error) };
      }
      if (parsed.kind === "ad") {
        const c = commerceCopy(locale);
        const reply = await buildCartReply(user, locale);
        return {
          chatId: message.chat.id,
          ...editCurrent,
          text: `${c.addedCart}\n\n${reply.text}`,
          replyMarkup: reply.replyMarkup,
        };
      }
      const reply = await buildCartReply(user, locale);
      return { chatId: message.chat.id, ...editCurrent, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "cart") {
      const reply = await buildCartReply(user, locale);
      return { chatId: message.chat.id, ...editCurrent, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "cx") {
      await mutateTelegramCart(commerceBindings(), { telegramUserId: user.id, locale, action: "clear" });
      const reply = await buildCartReply(user, locale);
      return { chatId: message.chat.id, ...editCurrent, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "ck") {
      const reply = await buildCheckoutCartReply(user, locale, botConfigId);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, photoUrl: reply.photoUrl, photoKind: reply.photoUrl ? "payment" : undefined };
    }
    if (parsed.kind === "dc") {
      await mutateTelegramCart(commerceBindings(), { telegramUserId: user.id, locale, action: "await_discount" });
      return {
        chatId: message.chat.id,
        text: commerceCopy(locale).discountPrompt,
        replyMarkup: { inline_keyboard: [[{ text: commerceCopy(locale).cart, callback_data: "cart" }]] },
      };
    }
    if (parsed.kind === "dx") {
      await mutateTelegramCart(commerceBindings(), { telegramUserId: user.id, locale, action: "clear_discount" });
      const reply = await buildCartReply(user, locale);
      return {
        chatId: message.chat.id,
        ...editCurrent,
        text: `${commerceCopy(locale).discountCleared}\n\n${reply.text}`,
        replyMarkup: reply.replyMarkup,
      };
    }
    if (parsed.kind === "my") {
      const reply = await buildOrdersReply(user, locale, botConfigId, miniAppEnabled);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "keys") {
      const reply = await buildKeysMenuReply(user, locale, botConfigId, miniAppEnabled);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "lang") {
      if (parsed.arg && (parsed.arg === "vi" || parsed.arg === "en" || parsed.arg === "ja" || parsed.arg === "zh")) {
        const newLocale = parsed.arg as ShopLocale;
        if (env.CONTENT_DB) {
          try {
            await ensureTelegramCustomer(commerceBindings(), user, newLocale);
          } catch {}
        }
        const reply = await buildMainMenuReply(user, newLocale, botName, miniAppEnabled);
        return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
      }
      const reply = buildLanguageMenuReply(locale);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "help") {
      const reply = miniAppEnabled
        ? buildTelegramStaticReply("help", env.SHOP_PUBLIC_ORIGIN, locale, botName, miniAppEnabled)
        : buildSupportReply(locale, botName, botUsername);
      return { chatId: message.chat.id, ...editTextNavigation, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (parsed.kind === "os" || parsed.kind === "rf") {
      const reply = await buildOrderStatusReply(user, locale, parsed.arg, botConfigId, miniAppEnabled);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, photoUrl: reply.photoUrl, photoKind: reply.photoUrl ? "payment" : undefined };
    }
    if (parsed.kind === "ko") {
      const reply = await buildLegacyKeyOpenReply(user, locale, parsed.arg, botConfigId, miniAppEnabled);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, protectContent: reply.protectContent };
    }
    return { chatId: message.chat.id, text: buildTelegramStaticReply("unknown", env.SHOP_PUBLIC_ORIGIN, locale, botName, miniAppEnabled).text };
  }

  const message = update.message;
  if (!message?.from) return null;
  if (message.chat.type !== "private") {
    if (message.text?.startsWith("/")) return { chatId: message.chat.id, ...telegramPrivateOnlyReply(locale) };
    return null;
  }
  const user = message.from;
  const localeResolved = locale;
  const text = message.text?.trim() ?? "";

  // Mini App ON: redirect all messages/commands to Mini App
  if (miniAppEnabled) {
    const reply = await buildMainMenuReply(user, localeResolved, botName, true);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }

  if (text && !text.startsWith("/")) {
    if (text === "🏠 Menu" || /^(menu|home)$/i.test(text)) {
      const reply = await buildMainMenuReply(user, localeResolved, botName, miniAppEnabled);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (text.includes("Mua nhanh") || /^(\/)?(shop|mua|store|catalog)$/i.test(text)) {
      const reply = await buildCatalogReply(localeResolved, 0);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (text.includes("Nạp tiền") || /^(\/)?(nap|topup|wallet|vi)$/i.test(text)) {
      const reply = await buildTopupMenuReply(user, localeResolved);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
    }

    const orderMatch = /^(TG-[A-Za-z0-9-]{4,30}|TUNG[A-Za-z0-9-]{4,30})$/i.exec(text);
    if (orderMatch) {
      const reply = await buildOrderByNumberReply(user, localeResolved, orderMatch[1], botConfigId, miniAppEnabled);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, photoUrl: reply.photoUrl, photoKind: reply.photoUrl ? "payment" : undefined };
    }

    const cart = await getTelegramCart(commerceBindings(), user.id, locale);
    if (cart.awaiting === "quantity" && cart.pendingQuantityVariantId && /^[0-9]{1,4}$/.test(text)) {
      const qty = parseInt(text, 10);
      await mutateTelegramCart(commerceBindings(), { telegramUserId: user.id, locale, action: "clear_awaiting" });
      const reply = await buildQuantitySelectorReply(cart.pendingQuantityVariantId, qty, locale);
      return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
    }
    if (cart.awaiting === "discount") {
      await mutateTelegramCart(commerceBindings(), { telegramUserId: user.id, locale, action: "set_discount", discountCode: text });
      const reply = await buildCartReply(user, locale);
      return { chatId: message.chat.id, text: `${commerceCopy(locale).discountSet}\n\n${reply.text}`, replyMarkup: reply.replyMarkup };
    }
  }

  const parsed = parseTelegramCommand(message.text, botUsername || env.TELEGRAM_BOT_USERNAME);
  if (!parsed) {
    const query = message.text?.trim() || "";
    if (query && query.length >= 2 && !query.startsWith("/")) {
      const searchReply = await buildSearchReply(query, localeResolved);
      if (searchReply) {
        return { chatId: message.chat.id, text: searchReply.text, replyMarkup: searchReply.replyMarkup };
      }
      const { resolveAssistantQuery } = await import("../../../lib/shop/assistant");
      const assistant = resolveAssistantQuery(query, localeResolved);
      if (assistant.topic !== "general_faq") {
        let responseText = `💡 *${assistant.title}*\n\n${assistant.answer}`;
        if (assistant.steps?.length) {
          responseText += `\n\n${assistant.steps.join("\n")}`;
        }
        return {
          chatId: message.chat.id,
          text: responseText,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "🛍 Mở TUNG Shop", web_app: { url: env.SHOP_PUBLIC_ORIGIN ? `${env.SHOP_PUBLIC_ORIGIN}/telegram/shop` : "https://tung.codes/telegram/shop" } }],
            ],
          },
        };
      }
    }
    const reply = await buildMainMenuReply(user, localeResolved, botName, miniAppEnabled);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }

  if (parsed.command === "start") {
    const reply = await buildMainMenuReply(user, localeResolved, botName, miniAppEnabled);
    const { persistentBottomKeyboard } = await import("../../../lib/shop/telegram-commerce");
    const followUpPrompt = localeResolved === "vi" ? "👇 Chọn thao tác nhanh bên dưới:"
      : localeResolved === "en" ? "👇 Choose quick action below:"
      : localeResolved === "ja" ? "👇 下のクイック操作を選択してください:"
      : "👇 在下方选择快捷操作:";
    return {
      chatId: message.chat.id,
      text: reply.text,
      replyMarkup: reply.replyMarkup,
      followUpReply: miniAppEnabled ? undefined : {
        text: followUpPrompt,
        replyMarkup: persistentBottomKeyboard(localeResolved),
      },
    };
  }
  if (parsed.command === "products" || parsed.command === "shop") {
    const reply = await buildCatalogReply(localeResolved, 0);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }
  if (parsed.command === "cart") {
    const reply = await buildCartReply(user, localeResolved);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }
  if (parsed.command === "order" && parsed.argument) {
    const reply = await buildOrderByNumberReply(user, localeResolved, parsed.argument.trim(), botConfigId, miniAppEnabled);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup, photoUrl: reply.photoUrl, photoKind: reply.photoUrl ? "payment" : undefined };
  }
  if (parsed.command === "orders" || parsed.command === "order") {
    const reply = await buildOrdersReply(user, localeResolved, botConfigId, miniAppEnabled);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }
  if (parsed.command === "keys") {
    const reply = await buildKeysMenuReply(user, localeResolved, botConfigId, miniAppEnabled);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }
  if (parsed.command === "wallet" || parsed.command === "vi") {
    const reply = await buildWalletReply(user, localeResolved);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }
  if (parsed.command === "topup" || parsed.command === "nap") {
    const reply = await buildTopupMenuReply(user, localeResolved);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }
  if (parsed.command === "help") {
    const query = parsed.argument || "help";
    const { resolveAssistantQuery } = await import("../../../lib/shop/assistant");
    const assistant = resolveAssistantQuery(query, localeResolved);
    let responseText = `💡 *${assistant.title}*\n\n${assistant.answer}`;
    if (assistant.steps?.length) {
      responseText += `\n\n${assistant.steps.join("\n")}`;
    }
    return {
      chatId: message.chat.id,
      text: responseText,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "🛍 Mở TUNG Shop", web_app: { url: env.SHOP_PUBLIC_ORIGIN ? `${env.SHOP_PUBLIC_ORIGIN}/telegram/shop` : "https://tung.codes/telegram/shop" } }],
          [{ text: "📦 Đơn hàng của tôi", callback_data: "my" }],
        ],
      },
    };
  }
  if (parsed.command === "unknown") {
    const reply = buildTelegramStaticReply("unknown", env.SHOP_PUBLIC_ORIGIN, localeResolved, botName, miniAppEnabled);
    return { chatId: message.chat.id, text: reply.text, replyMarkup: reply.replyMarkup };
  }
  return null;
}

async function deliverOutbound(token: string | undefined, outbound: Outbound) {
  if (outbound.editMessageId && !outbound.photoUrl && !outbound.extraMessages?.length) {
    const edit = outbound.editCaption ? editTelegramCaption : editTelegramMessage;
    try {
      await edit(token, outbound.chatId, outbound.editMessageId, {
        text: outbound.text,
        ...(outbound.replyMarkup ? { replyMarkup: outbound.replyMarkup } : {}),
      });
    } catch (error) {
      if (!(error instanceof TelegramApiError) || error.code !== "telegram_api_400") throw error;
      // Old photo messages, expired messages and caption limits can make an
      // edit impossible. A fresh text response keeps every button actionable.
      await sendTelegramMessage(token, outbound.chatId, {
        text: outbound.text,
        ...(outbound.replyMarkup ? { replyMarkup: outbound.replyMarkup } : {}),
        ...(outbound.protectContent ? { protectContent: true } : {}),
      });
    }
    if (outbound.followUpReply) {
      try {
        await sendTelegramMessage(token, outbound.chatId, {
          text: outbound.followUpReply.text,
          ...(outbound.followUpReply.replyMarkup ? { replyMarkup: outbound.followUpReply.replyMarkup } : {}),
        });
      } catch (error) {
        console.error(JSON.stringify({ event: "telegram_follow_up_reply_failed", error: String(error) }));
      }
    }
    return;
  }

  if (outbound.photoKind === "payment" && outbound.photoUrl && isTelegramQrPhotoUrl(outbound.photoUrl)) {
    // Show the actionable transfer details first. QR retrieval/upload may be
    // slower, but it must never make the bot look frozen.
    await sendTelegramMessage(token, outbound.chatId, {
      text: outbound.text,
      ...(outbound.replyMarkup ? { replyMarkup: outbound.replyMarkup } : {}),
      ...(outbound.protectContent ? { protectContent: true } : {}),
    });
    const qrPhotoUrl = outbound.photoUrl;
    waitUntil((async () => {
      await sendTelegramChatAction(token, outbound.chatId, "upload_photo").catch(() => undefined);
      try {
        await sendTelegramPhoto(token, outbound.chatId, qrPhotoUrl);
      } catch (error) {
        const errorCode = error instanceof TelegramApiError
          ? error.code
          : error instanceof Error ? error.name : "UnknownError";
        console.error(JSON.stringify({ event: "telegram_qr_photo_failed", errorCode }));
      }
    })());
    for (const extra of outbound.extraMessages ?? []) {
      await sendTelegramMessage(token, outbound.chatId, {
        text: extra,
        ...(outbound.protectContent ? { protectContent: true } : {}),
      });
    }
    return;
  }

  let photoSent = false;
  const singlePhotoReply = Boolean(outbound.photoUrl && outbound.text.length <= 1_024);
  if (outbound.photoUrl && isTelegramQrPhotoUrl(outbound.photoUrl)) {
    try {
      const caption = singlePhotoReply
        ? outbound.text
        : outbound.text.split("\n").slice(0, 4).join("\n").slice(0, 900);
      await sendTelegramPhoto(token, outbound.chatId, outbound.photoUrl, {
        ...(caption ? { caption } : {}),
        ...(singlePhotoReply && outbound.replyMarkup ? { replyMarkup: outbound.replyMarkup } : {}),
      });
      photoSent = true;
    } catch (error) {
      const errorCode = error instanceof TelegramApiError
        ? error.code
        : error instanceof Error ? error.name : "UnknownError";
      console.error(JSON.stringify({ event: outbound.photoKind === "product" ? "telegram_product_photo_failed" : "telegram_qr_photo_failed", errorCode }));
      photoSent = false;
    }
  }

  // Short payment responses fit in one photo message with caption and buttons.
  // Longer text keeps the two-message fallback to respect Telegram limits.
  const body = photoSent
    ? outbound.text
    : outbound.photoUrl && outbound.photoKind !== "product"
      ? `${outbound.text}\n\n(QR ảnh tạm thời không gửi được — dùng nút payOS / chuyển đúng nội dung CK.)`
      : outbound.text;
  if (!photoSent || !singlePhotoReply) {
    await sendTelegramMessage(token, outbound.chatId, {
      text: body,
      ...(outbound.replyMarkup ? { replyMarkup: outbound.replyMarkup } : {}),
      ...(outbound.protectContent ? { protectContent: true } : {}),
    });
  }

  for (const extra of outbound.extraMessages ?? []) {
    await sendTelegramMessage(token, outbound.chatId, {
      text: extra,
      ...(outbound.protectContent ? { protectContent: true } : {}),
    });
  }

  if (outbound.followUpReply) {
    try {
      await sendTelegramMessage(token, outbound.chatId, {
        text: outbound.followUpReply.text,
        ...(outbound.followUpReply.replyMarkup ? { replyMarkup: outbound.followUpReply.replyMarkup } : {}),
      });
    } catch (error) {
      console.error(JSON.stringify({ event: "telegram_follow_up_reply_failed", error: String(error) }));
    }
  }
}

export const POST: APIRoute = async ({ request }) => {
  const startedAt = Date.now();
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);

  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  const botHint = new URL(request.url).searchParams.get("bot");
  const resolved = await resolveTelegramBotByWebhookSecret(
    env.CONTENT_DB,
    env,
    suppliedSecret,
    botHint,
  ).catch(() => null);
  const registryState = await env.CONTENT_DB.prepare("SELECT 1 AS found FROM shop_telegram_bot_configs WHERE scope = 'legacy' AND status = 'active' LIMIT 1")
    .first<{ found: number }>().then((row) => ({ ok: true as const, active: Boolean(row) })).catch(() => ({ ok: false as const, active: false }));
  if (!registryState.ok) return json({ ok: false, code: "telegram_registry_unavailable" }, 503);
  // Keep the original environment-token bot online even when a separate
  // registry-managed (global) bot is active. Registry URLs always include a
  // `bot` query hint; the legacy webhook has no hint, so the two credentials
  // remain independently authorized and update claims stay correctly scoped.
  const runtime = resolved?.credential ?? (!botHint && await verifyTelegramWebhookSecret(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET)
    && env.TELEGRAM_BOT_TOKEN
    ? {
        configId: "environment",
        botId: "environment",
        username: env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "").toLowerCase() || "",
        firstName: "TUNG Shop",
        token: env.TELEGRAM_BOT_TOKEN.trim(),
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() || "",
        status: "active" as const,
        miniAppUrl: null,
        webhookUrl: null,
      }
    : null);
  if (!runtime) {
    return json({ ok: false, code: "telegram_webhook_unauthorized" }, 401);
  }

  const parsed = await readTelegramUpdate(request);
  if (!parsed.ok) return parsed.response;
  const requestId = crypto.randomUUID();
  try {
    const claim = await claimTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, parsed.payloadHash, parsed.type, runtime.configId);
    if (claim.state === "completed" || claim.state === "processing") return json({ ok: true, duplicate: true });
    if (claim.state === "conflict") {
      console.error(JSON.stringify({ event: "telegram_update_hash_conflict", updateId: parsed.update.update_id }));
      return json({ ok: true, duplicate: true });
    }
    if (claim.state !== "claimed" || !claim.leaseToken) return json({ ok: false, code: "telegram_update_unavailable" }, 503);
    const claimedAt = Date.now();

    try {
      // The existing bot remains Vietnam-only: Vietnamese copy, VND pricing
      // and PayOS/VietQR payment. A global bot will be wired separately.
      const locale: ShopLocale = "vi";
      if (parsed.update.callback_query) {
        const cbData = parsed.update.callback_query.data || "";
        const isOrderCreation = /^(buy|bq|ck):?/.test(cbData);
        const ackText = isOrderCreation
          ? "⏳ Đã nhận đơn hàng! Hệ thống đang tạo mã VietQR / PayOS thanh toán. Vui lòng đợi trong giây lát và không thao tác lại..."
          : commerceCopy(locale).processing;

        // Await callback acknowledgement immediately so Telegram UI instantly clears button spinner
        // and displays the alert/toast notice before heavy PayOS API and D1 operations run.
        await answerTelegramCallback(
          runtime.token,
          parsed.update.callback_query.id,
          ackText,
          isOrderCreation,
        ).catch(() => undefined);
      }

      const outbound = await handleUpdate(parsed.update, locale, runtime.configId, runtime.username || undefined, runtime.firstName || "TUNG Shop");
      const handledAt = Date.now();
      if (outbound) {
        await deliverOutbound(runtime.token, outbound);
      }
      const deliveredAt = Date.now();
      if (!await completeTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, claim.leaseToken, runtime.configId)) {
        throw new Error("telegram_update_lease_invalid");
      }
      console.log(JSON.stringify({
        event: "telegram_update_completed",
        requestId,
        updateType: parsed.type,
        botConfigId: runtime.configId,
        totalMs: Date.now() - startedAt,
        claimMs: claimedAt - startedAt,
        handleMs: handledAt - claimedAt,
        deliveryMs: deliveredAt - handledAt,
        photo: Boolean(outbound?.photoUrl),
      }));
      return json({ ok: true });
    } catch (error) {
      const errorCode = error instanceof TelegramApiError
        ? error.code
        : error instanceof Error && /D1_ERROR|SQLITE_/i.test(error.message)
          ? "telegram_d1_error"
          : error instanceof TypeError
            ? "telegram_type_error"
        : error instanceof Error && /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/.test(error.message)
          ? error.message
          : "telegram_update_failed";
      const terminalTelegramError = error instanceof TelegramApiError
        && (error.code === "telegram_api_400" || error.code === "telegram_api_401" || error.code === "telegram_api_403");
      if (terminalTelegramError) {
        await completeTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, claim.leaseToken, runtime.configId).catch(() => false);
      } else {
        await failTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, claim.leaseToken, errorCode, runtime.configId).catch(() => false);
      }
      console.error(JSON.stringify({
        event: "telegram_update_failed",
        requestId,
        updateId: parsed.update.update_id,
        botConfigId: runtime.configId,
        updateType: parsed.type,
        callbackKind: parseCallback(parsed.update.callback_query?.data)?.kind ?? null,
        errorCode,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500) : null,
        telegramDescription: error instanceof TelegramApiError ? error.description : null,
        retryable: !terminalTelegramError,
        totalMs: Date.now() - startedAt,
      }));
      return terminalTelegramError
        ? json({ ok: true, dropped: true })
        : json({ ok: false, code: "telegram_update_retry" }, 503);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_webhook_failed", requestId, errorCode: error instanceof Error ? error.name : "UnknownError" }));
    return json({ ok: false, code: "telegram_webhook_unavailable" }, 503);
  }
};

export const GET: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
