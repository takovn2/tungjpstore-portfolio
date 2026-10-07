import { env } from "cloudflare:workers";
import type { AdminLocale, ContentType } from "./admin/types";
import { getPublicContentItem, getPublicContentSnapshot } from "./content-store";
import { listPublicProducts } from "./shop/repository";

const bindings = env;

export async function loadPublicSnapshot(locale: AdminLocale, options: { includeShop?: boolean } = {}) {
  const snapshot = await getPublicContentSnapshot(bindings.CONTENT_DB, {
    locale,
    mediaPublicBaseUrl: bindings.MEDIA_PUBLIC_BASE_URL,
  });
  if (!options.includeShop || !bindings.CONTENT_DB || snapshot.status === "unavailable") return { ...snapshot, shopProducts: [] };
  try {
    return { ...snapshot, shopProducts: await listPublicProducts(bindings.CONTENT_DB, { locale, limit: 100 }) };
  } catch {
    return { ...snapshot, shopProducts: [] };
  }
}

export async function loadPublicContentItem(input: { type: ContentType; slug: string; locale: AdminLocale }) {
  return getPublicContentItem(bindings.CONTENT_DB, {
    ...input,
    mediaPublicBaseUrl: bindings.MEDIA_PUBLIC_BASE_URL,
  });
}

export function isManagedSlug(snapshot: Awaited<ReturnType<typeof loadPublicSnapshot>>, type: ContentType, slug: string) {
  return snapshot.managedSlugs[type].includes(slug);
}

export function publicContactEmail(snapshot: Awaited<ReturnType<typeof loadPublicSnapshot>>) {
  const value = snapshot.siteState?.config.contactEmail ?? snapshot.siteState?.config.email;
  if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return value.trim();
  // Bundled public fallback when CMS site state has not published an email yet.
  return "hello@tung.codes";
}
