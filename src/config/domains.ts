/**
 * Canonical public hosts plus compatibility aliases kept during migration.
 */
export const SITE_ORIGIN = "https://tung.codes";
export const SITE_HOST = "tung.codes";
export const SITE_WWW_HOST = "www.tung.codes";

export const LEGACY_SITE_HOSTS = new Set(["tungjpstore.net", "www.tungjpstore.net"]);
export const MEDIA_HOSTS = new Set(["media.tung.codes", "media.tungjpstore.net"]);

const normalizeHost = (hostname: string) => hostname.toLowerCase().replace(/\.+$/, "");

export const isLegacySiteHost = (hostname: string | null | undefined) =>
	Boolean(hostname && LEGACY_SITE_HOSTS.has(normalizeHost(hostname)));

export const isMediaHost = (hostname: string | null | undefined) =>
	Boolean(hostname && MEDIA_HOSTS.has(normalizeHost(hostname)));
