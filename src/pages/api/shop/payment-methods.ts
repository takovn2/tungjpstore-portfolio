import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { normalizeLocale, resolveRequestLocale, getCountryCode } from "../../../i18n/locale-preference";
import { listCryptoPaymentMethods } from "../../../lib/shop/repository";
import { getMarketCookie, listMarkets, orderedRails, resolveMarket } from "../../../lib/shop/market";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const explicitLocale = normalizeLocale(url.searchParams.get("locale"));
  const locale = explicitLocale ?? resolveRequestLocale(request);
  const country = getCountryCode(request);

  // Which rails to offer used to be one boolean:
  //   isInternational = locale !== "vi" || country !== "VN"
  // It is now data: the market decides, and an operator can reorder rails per
  // market without a deploy. No database rows means the built-in defaults, which
  // reproduce the old behaviour exactly.
  let markets: Awaited<ReturnType<typeof listMarkets>> = [];
  if (env.CONTENT_DB) {
    try {
      markets = await listMarkets(env.CONTENT_DB);
    } catch {
      markets = [];
    }
  }
  const resolution = resolveMarket({
    explicit: url.searchParams.get("market") ?? getMarketCookie(request),
    country,
    acceptLanguage: request.headers.get("accept-language"),
    ...(markets.length ? { markets } : {}),
  });
  const railOrder = orderedRails(resolution.market).map((rail) => rail.railId);

  const vietQrMethod = {
    id: "payos",
    provider: "payos",
    rail: "bank_transfer",
    asset: "VND",
    network: "VIETQR",
    displayName: "PayOS · VietQR",
  };

  let cryptoMethods: Array<{
    id: string;
    provider: string;
    rail: string;
    asset: string;
    network: string;
    displayName: string;
  }> = [];

  if (env.CONTENT_DB) {
    try {
      const activeCrypto = await listCryptoPaymentMethods(env.CONTENT_DB, true, "glb");
      cryptoMethods = activeCrypto.map((method) => ({
        id: method.id,
        provider: method.provider,
        rail: method.rail,
        asset: method.asset,
        network: method.network || "",
        displayName: method.displayName || `${method.provider.toUpperCase()} · ${method.asset}`,
      }));
    } catch {
      cryptoMethods = [];
    }
  }

  const { getCustomerSession } = await import("../../../lib/shop/customer-auth");
  const session = await getCustomerSession(env, request);
  let walletMethod: {
    id: string;
    provider: string;
    rail: string;
    asset: string;
    network: string;
    displayName: string;
  } | null = null;

  if (session && env.CONTENT_DB) {
    try {
      const row = await env.CONTENT_DB.prepare(`
        SELECT COALESCE(balance_vnd_minor, 0) AS balance_vnd,
               COALESCE(balance_usd_minor, 0) AS balance_usd
        FROM shop_customer_wallets
        WHERE customer_id = ?
      `).bind(session.customerId).first<{ balance_vnd: number; balance_usd: number }>();

      const balanceVnd = row?.balance_vnd ?? 0;
      const balanceUsd = row?.balance_usd ?? 0;
      const isUsd = locale !== "vi";
      const balanceMinor = isUsd ? balanceUsd : balanceVnd;
      const formattedBalance = isUsd
        ? `$${(balanceMinor / 100).toFixed(2)}`
        : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(balanceMinor);

      walletMethod = {
        id: "wallet",
        provider: "wallet",
        rail: "store_credit",
        asset: isUsd ? "USD" : "VND",
        network: "WALLET",
        displayName: locale === "vi"
          ? `⚡ Ví số dư (Còn: ${formattedBalance})`
          : locale === "ja"
            ? `⚡ 残高払い (残高: ${formattedBalance})`
            : locale === "zh"
              ? `⚡ 余额支付 (余额: ${formattedBalance})`
              : `⚡ Account Balance (Balance: ${formattedBalance})`,
      };
    } catch {}
  }

  // Rails in the market's priority order. A rail with no configured methods
  // contributes nothing, which is what lets one market list a rail before it is
  // actually switched on.
  const baseMethods: typeof cryptoMethods = [];
  for (const railId of railOrder) {
    if (railId === "crypto") baseMethods.push(...cryptoMethods);
    else if (railId === "payos") baseMethods.push(vietQrMethod);
  }

  // Last resort, preserved from the old branch: if the market produced nothing
  // usable (for example crypto is listed first but no method is configured yet),
  // still offer VietQR rather than an empty checkout.
  if (baseMethods.length === 0) baseMethods.push(vietQrMethod);

  const methods = walletMethod ? [walletMethod, ...baseMethods] : baseMethods;

  return new Response(JSON.stringify({
    ok: true,
    locale,
    country,
    market: resolution.market.code,
    marketCurrency: resolution.market.currency,
    rails: railOrder,
    methods,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
};

export const ALL: APIRoute = () => new Response(JSON.stringify({ ok: false, code: "method_not_allowed" }), { status: 405 });
