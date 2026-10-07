import { randomOpaqueToken, sha256Base64Url } from "./crypto";
import type { PublicProduct, ShopLocale } from "./types";
import { menuKeyboard } from "./telegram-commerce";

const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
const MAX_UPDATE_BYTES = 64 * 1024;
const MAX_API_RESPONSE_BYTES = 128 * 1024;
const UPDATE_LEASE_SECONDS = 60;
const UPDATE_RETENTION_DAYS = 30;
const telegramEncoder = new TextEncoder();

export type TelegramCommand = "start" | "shop" | "products" | "order" | "orders" | "keys" | "cart" | "discount" | "help" | "wallet" | "vi" | "topup" | "nap";

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  hasPhoto?: boolean;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramInlineKeyboardButton = {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
  icon_custom_emoji_id?: string;
  style?: "primary" | "success" | "danger";
};

export type TelegramKeyboardButton = {
  text: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
  keyboard?: TelegramKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  is_persistent?: boolean;
  remove_keyboard?: boolean;
};

export type TelegramReply = {
  text: string;
  replyMarkup?: TelegramReplyMarkup;
  protectContent?: boolean;
};

export type TelegramBotIdentity = {
  id: number;
  firstName: string;
  username: string | null;
};

export type TelegramReadiness = {
  ready: boolean;
  tokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  publicOriginConfigured: boolean;
  expectedUsernameConfigured: boolean;
  webhookUrl: string | null;
};

type TelegramBindings = Pick<Cloudflare.Env, "TELEGRAM_BOT_TOKEN" | "TELEGRAM_WEBHOOK_SECRET" | "TELEGRAM_BOT_USERNAME" | "SHOP_PUBLIC_ORIGIN"> & { CONTENT_DB?: Cloudflare.Env["CONTENT_DB"] };

type TelegramApiMethod =
  | "answerCallbackQuery"
  | "deleteWebhook"
  | "editMessageCaption"
  | "editMessageText"
  | "getMe"
  | "getWebhookInfo"
  | "sendChatAction"
  | "sendMessage"
  | "sendPhoto"
  | "setChatMenuButton"
  | "setMyCommands"
  | "setWebhook";

type TelegramApiEnvelope = {
  ok?: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

type TelegramUpdateRow = {
  payload_hash: string;
  status: "processing" | "completed" | "failed";
  lock_expires_at: string | null;
};

export class TelegramApiError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;
  readonly description: string | null;

  constructor(code: string, retryAfterSeconds: number | null = null, description: string | null = null) {
    super("Telegram Bot API request failed");
    this.name = "TelegramApiError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.description = description;
  }
}

export const TELEGRAM_COMMANDS: Record<ShopLocale, Array<{ command: TelegramCommand; description: string }>> = {
  vi: [
    { command: "start", description: "Mở TUNG Shop Mini App" },
    { command: "shop", description: "Mua hàng trong Mini App" },
    { command: "orders", description: "Đơn hàng theo Telegram ID" },
    { command: "help", description: "Hướng dẫn và hỗ trợ" },
  ],
  en: [
    { command: "start", description: "Open the TUNG Shop Mini App" },
    { command: "shop", description: "Shop in the Mini App" },
    { command: "orders", description: "Orders linked to your Telegram ID" },
    { command: "help", description: "Help and support" },
  ],
  ja: [
    { command: "start", description: "TUNG Shop Mini App を開く" },
    { command: "shop", description: "Mini App で購入" },
    { command: "orders", description: "Telegram ID に紐づく注文" },
    { command: "help", description: "ヘルプとサポート" },
  ],
  zh: [
    { command: "start", description: "打开 TUNG Shop Mini App" },
    { command: "shop", description: "在 Mini App 中购买" },
    { command: "orders", description: "绑定 Telegram ID 的订单" },
    { command: "help", description: "帮助与支持" },
  ],
};

export const TELEGRAM_COMMANDS_NATIVE: Record<ShopLocale, Array<{ command: TelegramCommand; description: string }>> = {
  vi: [
    { command: "start", description: "Bắt đầu mua sắm" },
    { command: "products", description: "Xem danh sách sản phẩm" },
    { command: "cart", description: "Xem giỏ hàng" },
    { command: "orders", description: "Đơn hàng của tôi" },
    { command: "help", description: "Hướng dẫn và hỗ trợ" },
  ],
  en: [
    { command: "start", description: "Start shopping" },
    { command: "products", description: "Browse products" },
    { command: "cart", description: "View cart" },
    { command: "orders", description: "My orders" },
    { command: "help", description: "Help and support" },
  ],
  ja: [
    { command: "start", description: "買い物を始める" },
    { command: "products", description: "商品を見る" },
    { command: "cart", description: "カートを見る" },
    { command: "orders", description: "注文一覧" },
    { command: "help", description: "ヘルプとサポート" },
  ],
  zh: [
    { command: "start", description: "开始购物" },
    { command: "products", description: "浏览商品" },
    { command: "cart", description: "查看购物车" },
    { command: "orders", description: "我的订单" },
    { command: "help", description: "帮助与支持" },
  ],
};

const copy: Record<ShopLocale, {
  welcome: string;
  shop: string;
  products: string;
  empty: string;
  order: string;
  keys: string;
  help: string;
  privateOnly: string;
  unknown: string;
  browse: string;
  trackOrder: string;
  next: string;
  previous: string;
}> = {
  vi: {
    welcome: "TUNG Shop nay hoạt động hoàn toàn trong Mini App.\nMua hàng, thanh toán và lịch sử đơn được gắn trực tiếp với Telegram ID đang dùng — không cần đăng nhập riêng.",
    shop: "Mở TUNG Shop Mini App để xem sản phẩm, thanh toán và nhận đơn hàng an toàn.",
    products: "Sản phẩm đang bán",
    empty: "Hiện chưa có sản phẩm khả dụng. Vui lòng quay lại sau.",
    order: "Đơn hàng được lưu theo ID Telegram của bạn. Mở Mini App để theo dõi đơn và nhận key.",
    keys: "Mở TUNG Shop Mini App để xem key đã thanh toán. Key không được gửi trực tiếp trong chat.",
    help: "Mở TUNG Shop bằng nút bên dưới để mua hàng, thanh toán, xem đơn và nhận key. Phiên mua hàng được xác thực bằng Telegram ID; không gửi mã đăng nhập, mã thanh toán hoặc key cho người khác.",
    privateOnly: "Vui lòng mở chat riêng với TUNG Shop Bot để bảo vệ thông tin đơn hàng.",
    unknown: "Tôi chưa hiểu yêu cầu đó. Dùng /help hoặc /start.",
    browse: "Mở TUNG Shop",
    trackOrder: "Đơn của tôi",
    next: "Trang sau",
    previous: "Trang trước",
  },
  en: {
    welcome: "TUNG Shop now runs entirely in the Mini App.\nShopping, payment, order history, and keys are linked to your current Telegram ID with no separate login.",
    shop: "Open the TUNG Shop Mini App to browse products, pay, and receive your order securely.",
    products: "Products available now",
    empty: "No products are available right now. Please check again later.",
    order: "Orders are stored against your Telegram ID. Open the Mini App to track orders and receive keys.",
    keys: "Open the TUNG Shop Mini App to view paid keys. Keys are never sent directly in chat.",
    help: "Open TUNG Shop below to shop, pay, review orders, and receive keys. Your session is verified with your Telegram ID; never share payment codes or keys.",
    privateOnly: "Please open a private chat with TUNG Shop Bot to protect order information.",
    unknown: "I did not understand that. Use /help or /start.",
    browse: "Open TUNG Shop",
    trackOrder: "My orders",
    next: "Next page",
    previous: "Previous page",
  },
  ja: {
    welcome: "TUNG Shop は Mini App に完全移行しました。\n購入、決済、注文履歴、キーは現在の Telegram ID に紐づき、別途ログインは不要です。",
    shop: "TUNG Shop Mini App を開いて商品を選び、安全に支払いと受取を行ってください。",
    products: "販売中の商品",
    empty: "現在購入できる商品はありません。時間をおいて再度ご確認ください。",
    order: "注文は Telegram ID に保存されます。Mini App を開いて注文とキーを確認してください。",
    keys: "支払い済みのキーを確認するには TUNG Shop Mini App を開いてください。キーはチャットに直接送信されません。",
    help: "下のボタンから TUNG Shop を開き、購入、決済、注文確認、キー受取を行ってください。決済コードやキーを他人に共有しないでください。",
    privateOnly: "注文情報を保護するため、TUNG Shop Bot との個別チャットを開いてください。",
    unknown: "その操作には対応していません。/help または /start を使ってください。",
    browse: "TUNG Shop を開く",
    trackOrder: "注文一覧",
    next: "次のページ",
    previous: "前のページ",
  },
  zh: {
    welcome: "TUNG Shop 已完全迁移到 Mini App。\n购买、付款、订单历史和密钥均绑定当前 Telegram ID，无需单独登录。",
    shop: "打开 TUNG Shop Mini App 浏览商品、安全付款并查看订单。",
    products: "当前在售商品",
    empty: "目前没有可购买的商品，请稍后再试。",
    order: "订单按 Telegram ID 保存。打开 Mini App 跟踪订单并领取密钥。",
    keys: "打开 TUNG Shop Mini App 查看已付款密钥。密钥不会直接发送到聊天中。",
    help: "请通过下方按钮打开 TUNG Shop，完成购买、付款、订单查询和密钥领取。请勿向他人分享付款码或密钥。",
    privateOnly: "为保护订单信息，请与 TUNG Shop Bot 开启私聊。",
    unknown: "暂不支持该请求。请使用 /help 或 /start。",
    browse: "打开 TUNG Shop",
    trackOrder: "我的订单",
    next: "下一页",
    previous: "上一页",
  },
};

const nativeCopy: typeof copy = {
  vi: {
    welcome: "👋 {botName} · DIGITAL GOODS\n\nMột cửa hàng gọn trong Telegram — chọn gói, thanh toán VietQR và nhận quyền truy cập tự động.\n\n⚡ Giao nhanh  •  🔒 Bảo vệ theo Telegram ID  •  🧾 Có lịch sử đơn\n\nChọn một điểm bắt đầu:",
    shop: "Danh mục đã sẵn sàng. Chọn nhóm sản phẩm để xem đúng thứ bạn cần.",
    products: "CATALOG SẢN PHẨM",
    empty: "Hiện chưa có sản phẩm khả dụng. Vui lòng quay lại sau.",
    order: "Theo dõi mọi đơn đã tạo, trạng thái thanh toán và quyền truy cập trong một nơi.",
    keys: "Key đã mở khóa được bảo vệ và chỉ hiển thị cho đúng tài khoản Telegram này.",
    help: "🧭 CÁCH MUA\n\n01  Chọn sản phẩm → chọn gói\n02  Quét VietQR, chuyển đúng số tiền + nội dung\n03  Hệ thống xác nhận → mở key\n\nKhông gửi mã thanh toán hoặc key cho người khác. Cần hỗ trợ? Gửi /order kèm mã đơn.",
    privateOnly: "Vui lòng mở chat riêng với bot để bảo vệ thông tin đơn hàng và key bản quyền.",
    unknown: "Tôi chưa hiểu yêu cầu đó. Dùng /help hoặc /start để mở menu.",
    browse: "🛍  Vào catalog",
    trackOrder: "📦  Theo dõi đơn",
    next: "Trang sau ➡️",
    previous: "⬅️ Trang trước",
  },
  en: {
    welcome: "👋 Welcome to {botName}!\n\nAI accounts, developer tools & software licenses delivered automatically 24/7.\n\n✨ HIGHLIGHTS:\n• ⚡ Instant key delivery after payment\n• 🛡️ Full warranty coverage\n• 💳 Automatic payment verification 24/7\n\n👇 Choose an option below to start:",
    shop: "Tap a button below to browse products and place an order.",
    products: "PRODUCT CATALOG",
    empty: "No products available right now. Please check again later.",
    order: "Tap \"📦 My Orders\" below to view your order history.",
    keys: "Keys are delivered automatically after payment. Tap \"📦 My Orders\" to check.",
    help: "💡 HOW TO BUY:\n\n1. Select a product and package.\n2. Complete payment with the exact amount & reference code.\n3. Keys are unlocked automatically within seconds.\n\n🔒 Never share your private keys or payment codes.",
    privateOnly: "Please open a private chat with the bot to protect your order details.",
    unknown: "I did not understand that. Use /help or /start.",
    browse: "🛍️ Browse products",
    trackOrder: "📦 My orders",
    next: "Next ➡️",
    previous: "⬅️ Previous",
  },
  ja: {
    welcome: "{botName} へようこそ！\nチャットで商品を選び、決済・注文を確認できます。\nTelegram ID にリンクされるためログイン不要です。",
    shop: "下のボタンから商品を選んで注文してください。",
    products: "販売中の商品",
    empty: "現在購入できる商品はありません。しばらくしてから再度ご確認ください。",
    order: "「📦 注文一覧」ボタンで注文履歴を確認してください。",
    keys: "キーは決済後に配信されます。「📦 注文一覧」で確認してください。",
    help: "下のボタンから購入、決済、注文確認を行ってください。\n決済コードやキーを他人に共有しないでください。",
    privateOnly: "注文情報を保護するため、ボットとの個別チャットを開いてください。",
    unknown: "その操作には対応していません。/help または /start を使ってください。",
    browse: "商品を見る",
    trackOrder: "注文一覧",
    next: "次のページ",
    previous: "前のページ",
  },
  zh: {
    welcome: "欢迎来到 {botName}！\n直接在聊天中选购、付款和查看订单。\n会话已绑定 Telegram ID，无需单独登录。",
    shop: "点击下方按钮浏览商品并下单。",
    products: "当前在售商品",
    empty: "目前没有可购买的商品，请稍后再试。",
    order: "点击「📦 我的订单」查看订单历史。",
    keys: "密钥将在付款后发送。点击「📦 我的订单」查看。",
    help: "请使用下方按钮购买、付款和查询订单。\n请勿向他人分享付款码或密钥。",
    privateOnly: "为保护订单信息，请与机器人开启私聊。",
    unknown: "暂不支持该请求。请使用 /help 或 /start。",
    browse: "浏览商品",
    trackOrder: "我的订单",
    next: "下一页",
    previous: "上一页",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTelegramToken(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9]{5,20}:[A-Za-z0-9_-]{20,160}$/.test(value.trim());
}

function isWebhookSecret(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(value.trim());
}

function normalizeBotUsername(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^@/, "").toLowerCase() ?? "";
  if (!/^[a-z0-9_]{5,32}$/.test(normalized) || !normalized.endsWith("bot")) return null;
  return normalized;
}

function normalizePublicOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() || "");
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function asSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function parseTelegramUser(value: unknown): TelegramUser | null {
  if (!isRecord(value)) return null;
  const id = asSafeInteger(value.id);
  if (id === null) return null;
  return {
    id,
    ...(typeof value.is_bot === "boolean" ? { is_bot: value.is_bot } : {}),
    ...(typeof value.first_name === "string" ? { first_name: value.first_name.slice(0, 128) } : {}),
    ...(typeof value.last_name === "string" ? { last_name: value.last_name.slice(0, 128) } : {}),
    ...(typeof value.username === "string" ? { username: value.username.slice(0, 64) } : {}),
    ...(typeof value.language_code === "string" ? { language_code: value.language_code.slice(0, 16) } : {}),
  };
}

function parseTelegramChat(value: unknown): TelegramChat | null {
  if (!isRecord(value)) return null;
  const id = asSafeInteger(value.id);
  const type = value.type;
  if (id === null || (type !== "private" && type !== "group" && type !== "supergroup" && type !== "channel")) return null;
  return { id, type };
}

function parseTelegramMessage(value: unknown): TelegramMessage | null {
  if (!isRecord(value)) return null;
  const messageId = asSafeInteger(value.message_id);
  const chat = parseTelegramChat(value.chat);
  if (messageId === null || !chat) return null;
  const from = value.from === undefined ? null : parseTelegramUser(value.from);
  if (value.from !== undefined && !from) return null;
  return {
    message_id: messageId,
    chat,
    ...(from ? { from } : {}),
    ...(typeof value.text === "string" ? { text: value.text.slice(0, 4_096) } : {}),
    ...(typeof value.caption === "string" ? { caption: value.caption.slice(0, 1_024) } : {}),
    ...(Array.isArray(value.photo) && value.photo.length ? { hasPhoto: true } : {}),
  };
}

function parseCallbackQuery(value: unknown): TelegramCallbackQuery | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length < 1 || value.id.length > 128) return null;
  const from = parseTelegramUser(value.from);
  const message = value.message === undefined ? null : parseTelegramMessage(value.message);
  if (!from || (value.message !== undefined && !message)) return null;
  return {
    id: value.id,
    from,
    ...(message ? { message } : {}),
    ...(typeof value.data === "string" ? { data: value.data.slice(0, 64) } : {}),
  };
}

function updateType(update: TelegramUpdate) {
  if (update.callback_query) return "callback_query";
  if (update.message) return "message";
  return "unsupported";
}

function responseJson(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

async function readBoundedBytes(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readTelegramApiEnvelope(response: Response): Promise<TelegramApiEnvelope> {
  if (!response.body) throw new TelegramApiError("telegram_api_empty_response");
  const bytes = await readBoundedBytes(response.body, MAX_API_RESPONSE_BYTES);
  if (!bytes) throw new TelegramApiError("telegram_api_response_too_large");
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!isRecord(parsed)) throw new Error("invalid");
    return parsed as TelegramApiEnvelope;
  } catch {
    throw new TelegramApiError("telegram_api_invalid_response");
  }
}

export async function verifyTelegramWebhookSecret(provided: string | null, expected: string | undefined) {
  if (!provided || !isWebhookSecret(expected)) return false;
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", telegramEncoder.encode(provided)),
    crypto.subtle.digest("SHA-256", telegramEncoder.encode(expected.trim())),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.byteLength ^ right.byteLength;
  for (let index = 0; index < Math.max(left.byteLength, right.byteLength); index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function readTelegramUpdate(request: Request): Promise<
  | { ok: true; update: TelegramUpdate; payloadHash: string; type: string }
  | { ok: false; response: Response }
> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { ok: false, response: responseJson({ ok: false, code: "invalid_content_type" }, 415) };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0) return { ok: false, response: responseJson({ ok: false, code: "invalid_content_length" }, 400) };
  if (declared > MAX_UPDATE_BYTES) return { ok: false, response: responseJson({ ok: false, code: "payload_too_large" }, 413) };
  if (!request.body) return { ok: false, response: responseJson({ ok: false, code: "empty_body" }, 400) };
  const bytes = await readBoundedBytes(request.body, MAX_UPDATE_BYTES);
  if (!bytes) return { ok: false, response: responseJson({ ok: false, code: "payload_too_large" }, 413) };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return { ok: false, response: responseJson({ ok: false, code: "invalid_json" }, 400) };
  }
  if (!isRecord(value)) return { ok: false, response: responseJson({ ok: false, code: "invalid_update" }, 400) };
  const updateId = asSafeInteger(value.update_id);
  if (updateId === null || updateId < 0) return { ok: false, response: responseJson({ ok: false, code: "invalid_update" }, 400) };
  const message = value.message === undefined ? null : parseTelegramMessage(value.message);
  const callbackQuery = value.callback_query === undefined ? null : parseCallbackQuery(value.callback_query);
  if ((value.message !== undefined && !message) || (value.callback_query !== undefined && !callbackQuery)) {
    return { ok: false, response: responseJson({ ok: false, code: "invalid_update" }, 400) };
  }
  const update: TelegramUpdate = {
    update_id: updateId,
    ...(message ? { message } : {}),
    ...(callbackQuery ? { callback_query: callbackQuery } : {}),
  };
  return { ok: true, update, payloadHash: await sha256Base64Url(bytes), type: updateType(update) };
}

/**
 * Map Telegram BCP-47 language codes to shop locales.
 * Handles regional tags (en-US, zh-Hans, ja-JP, vi-VN) and common aliases.
 */
export function telegramLocale(languageCode: string | undefined): ShopLocale {
  const raw = languageCode?.trim().toLowerCase() ?? "";
  if (!raw) return "vi";
  // Full / extended tags first
  if (raw === "zh-hant" || raw === "zh-tw" || raw === "zh-hk" || raw === "zh-mo") return "zh";
  if (raw.startsWith("zh")) return "zh"; // zh, zh-cn, zh-hans, zh-sg
  if (raw.startsWith("ja")) return "ja";
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("vi")) return "vi";
  // Rare aliases sometimes seen on clients
  if (raw === "jp") return "ja";
  if (raw === "cn" || raw === "yue") return "zh";
  const primary = raw.split(/[-_]/, 1)[0] ?? "";
  if (primary === "en" || primary === "ja" || primary === "zh" || primary === "vi") return primary;
  return "vi";
}

export function parseTelegramCommand(text: string | undefined, expectedUsername?: string): { command: TelegramCommand | "unknown"; argument: string } | null {
  const normalized = text?.trim();
  if (!normalized?.startsWith("/")) return null;
  const [rawCommand, ...rest] = normalized.split(/\s+/);
  const [commandPart, addressedUsername] = rawCommand.slice(1).split("@", 2);
  const expected = normalizeBotUsername(expectedUsername);
  if (addressedUsername && (!expected || addressedUsername.toLowerCase() !== expected)) return null;
  const command = commandPart.toLowerCase();
  const supported = new Set<TelegramCommand>(["start", "shop", "products", "order", "orders", "keys", "cart", "discount", "help", "wallet", "vi", "topup", "nap"]);
  return { command: supported.has(command as TelegramCommand) ? command as TelegramCommand : "unknown", argument: rest.join(" ").slice(0, 256) };
}

export function telegramPublicUrl(originValue: string | undefined, locale: ShopLocale, path: "/shop" | "/shop/order", product?: { slug: string; variantId?: string | null }) {
  const origin = normalizePublicOrigin(originValue);
  if (!origin) throw new Error("shop_public_origin_invalid");
  const localePrefix = locale === "vi" ? "" : `/${locale}`;
  const safePath = product && /^[a-z0-9][a-z0-9-]{0,159}$/.test(product.slug)
    ? `${localePrefix}/shop/${product.slug}`
    : `${localePrefix}${path}`;
  const url = new URL(safePath, origin);
  if (product?.variantId && /^[A-Za-z0-9-]{1,100}$/.test(product.variantId)) url.searchParams.set("variant", product.variantId);
  url.searchParams.set("utm_source", "telegram");
  url.searchParams.set("utm_medium", "bot");
  if (product) url.hash = "purchase";
  return url.toString();
}

export function telegramMiniAppUrl(originValue: string | undefined) {
  const origin = normalizePublicOrigin(originValue);
  return origin ? new URL("/telegram/shop", origin).toString() : null;
}

function formatProductPrice(product: PublicProduct, locale: ShopLocale) {
  const value = product.minPriceMinor;
  const currency = product.currency.toUpperCase();
  try {
    const formatter = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : locale, { style: "currency", currency });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(value / (10 ** fractionDigits));
  } catch {
    return `${value} ${currency}`;
  }
}

export function buildTelegramStartReply(
  origin: string | undefined,
  locale: ShopLocale,
  botName: string,
  miniAppEnabled = false,
  userStats?: {
    displayName?: string;
    walletBalance?: string;
    tierBadge?: string;
  },
): TelegramReply {
  if (!miniAppEnabled) {
    let welcomeText = "";
    if (locale === "vi") {
      welcomeText = `Chào mừng bạn đến với  *${botName}* ! 👑\n\nVui lòng chọn dịch vụ từ menu bên dưới để tiếp tục.`;
    } else if (locale === "en") {
      welcomeText = `Welcome to *${botName}* ! 👑\n\nPlease choose a service from the menu below to continue.`;
    } else if (locale === "ja") {
      welcomeText = `*${botName}* へようこそ！ 👑\n\n下のメニューからサービスを選択してください。`;
    } else {
      welcomeText = `欢迎来到 *${botName}*！ 👑\n\n请从下方菜单选择服务以继续。`;
    }
    return {
      text: welcomeText,
      replyMarkup: menuKeyboard(locale, origin, miniAppEnabled, botName),
    };
  }

  const language = copy[locale];
  return {
    text: language.welcome.replace(/TUNG Shop/g, botName).replace(/\{botName\}/g, botName),
    replyMarkup: menuKeyboard(locale, origin, miniAppEnabled, botName),
  };
}

export function buildTelegramStaticReply(command: Exclude<TelegramCommand, "start" | "products" | "shop" | "orders" | "wallet" | "vi" | "topup" | "nap"> | "unknown", origin: string | undefined, locale: ShopLocale, botName: string, miniAppEnabled = false): TelegramReply {
  const language = miniAppEnabled ? copy[locale] : nativeCopy[locale];
  const replyMarkup = menuKeyboard(locale, origin, miniAppEnabled, botName);
  const r = (s: string) => s.replace(/TUNG Shop/g, botName).replace(/\{botName\}/g, botName);
  if (command === "order") return { text: r(language.order), replyMarkup };
  if (command === "keys") return { text: r(language.keys), replyMarkup };
  if (command === "help") return { text: r(language.help), replyMarkup };
  return { text: `${r(language.unknown)}\n\n${r(language.help)}`, replyMarkup };
}

export function buildTelegramProductsReply(products: PublicProduct[], origin: string | undefined, locale: ShopLocale, requestedPage = 0): TelegramReply {
  void origin;
  const language = copy[locale];
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const page = Math.max(0, Math.min(totalPages - 1, Math.floor(requestedPage)));
  const visible = products.slice(page * pageSize, page * pageSize + pageSize);
  if (!visible.length) {
    return {
      text: language.empty,
      replyMarkup: { inline_keyboard: [[{ text: "🏠 Menu", callback_data: "menu" }]] },
    };
  }
  const lines = visible.map((product, index) => `${page * pageSize + index + 1}. ${product.title} — ${formatProductPrice(product, locale)}`);
  const rows: TelegramInlineKeyboardButton[][] = visible.map((product) => ([{
    text: `🛒 ${product.title.slice(0, 48)}`,
    callback_data: `pd:${product.id}`,
  }]));
  const pagination: TelegramInlineKeyboardButton[] = [];
  if (page > 0) pagination.push({ text: language.previous, callback_data: `cat:${page - 1}` });
  if (page + 1 < totalPages) pagination.push({ text: language.next, callback_data: `cat:${page + 1}` });
  // Keep legacy products:N aliases for older messages.
  if (page > 0) {
    // already using cat:
  }
  if (pagination.length) rows.push(pagination);
  rows.push([{ text: "🏠 Menu", callback_data: "menu" }]);
  return {
    text: `${language.products} (${page + 1}/${totalPages})\n\n${lines.join("\n")}\n\n${language.shop}`,
    replyMarkup: { inline_keyboard: rows },
  };
}

export function telegramPrivateOnlyReply(locale: ShopLocale): TelegramReply {
  return { text: copy[locale].privateOnly };
}

export function telegramReadiness(bindings: TelegramBindings): TelegramReadiness {
  const tokenConfigured = isTelegramToken(bindings.TELEGRAM_BOT_TOKEN);
  const webhookSecretConfigured = isWebhookSecret(bindings.TELEGRAM_WEBHOOK_SECRET);
  const expectedUsernameConfigured = Boolean(normalizeBotUsername(bindings.TELEGRAM_BOT_USERNAME));
  const origin = normalizePublicOrigin(bindings.SHOP_PUBLIC_ORIGIN);
  const webhookUrl = origin ? new URL("/api/telegram/webhook", origin).toString() : null;
  return {
    ready: tokenConfigured && webhookSecretConfigured && expectedUsernameConfigured && Boolean(webhookUrl),
    tokenConfigured,
    webhookSecretConfigured,
    publicOriginConfigured: Boolean(origin),
    expectedUsernameConfigured,
    webhookUrl,
  };
}

export async function callTelegramBotApi<T>(tokenValue: string | undefined, method: TelegramApiMethod, payload: Record<string, unknown>): Promise<T> {
  if (!isTelegramToken(tokenValue)) throw new TelegramApiError("telegram_bot_not_configured");
  const token = tokenValue.trim();
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API_ORIGIN}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new TelegramApiError("telegram_api_unreachable");
  }
  const envelope = await readTelegramApiEnvelope(response);
  if (!response.ok || envelope.ok !== true) {
    const status = Number.isInteger(envelope.error_code) ? envelope.error_code : response.status;
    const retryAfter = typeof envelope.parameters?.retry_after === "number" && Number.isFinite(envelope.parameters.retry_after)
      ? Math.max(1, Math.min(86_400, Math.floor(envelope.parameters.retry_after)))
      : null;
    throw new TelegramApiError(
      `telegram_api_${status || "failed"}`,
      retryAfter,
      typeof envelope.description === "string" ? envelope.description.slice(0, 512) : null,
    );
  }
  return envelope.result as T;
}

export async function sendTelegramMessage(token: string | undefined, chatId: number, reply: TelegramReply) {
  return callTelegramBotApi(token, "sendMessage", {
    chat_id: chatId,
    text: reply.text.slice(0, 4_096),
    ...(reply.replyMarkup ? { reply_markup: reply.replyMarkup } : {}),
    ...(reply.protectContent ? { protect_content: true } : {}),
    link_preview_options: { is_disabled: true },
  });
}

export async function sendTelegramChatAction(token: string | undefined, chatId: number, action: "typing" | "upload_photo") {
  return callTelegramBotApi(token, "sendChatAction", {
    chat_id: chatId,
    action,
  });
}

export async function editTelegramMessage(token: string | undefined, chatId: number, messageId: number, reply: TelegramReply) {
  try {
    return await callTelegramBotApi(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: reply.text.slice(0, 4_096),
      ...(reply.replyMarkup ? { reply_markup: reply.replyMarkup } : {}),
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    if (error instanceof TelegramApiError
      && error.code === "telegram_api_400"
      && error.description?.toLowerCase().includes("message is not modified")) return null;
    throw error;
  }
}

export async function editTelegramCaption(token: string | undefined, chatId: number, messageId: number, reply: TelegramReply) {
  try {
    return await callTelegramBotApi(token, "editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption: reply.text.slice(0, 1_024),
      ...(reply.replyMarkup ? { reply_markup: reply.replyMarkup } : {}),
    });
  } catch (error) {
    if (error instanceof TelegramApiError
      && error.code === "telegram_api_400"
      && error.description?.toLowerCase().includes("message is not modified")) return null;
    throw error;
  }
}

const TELEGRAM_PHOTO_HOST_ALLOWLIST = new Set([
  "img.vietqr.io",
  "api.qrserver.com",
  "media.tung.codes",
  "media.tungjpstore.net",
  "tung.codes",
  "www.tung.codes",
  "tungjpstore.net",
  "www.tungjpstore.net",
  "qr.payos.vn",
  "img.payos.vn",
]);

const MAX_TELEGRAM_PHOTO_BYTES = 2 * 1024 * 1024;

function isAllowedTelegramPhotoUrl(photoUrl: string): URL | null {
  try {
    const url = new URL(photoUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!TELEGRAM_PHOTO_HOST_ALLOWLIST.has(url.hostname.toLowerCase())) return null;
    // QR image URLs (esp. api.qrserver.com + EMVCo) can exceed 1KB; that is fine
    // because we fetch bytes in-Worker and multipart-upload to Telegram.
    if (photoUrl.length > 8_192) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchTelegramPhotoBytes(photoUrl: string): Promise<{ bytes: Uint8Array; filename: string; contentType: string }> {
  const url = isAllowedTelegramPhotoUrl(photoUrl);
  if (!url) throw new TelegramApiError("telegram_photo_url_invalid");
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "image/*,*/*;q=0.8" },
    });
  } catch {
    throw new TelegramApiError("telegram_photo_fetch_failed");
  }
  if (!response.ok || !response.body) throw new TelegramApiError("telegram_photo_fetch_failed");
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_TELEGRAM_PHOTO_BYTES) {
    throw new TelegramApiError("telegram_photo_too_large");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 32 || buffer.byteLength > MAX_TELEGRAM_PHOTO_BYTES) {
    throw new TelegramApiError("telegram_photo_too_large");
  }
  const headerType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const contentType = headerType.startsWith("image/")
    ? headerType
    : url.pathname.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";
  const filename = contentType.includes("png") ? "qr.png" : contentType.includes("webp") ? "qr.webp" : "qr.jpg";
  return { bytes: new Uint8Array(buffer), filename, contentType };
}

/**
 * Send a payment QR as a real Telegram photo.
 *
 * Short VietQR URLs use Telegram's direct fetch for minimum latency. Long or
 * rejected URLs fall back to a Worker-side fetch and multipart upload.
 */
export async function sendTelegramPhoto(
  token: string | undefined,
  chatId: number,
  photoUrl: string,
  options: { caption?: string; replyMarkup?: TelegramReplyMarkup } = {},
) {
  if (!isTelegramToken(token)) throw new TelegramApiError("telegram_bot_not_configured");
  const tokenValue = token.trim();
  const caption = options.caption?.slice(0, 1_024);
  const replyMarkup = options.replyMarkup ? JSON.stringify(options.replyMarkup) : null;
  const safePhotoUrl = isAllowedTelegramPhotoUrl(photoUrl);
  if (!safePhotoUrl) throw new TelegramApiError("telegram_photo_url_invalid");
  const directUrlEligible = safePhotoUrl.hostname === "img.vietqr.io" && photoUrl.length <= 1_024;

  // Short payOS/VietQR links let Telegram fetch the image directly, removing a
  // full download and multipart upload from the checkout hot path.
  if (directUrlEligible) {
    try {
      return await callTelegramBotApi(tokenValue, "sendPhoto", {
        chat_id: chatId,
        photo: photoUrl,
        ...(caption ? { caption } : {}),
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      });
    } catch (error) {
      // A 400 commonly means Telegram could not fetch the remote image. Only
      // then fall back to uploading bytes; rate limits and outages fail fast.
      if (!(error instanceof TelegramApiError) || error.code !== "telegram_api_400") throw error;
    }
  }

  // Reliable fallback for providers or URLs Telegram cannot fetch directly.
  try {
    const image = await fetchTelegramPhotoBytes(photoUrl);
    const form = new FormData();
    form.set("chat_id", String(chatId));
    // File/Blob upload avoids Telegram remote-fetch failures and long-URL limits
    // (api.qrserver.com + full EMVCo payloads routinely exceed 1KB).
    const fileBytes = new Uint8Array(image.bytes.byteLength);
    fileBytes.set(image.bytes);
    const file = new File([fileBytes.buffer], image.filename, { type: image.contentType });
    form.set("photo", file);
    if (caption) form.set("caption", caption);
    if (replyMarkup) form.set("reply_markup", replyMarkup);
    let response: Response;
    try {
      response = await fetch(`${TELEGRAM_API_ORIGIN}/bot${tokenValue}/sendPhoto`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new TelegramApiError("telegram_api_unreachable");
    }
    const envelope = await readTelegramApiEnvelope(response);
    if (!response.ok || envelope.ok !== true) {
      const status = Number.isInteger(envelope.error_code) ? envelope.error_code : response.status;
      throw new TelegramApiError(`telegram_api_${status || "failed"}`);
    }
    return envelope.result;
  } catch (uploadError) {
    // Fallback for non-VietQR short public URLs.
    if (!directUrlEligible && photoUrl.length <= 1_024) {
      return callTelegramBotApi(tokenValue, "sendPhoto", {
        chat_id: chatId,
        photo: photoUrl,
        ...(caption ? { caption } : {}),
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      });
    }
    throw uploadError instanceof TelegramApiError ? uploadError : new TelegramApiError("telegram_photo_upload_failed");
  }
}

/** Whether a URL is safe/usable as a Telegram photo source for QR delivery. */
export function isTelegramQrPhotoUrl(photoUrl: string | null | undefined): photoUrl is string {
  return Boolean(photoUrl && isAllowedTelegramPhotoUrl(photoUrl));
}

export async function answerTelegramCallback(token: string | undefined, callbackQueryId: string, text?: string, showAlert = false) {
  return callTelegramBotApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 200), show_alert: showAlert } : {}),
  });
}

export async function getTelegramBotIdentity(
  bindings: Pick<TelegramBindings, "TELEGRAM_BOT_TOKEN"> | { TELEGRAM_BOT_TOKEN?: string },
): Promise<TelegramBotIdentity> {
  const result = await callTelegramBotApi<Record<string, unknown>>(bindings.TELEGRAM_BOT_TOKEN, "getMe", {});
  const id = asSafeInteger(result.id);
  const firstName = typeof result.first_name === "string" ? result.first_name.slice(0, 128) : "";
  const username = typeof result.username === "string" ? result.username.slice(0, 64) : null;
  if (id === null || !firstName) throw new TelegramApiError("telegram_identity_invalid");
  return { id, firstName, username };
}

export async function getTelegramConfigurationStatus(bindings: TelegramBindings) {
  const readiness = telegramReadiness(bindings);
  if (!readiness.ready) return {
    ...readiness,
    reachable: false,
    identity: null,
    identityMatchesExpected: false,
    webhookConfigured: false,
    allowedUpdatesConfigured: false,
    pendingUpdateCount: 0,
    lastWebhookErrorAt: null,
  };
  const [identity, webhook] = await Promise.all([
    getTelegramBotIdentity(bindings),
    callTelegramBotApi<Record<string, unknown>>(bindings.TELEGRAM_BOT_TOKEN, "getWebhookInfo", {}),
  ]);
  const expectedUsername = normalizeBotUsername(bindings.TELEGRAM_BOT_USERNAME);
  const configuredUrl = typeof webhook.url === "string" ? webhook.url : "";
  const allowedUpdates = Array.isArray(webhook.allowed_updates)
    ? webhook.allowed_updates.filter((value): value is string => typeof value === "string")
    : [];
  const pendingUpdateCount = asSafeInteger(webhook.pending_update_count) ?? 0;
  const lastErrorDate = asSafeInteger(webhook.last_error_date);
  return {
    ...readiness,
    reachable: true,
    identity,
    identityMatchesExpected: Boolean(expectedUsername && identity.username?.toLowerCase() === expectedUsername),
    webhookConfigured: configuredUrl === readiness.webhookUrl,
    allowedUpdatesConfigured: allowedUpdates.length === 2 && allowedUpdates.includes("message") && allowedUpdates.includes("callback_query"),
    pendingUpdateCount: Math.max(0, pendingUpdateCount),
    lastWebhookErrorAt: lastErrorDate && lastErrorDate > 0 ? new Date(lastErrorDate * 1_000).toISOString() : null,
  };
}

export async function getTelegramMiniAppEnabledSetting(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  try {
    const row = await db.prepare("SELECT config_json FROM site_state WHERE id = 'default' LIMIT 1")
      .first<{ config_json: string }>();
    if (!row?.config_json) return false;
    const config = JSON.parse(row.config_json);
    return Boolean(config.telegramMiniAppEnabled);
  } catch {
    return false;
  }
}

export async function configureTelegramBot(bindings: TelegramBindings) {
  const readiness = telegramReadiness(bindings);
  if (!readiness.ready || !readiness.webhookUrl || !bindings.TELEGRAM_WEBHOOK_SECRET) throw new TelegramApiError("telegram_bot_not_configured");
  const identity = await getTelegramBotIdentity(bindings);
  const expectedUsername = normalizeBotUsername(bindings.TELEGRAM_BOT_USERNAME);
  if (!expectedUsername || identity.username?.toLowerCase() !== expectedUsername) throw new TelegramApiError("telegram_identity_mismatch");
  const privateChatScope = { type: "all_private_chats" };
  // The environment-token bot is the Vietnam-only legacy bot. Registry
  // managed bots configure their own localized command menus separately.
  const miniAppEnabled = bindings.CONTENT_DB ? await getTelegramMiniAppEnabledSetting(bindings.CONTENT_DB) : false;
  const commandSet = miniAppEnabled ? TELEGRAM_COMMANDS : TELEGRAM_COMMANDS_NATIVE;
  await callTelegramBotApi(bindings.TELEGRAM_BOT_TOKEN, "setMyCommands", { commands: commandSet.vi, scope: privateChatScope });
  if (miniAppEnabled) {
    const miniAppUrl = telegramMiniAppUrl(bindings.SHOP_PUBLIC_ORIGIN);
    if (!miniAppUrl) throw new TelegramApiError("telegram_bot_not_configured");
    await callTelegramBotApi(bindings.TELEGRAM_BOT_TOKEN, "setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: `Mở ${identity.firstName || "TUNG Shop"}`,
        web_app: { url: miniAppUrl },
      },
    });
  } else {
    await callTelegramBotApi(bindings.TELEGRAM_BOT_TOKEN, "setChatMenuButton", {
      menu_button: { type: "commands" },
    });
  }
  // The webhook is activated last so a partial command-menu failure cannot
  // expose an incompletely configured bot to live updates.
  await callTelegramBotApi(bindings.TELEGRAM_BOT_TOKEN, "setWebhook", {
    url: readiness.webhookUrl,
    secret_token: bindings.TELEGRAM_WEBHOOK_SECRET.trim(),
    allowed_updates: ["message", "callback_query"],
    max_connections: 10,
  });
  return { identity, webhookUrl: readiness.webhookUrl, commandsConfigured: true };
}

export async function cleanupExpiredTelegramUpdates(db: D1Database, limit = 100) {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const now = new Date().toISOString();
  const result = await db.prepare(`DELETE FROM shop_telegram_updates WHERE (bot_config_id, update_id) IN (
      SELECT bot_config_id, update_id FROM shop_telegram_updates WHERE expires_at <= ? ORDER BY expires_at, bot_config_id, update_id LIMIT ?
    ) AND expires_at <= ?`).bind(now, boundedLimit, now).run();
  return result.meta.changes;
}

function telegramBotScope(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{8,80}$/.test(value) ? value : null;
}

export async function claimTelegramUpdate(db: D1Database, updateId: number, payloadHash: string, type: string, botConfigId?: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseToken = randomOpaqueToken(32);
  const leaseTokenHash = await sha256Base64Url(leaseToken);
  const leaseExpiresAt = new Date(now.getTime() + UPDATE_LEASE_SECONDS * 1_000).toISOString();
  const expiresAt = new Date(now.getTime() + UPDATE_RETENTION_DAYS * 86_400_000).toISOString();
  const scope = telegramBotScope(botConfigId);
  const results = scope ? await db.batch([
    db.prepare(`INSERT OR IGNORE INTO shop_telegram_updates
      (bot_config_id, update_id, payload_hash, update_type, status, attempt_count, expires_at, received_at, updated_at)
      VALUES (?, ?, ?, ?, 'failed', 0, ?, ?, ?)`).bind(scope, updateId, payloadHash, type.slice(0, 40), expiresAt, nowIso, nowIso),
    db.prepare(`UPDATE shop_telegram_updates SET status = 'processing', attempt_count = attempt_count + 1,
        lock_token_hash = ?, lock_expires_at = ?, last_error_code = NULL, updated_at = ?
      WHERE bot_config_id = ? AND update_id = ? AND payload_hash = ? AND status IN ('failed', 'processing')
        AND (status = 'failed' OR lock_expires_at IS NULL OR lock_expires_at <= ?)`)
      .bind(leaseTokenHash, leaseExpiresAt, nowIso, scope, updateId, payloadHash, nowIso),
  ]) : await db.batch([
    db.prepare(`INSERT OR IGNORE INTO shop_telegram_updates
      (update_id, payload_hash, update_type, status, attempt_count, expires_at, received_at, updated_at)
      VALUES (?, ?, ?, 'failed', 0, ?, ?, ?)`).bind(updateId, payloadHash, type.slice(0, 40), expiresAt, nowIso, nowIso),
    db.prepare(`UPDATE shop_telegram_updates SET status = 'processing', attempt_count = attempt_count + 1,
        lock_token_hash = ?, lock_expires_at = ?, last_error_code = NULL, updated_at = ?
      WHERE update_id = ? AND payload_hash = ? AND status IN ('failed', 'processing')
        AND (status = 'failed' OR lock_expires_at IS NULL OR lock_expires_at <= ?)`)
      .bind(leaseTokenHash, leaseExpiresAt, nowIso, updateId, payloadHash, nowIso),
  ]);
  if (results[1]?.meta.changes === 1) return { state: "claimed" as const, leaseToken };
  const row = scope
    ? await db.prepare("SELECT payload_hash, status, lock_expires_at FROM shop_telegram_updates WHERE bot_config_id = ? AND update_id = ? LIMIT 1").bind(scope, updateId).first<TelegramUpdateRow>()
    : await db.prepare("SELECT payload_hash, status, lock_expires_at FROM shop_telegram_updates WHERE update_id = ? LIMIT 1").bind(updateId).first<TelegramUpdateRow>();
  if (!row) return { state: "unavailable" as const, leaseToken: null };
  if (row.payload_hash !== payloadHash) return { state: "conflict" as const, leaseToken: null };
  return { state: row.status === "completed" ? "completed" as const : "processing" as const, leaseToken: null };
}

export async function completeTelegramUpdate(db: D1Database, updateId: number, leaseToken: string, botConfigId?: string) {
  const now = new Date().toISOString();
  const leaseTokenHash = await sha256Base64Url(leaseToken);
  const scope = telegramBotScope(botConfigId);
  const result = scope
    ? await db.prepare(`UPDATE shop_telegram_updates SET status = 'completed', processed_at = ?,
        lock_token_hash = NULL, lock_expires_at = NULL, last_error_code = NULL, updated_at = ?
      WHERE bot_config_id = ? AND update_id = ? AND status = 'processing' AND lock_token_hash = ? AND lock_expires_at > ?`)
      .bind(now, now, scope, updateId, leaseTokenHash, now).run()
    : await db.prepare(`UPDATE shop_telegram_updates SET status = 'completed', processed_at = ?,
        lock_token_hash = NULL, lock_expires_at = NULL, last_error_code = NULL, updated_at = ?
      WHERE update_id = ? AND status = 'processing' AND lock_token_hash = ? AND lock_expires_at > ?`)
      .bind(now, now, updateId, leaseTokenHash, now).run();
  return result.meta.changes === 1;
}

export async function failTelegramUpdate(db: D1Database, updateId: number, leaseToken: string, errorCode: string, botConfigId?: string) {
  const now = new Date().toISOString();
  const leaseTokenHash = await sha256Base64Url(leaseToken);
  const safeCode = /^[A-Za-z0-9._:-]{1,80}$/.test(errorCode) ? errorCode : "telegram_processing_failed";
  const scope = telegramBotScope(botConfigId);
  const result = scope
    ? await db.prepare(`UPDATE shop_telegram_updates SET status = 'failed', last_error_code = ?,
        lock_token_hash = NULL, lock_expires_at = NULL, updated_at = ?
      WHERE bot_config_id = ? AND update_id = ? AND status = 'processing' AND lock_token_hash = ?`)
      .bind(safeCode, now, scope, updateId, leaseTokenHash).run()
    : await db.prepare(`UPDATE shop_telegram_updates SET status = 'failed', last_error_code = ?,
        lock_token_hash = NULL, lock_expires_at = NULL, updated_at = ?
      WHERE update_id = ? AND status = 'processing' AND lock_token_hash = ?`)
      .bind(safeCode, now, updateId, leaseTokenHash).run();
  return result.meta.changes === 1;
}
