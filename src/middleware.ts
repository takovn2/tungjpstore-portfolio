import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { isLegacySiteHost, SITE_HOST, SITE_WWW_HOST } from "./config/domains";
import { getLocaleCookie, getCountryCode } from "./i18n/locale-preference";
import { getMarketCookie, listMarkets, resolveMarket } from "./lib/shop/market";

const localePrefixPattern = /^\/(vi|en|ja|zh)(?=\/|$)/;
const nonPagePathPattern = /^\/(?:admin|api|telegram|_astro|_image|favicon\.ico|robots\.txt|sitemap(?:\.xml)?|site\.webmanifest)(?:\/|$)/i;
/**
 * Market landing route. Excluded from the locale redirect on purpose: the route
 * sets the language itself, and redirecting it first would turn
 * /shop/market/ph into /en/shop/market/ph, which matches no route and 404s.
 * Most target markets resolve to `en`, so this would break nearly every visit.
 */
const marketLandingPattern = /^\/shop\/market(?:\/|$)/;

/**
 * Resolve the visitor's market once per request.
 *
 * Only done for page requests: api routes such as /api/shop/payment-methods
 * resolve their own market because they need the raw inputs, and running three
 * D1 queries on every asset and webhook would be waste.
 */
async function resolveRequestMarket(request: Request): Promise<{
	markets: Awaited<ReturnType<typeof listMarkets>> | null;
	market: ReturnType<typeof resolveMarket>;
}> {
	let markets: Awaited<ReturnType<typeof listMarkets>> | null = null;
	try {
		if (env.CONTENT_DB) {
			const loaded = await listMarkets(env.CONTENT_DB);
			markets = loaded.length ? loaded : null;
		}
	} catch {
		markets = null;
	}
	const url = new URL(request.url);
	const market = resolveMarket({
		explicit: url.searchParams.get("market") ?? getMarketCookie(request),
		country: getCountryCode(request),
		acceptLanguage: request.headers.get("accept-language"),
		...(markets ? { markets } : {}),
	});
	return { markets, market };
}

function localeRedirect(request: Request, market: ReturnType<typeof resolveMarket>): Response | null {
	if (request.method !== "GET" && request.method !== "HEAD") return null;
	const url = new URL(request.url);
	if (nonPagePathPattern.test(url.pathname) || localePrefixPattern.test(url.pathname)) return null;
	if (marketLandingPattern.test(url.pathname)) return null;
	if (!(request.headers.get("accept") || "").toLowerCase().includes("text/html")) return null;

	// Precedence: an explicit locale choice, then the market (chosen market,
	// then country, then Accept-Language), then the default market.
	// The market layer adds the last two: the site previously ignored
	// Accept-Language entirely, so a Vietnamese-speaking visitor in Germany got
	// English because their IP said DE.
	const cookieLocale = getLocaleCookie(request);
	const targetLocale = cookieLocale ?? market.market.locale;
	// The unprefixed route is Vietnamese. Redirect only when the visitor's
	// explicit preference or geo default points at another locale.
	if (targetLocale === "vi") return null;
	const localizedPath = `/${targetLocale}${url.pathname === "/" ? "" : url.pathname}`;
	const target = new URL(localizedPath, url.origin);
	target.search = url.search;
	const headers = new Headers({ Location: target.href, "Cache-Control": "no-store, max-age=0", "Cloudflare-CDN-Cache-Control": "no-store, max-age=0" });
	return new Response(null, { status: 302, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
	const host = context.request.headers.get("host")?.split(":")[0].toLowerCase();
	const requestUrl = new URL(context.request.url);
	const isProductionHost = host === SITE_HOST || host === SITE_WWW_HOST || isLegacySiteHost(host);
	const isSafeRedirectMethod = context.request.method === "GET" || context.request.method === "HEAD";
	if (isProductionHost && requestUrl.protocol === "http:" && (isSafeRedirectMethod || !isLegacySiteHost(host))) {
		const target = new URL(context.request.url);
		target.protocol = "https:";
		if (host === SITE_WWW_HOST || host === "www.tungjpstore.net") target.hostname = SITE_HOST;
		return Response.redirect(target, 308);
	}
	if (host === SITE_WWW_HOST) {
		const target = new URL(context.request.url);
		target.hostname = SITE_HOST;
		return Response.redirect(target, 308);
	}
	// Keep old browser links useful without redirecting provider POST webhooks.
	if (isLegacySiteHost(host) && isSafeRedirectMethod) {
		const target = new URL(requestUrl);
		target.protocol = "https:";
		target.hostname = SITE_HOST;
		return Response.redirect(target, 308);
	}
	const requestPath = requestUrl.pathname;
	if (!nonPagePathPattern.test(requestPath) && !marketLandingPattern.test(requestPath)) {
		const { markets, market } = await resolveRequestMarket(context.request);
		context.locals.markets = markets;
		context.locals.market = market;
		const geoLocaleRedirect = localeRedirect(context.request, market);
		if (geoLocaleRedirect) return geoLocaleRedirect;
	}

	const response = await next();
	const headers = new Headers(response.headers);
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("X-Frame-Options", "DENY");
	if (requestUrl.protocol === "https:" && isProductionHost) {
		// Start with a one-year policy; preload is intentionally omitted until every subdomain is audited.
		headers.set("Strict-Transport-Security", "max-age=31536000");
	}
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
	headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob: https://media.tung.codes https://media.tungjpstore.net https://img.vietqr.io https://api.qrserver.com; script-src 'self' 'unsafe-inline' https://telegram.org https://static.cloudflareinsights.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cloudflareinsights.com https://*.cloudflareinsights.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com;");
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
