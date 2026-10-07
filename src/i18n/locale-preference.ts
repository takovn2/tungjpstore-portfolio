import { locales, type Locale } from "./dictionaries.ts";

/** Client-readable preference used after a visitor explicitly chooses a locale. */
export const LOCALE_COOKIE_NAME = "tung_locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const localeCurrency: Record<Locale, "VND" | "USD"> = {
	vi: "VND",
	en: "USD",
	ja: "USD",
	zh: "USD",
};

const localeSet = new Set<string>(locales);

export function normalizeLocale(value: string | null | undefined): Locale | null {
	if (!value) return null;
	const candidate = value.trim().toLowerCase().split("-")[0];
	return localeSet.has(candidate) ? candidate as Locale : null;
}

export function parseCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const separator = part.indexOf("=");
		if (separator < 0) continue;
		if (part.slice(0, separator).trim() !== name) continue;
		try {
			return decodeURIComponent(part.slice(separator + 1).trim());
		} catch {
			return null;
		}
	}
	return null;
}

export function getLocaleCookie(request: Request): Locale | null {
	return normalizeLocale(parseCookieValue(request.headers.get("cookie"), LOCALE_COOKIE_NAME));
}

export function getCountryCode(request: Request): string | null {
	const requestWithCf = request as Request & { cf?: { country?: string } };
	const country = requestWithCf.cf?.country || request.headers.get("CF-IPCountry") || request.headers.get("CF-Connecting-Country") || request.headers.get("X-Country");
	const normalized = country?.trim().toUpperCase();
	return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

/** Minimal shape needed to resolve a locale, so this module need not import the market module. */
type LocaleMarket = { countryCodes: string[]; locale: Locale; enabled?: boolean };

/**
 * Language for a country.
 *
 * With markets loaded, the mapping is data: an operator can point a country at
 * any language without a deploy. The four hardcoded branches below are the
 * pre-0054 fallback, kept so a request still resolves when `shop_markets` has no
 * rows or the migration has not run.
 *
 * When markets are supplied but the country matches none of them, this falls
 * through to the branches rather than returning the default market's locale:
 * `en` is the documented behaviour for an unrecognised country and callers rely
 * on it.
 */
export function localeForCountry(
	country: string | null | undefined,
	markets?: readonly LocaleMarket[] | null,
): Locale {
	if (markets?.length) {
		const code = country?.trim().toUpperCase();
		if (code) {
			const match = markets.find(
				(item) => item.enabled !== false && item.countryCodes.includes(code),
			);
			if (match) return match.locale;
		}
	}
	const fallbackCode = country?.trim().toUpperCase();
	if (fallbackCode === "VN") return "vi";
	if (fallbackCode === "JP") return "ja";
	if (fallbackCode === "CN" || fallbackCode === "TW" || fallbackCode === "HK" || fallbackCode === "MO") return "zh";
	return "en";
}

/**
 * Manual selection wins; an absent/unknown country follows the global default.
 * Pass `Astro.locals.markets` where available so the language agrees with the
 * market the middleware already resolved, instead of re-deriving it here.
 */
export function resolveRequestLocale(request: Request, markets?: readonly LocaleMarket[] | null): Locale {
	const cookieLocale = getLocaleCookie(request);
	if (cookieLocale) return cookieLocale;
	return localeForCountry(getCountryCode(request), markets);
}

export function currencyForLocale(locale: Locale): "VND" | "USD" {
	return localeCurrency[locale];
}

export function isSupportedLocaleSegment(segment: string | undefined): segment is Locale {
	return Boolean(normalizeLocale(segment));
}

export function setLocaleCookieValue(locale: Locale): string {
	return `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}
