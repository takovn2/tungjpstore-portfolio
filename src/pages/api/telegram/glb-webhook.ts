import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  answerTelegramCallback,
  claimTelegramUpdate,
  completeTelegramUpdate,
  failTelegramUpdate,
  readTelegramUpdate,
  sendTelegramMessage,
  TelegramApiError,
  type TelegramReply,
  type TelegramUser,
} from "../../../lib/shop/telegram";
import { resolveTelegramBotByWebhookSecret } from "../../../lib/shop/telegram-bot-config";

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function appUrl(configId: string) {
  const origin = env.SHOP_PUBLIC_ORIGIN?.trim() || "";
  try {
    const url = new URL("/telegram/glb", origin);
    url.searchParams.set("bot", configId);
    return url.toString();
  } catch {
    return null;
  }
}

async function buildGlbWelcomeReply(user: TelegramUser | undefined, configId: string, db: D1Database): Promise<TelegramReply> {
  const url = appUrl(configId);
  let name = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username : "";
  name = name ? ` ${name}` : "";
  let walletStr = "$0.00 USD";
  let tierBadge = "🌟 Standard Member";

  if (user && db) {
    try {
      const { getTelegramCustomerWallet } = await import("../../../lib/shop/telegram-commerce");
      const wallet = await getTelegramCustomerWallet({ CONTENT_DB: db }, user, "en");
      walletStr = `$${(wallet.balanceUsdMinor / 100).toFixed(2)} USD`;
      tierBadge = wallet.tierBadge;
    } catch {
      // fallback
    }
  }

  const text = [
    `✨ *GLB STORE · DIGITAL PRODUCTS* ✨`,
    `_Instant Digital License Delivery • Global Crypto Payments_`,
    `──────────────────────────────`,
    `👋 Hello${name}!`,
    `👑 VIP Tier: *${tierBadge}*`,
    `👛 Wallet Balance: *${walletStr}*`,
    `──────────────────────────────`,
    `⚡ *Auto Key Delivery 24/7 in 3 seconds*`,
    `💎 *Supported:* USDT (TRC20/ERC20/BEP20), Binance Pay, Bybit Pay`,
    `🛡️ *Full Replacement Warranty & 24/7 Priority Support*`,
    `──────────────────────────────`,
    `Tap the button below to browse products and order:`,
  ].join("\n");

  const webUrl = env.SHOP_PUBLIC_ORIGIN ? `${env.SHOP_PUBLIC_ORIGIN}/en/shop` : "https://tung.codes/en/shop";

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        ...(url ? [[{ text: "✨ Open GLB Store (Mini App)", web_app: { url } }]] : []),
        [
          { text: "🤖 24/7 Support", callback_data: "help" },
          { text: "🌐 Visit Web Shop", url: webUrl },
        ],
      ],
    },
  };
}

export const POST: APIRoute = async ({ request }) => {
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  const botHint = new URL(request.url).searchParams.get("bot");
  const resolved = await resolveTelegramBotByWebhookSecret(env.CONTENT_DB, env, suppliedSecret, botHint, "glb").catch(() => null);
  if (!resolved?.credential) return json({ ok: false, code: "telegram_webhook_unauthorized" }, 401);
  const parsed = await readTelegramUpdate(request);
  if (!parsed.ok) return parsed.response;
  const runtime = resolved.credential;
  const message = parsed.update.message;
  const callback = parsed.update.callback_query;
  const requestId = crypto.randomUUID();
  try {
    // Telegram may retry an update while a previous request is still sending
    // messages. Claiming by (bot, update_id, payload hash) makes delivery
    // idempotent without allowing one bot to suppress another bot's update.
    const claim = await claimTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, parsed.payloadHash, parsed.type, runtime.configId);
    if (claim.state === "completed" || claim.state === "processing" || claim.state === "conflict") {
      return json({ ok: true, duplicate: true });
    }
    if (claim.state !== "claimed" || !claim.leaseToken) return json({ ok: false, code: "telegram_update_unavailable" }, 503);

    try {
      if (callback) {
        if (callback.data === "help") {
          await answerTelegramCallback(runtime.token, callback.id, "💡 Send any message in chat to ask AI Support 24/7!").catch(() => undefined);
        } else {
          await answerTelegramCallback(runtime.token, callback.id, "GLB Store").catch(() => undefined);
        }
      }
      const chatId = message?.chat.id ?? callback?.message?.chat.id;
      const user = message?.from ?? callback?.from;
      if (chatId && (message?.chat.type === "private" || callback?.message?.chat.type === "private")) {
        const rawText = (message?.text || "").trim();
        const command = rawText.toLowerCase().split(/\s+/, 1)[0];
        let replyObj: TelegramReply;
        if (command === "/help" || (rawText.length > 3 && !rawText.startsWith("/"))) {
          const { resolveAssistantQuery } = await import("../../../lib/shop/assistant");
          const assistant = resolveAssistantQuery(rawText, "en");
          let text = `💡 *${assistant.title}*\n\n${assistant.answer}`;
          if (assistant.steps?.length) {
            text += `\n\n${assistant.steps.join("\n")}`;
          }
          const url = appUrl(runtime.configId);
          replyObj = {
            text,
            replyMarkup: {
              inline_keyboard: [
                ...(url ? [[{ text: "✨ Open GLB Store", web_app: { url } }]] : []),
              ],
            },
          };
        } else {
          replyObj = await buildGlbWelcomeReply(user, runtime.configId, env.CONTENT_DB);
        }
        await sendTelegramMessage(runtime.token, chatId, replyObj);
      }
      if (!await completeTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, claim.leaseToken, runtime.configId)) {
        throw new Error("telegram_update_lease_invalid");
      }
      console.log(JSON.stringify({ event: "glb_telegram_update_completed", requestId, updateId: parsed.update.update_id, botConfigId: runtime.configId }));
      return json({ ok: true });
    } catch (error) {
      const terminalTelegramError = error instanceof TelegramApiError
        && (error.code === "telegram_api_400" || error.code === "telegram_api_401" || error.code === "telegram_api_403");
      if (terminalTelegramError) {
        await completeTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, claim.leaseToken, runtime.configId).catch(() => false);
      } else {
        await failTelegramUpdate(env.CONTENT_DB, parsed.update.update_id, claim.leaseToken,
          error instanceof Error && /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/.test(error.message) ? error.message : "telegram_update_failed",
          runtime.configId).catch(() => false);
      }
      console.error(JSON.stringify({ event: "glb_telegram_update_failed", requestId, updateId: parsed.update.update_id, botConfigId: runtime.configId, errorName: error instanceof Error ? error.name : typeof error }));
      return terminalTelegramError ? json({ ok: true, dropped: true }) : json({ ok: false, code: "telegram_update_retry" }, 503);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "glb_telegram_webhook_failed", requestId, errorName: error instanceof Error ? error.name : "unknown" }));
    return json({ ok: false, code: "telegram_delivery_failed" }, 502);
  }
};
