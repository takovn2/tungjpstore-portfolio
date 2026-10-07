import {
  ADMIN_LOCALES,
  CONTENT_TYPES,
  type AdminLocale,
  type BodyBlock,
  type ContentMeta,
  type ContentType,
  type LocalizedContent,
  type LocalizedMap,
} from "./types";
import { encodeOpaqueCursor } from "./db-utils";

const localeSet = new Set<string>(ADMIN_LOCALES);
const contentTypeSet = new Set<string>(CONTENT_TYPES);
const mediaHostSet = new Set(["media.tung.codes", "media.tungjpstore.net"]);
const isMediaHost = (hostname: string) => mediaHostSet.has(hostname.toLowerCase().replace(/\.+$/, ""));
const hasRepositoryReference = (value: string) => /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:github\.com|githubusercontent\.com)(?:\/|\b)/i.test(value);
const safeText = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max && !/[<>]/.test(value) ? value.trim() : null;
const safePublicText = (value: unknown, max: number) => {
  const text = safeText(value, max);
  return text !== null && !hasRepositoryReference(text) ? text : null;
};

const safeHref = (value: unknown) => {
  const href = safeText(value, 1_000);
  if (!href) return null;
  if (href.includes("\\") || /[\u0000-\u001f\u007f]/.test(href)) return null;
  if (/^\/(?!\/)/.test(href)) return href;
  if (!/^https:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};

const quickContactHosts: Record<string, Set<string>> = {
  quickContactMessengerUrl: new Set(["m.me", "messenger.com", "www.messenger.com", "facebook.com", "www.facebook.com"]),
  quickContactZaloUrl: new Set(["zalo.me", "www.zalo.me"]),
  quickContactTelegramUrl: new Set(["t.me", "telegram.me", "www.telegram.me"]),
};

const quickContactBaseUrls: Record<string, string> = {
  quickContactMessengerUrl: "https://m.me/",
  quickContactZaloUrl: "https://zalo.me/",
  quickContactTelegramUrl: "https://t.me/",
};

const safeQuickContactHref = (key: string, value: string) => {
  const allowedHosts = quickContactHosts[key];
  if (!allowedHosts) return value;
  const trimmed = value.trim().replace(/^@/, "");
  if (!/^https:\/\//i.test(trimmed)) {
    return /^[A-Za-z0-9._-]{1,100}$/.test(trimmed) ? `${quickContactBaseUrls[key]}${encodeURIComponent(trimmed)}` : null;
  }
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
    return url.protocol === "https:" && allowedHosts.has(hostname) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};

const isRepositoryUrl = (href: string) => {
  if (!href.startsWith("https://")) return false;
  try {
    const hostname = new URL(href).hostname.toLowerCase().replace(/\.+$/, "");
    return hostname === "github.com" || hostname.endsWith(".github.com") || hostname === "githubusercontent.com" || hostname.endsWith(".githubusercontent.com");
  } catch {
    return false;
  }
};

const safeImageSrc = (value: unknown) => {
  const src = safeHref(value);
  if (!src || /^\/(?!\/)/.test(src)) return src;
  try {
    return isMediaHost(new URL(src).hostname) ? src : null;
  } catch {
    return null;
  }
};

function parseBlock(value: unknown): BodyBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const block = value as Record<string, unknown>;
  const type = safeText(block.type, 20);
  if (!type) return null;
  if (type === "paragraph" || type === "heading" || type === "quote") {
    const text = safePublicText(block.text, 8_000);
    return text ? { type, text } : null;
  }
  if (type === "list") {
    if (!Array.isArray(block.items) || block.items.length > 30) return null;
    const items = block.items.map((item) => safePublicText(item, 500));
    return items.every(Boolean) ? { type, items: items as string[] } : null;
  }
  if (type === "image") {
    // Keep stored blocks aligned with the public CSP: self-hosted paths or the
    // immutable R2 media custom domain only.
    const src = safeImageSrc(block.src);
    const alt = safePublicText(block.alt, 300);
    return src && alt !== null ? { type, src, alt } : null;
  }
  if (type === "cta") {
    const label = safePublicText(block.label, 180);
    const href = safeHref(block.href);
    return label && href && !isRepositoryUrl(href) ? { type, label, href } : null;
  }
  if (type === "metric") {
    const label = safePublicText(block.label, 180);
    const metricValue = safePublicText(block.value, 180);
    return label && metricValue ? { type, label, value: metricValue } : null;
  }
  return null;
}

export function parseLocalizedContent(value: unknown): LocalizedContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowed = new Set(["title", "eyebrow", "excerpt", "body", "seoTitle", "seoDescription"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;

  const result: LocalizedContent = {};
  for (const key of ["title", "eyebrow", "excerpt", "seoTitle", "seoDescription"] as const) {
    if (key in input) {
      const text = safePublicText(input[key], key === "seoDescription" ? 320 : 1_000);
      if (text === null) return null;
      result[key] = text;
    }
  }
  if ("body" in input) {
    if (!Array.isArray(input.body) || input.body.length > 100) return null;
    const body = input.body.map(parseBlock);
    if (body.some((block) => block === null)) return null;
    result.body = body as BodyBlock[];
  }
  return result;
}

export function parseLocalizedMap(value: unknown): LocalizedMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const result: LocalizedMap = {};
  for (const [locale, content] of Object.entries(input)) {
    if (!localeSet.has(locale)) return null;
    const parsed = parseLocalizedContent(content);
    if (!parsed) return null;
    result[locale as AdminLocale] = parsed;
  }
  return result;
}

export function parseContentType(value: unknown): ContentType | null {
  return typeof value === "string" && contentTypeSet.has(value) ? (value as ContentType) : null;
}

export function parseSlug(value: unknown): string | null {
  const slug = safeText(value, 120);
  return slug && /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : null;
}

export function parseSortOrder(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === "number" && Number.isInteger(value) && value >= -100_000 && value <= 100_000 ? value : null;
}

export function parseExpectedVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

export function parseMediaId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const id = safeText(value, 100);
  return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}

export function parseContentMeta(value: unknown): ContentMeta | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const result: ContentMeta = {};
  if (Object.keys(input).length > 60) return null;
  for (const [key, raw] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,60}$/.test(key)) return null;
    if (/(?:repo|repository)/i.test(key)) return null;
    if (typeof raw === "string") {
      const text = safePublicText(raw, 2_000);
      if (text === null) return null;
      if (key === "contactEmail" && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return null;
      if (quickContactHosts[key]) {
        const quickContactHref = safeQuickContactHref(key, text);
        if (quickContactHref === null) return null;
        result[key] = quickContactHref;
      } else if (/(?:url|href|link)$/i.test(key)) {
        const href = safeHref(text);
        if (!href || isRepositoryUrl(href)) return null;
        result[key] = href;
      } else {
        result[key] = text;
      }
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      result[key] = raw;
    } else if (typeof raw === "boolean" || raw === null) {
      result[key] = raw;
    } else if (Array.isArray(raw) && raw.length <= 50 && raw.every((item) => typeof item === "string" && !/[<>]/.test(item) && item.length <= 300 && !hasRepositoryReference(item))) {
      result[key] = raw as string[];
    } else {
      return null;
    }
  }
  return result;
}

export function jsonString(value: unknown): string {
  return JSON.stringify(value ?? {});
}

/**
 * Publishing limits are intentionally locale-aware. CJK snippets generally
 * fit the same search surface with fewer code points than Latin copy; using
 * Array.from keeps surrogate pairs from being counted twice.
 */
const SEO_LIMITS: Record<AdminLocale, { title: number; description: number }> = {
  vi: { title: 70, description: 180 },
  en: { title: 70, description: 180 },
  ja: { title: 45, description: 120 },
  zh: { title: 45, description: 120 },
};

const codePointLength = (value: string) => Array.from(value).length;

export type PublishMediaState = {
  id: string;
  status: string;
  alt: string | null;
};

/** Return actionable, stable issue identifiers for the admin editor. */
export function validatePublishContent(input: {
  type: ContentType;
  slug: string;
  cover: PublishMediaState | null;
  localizations: LocalizedMap;
}) {
  const issues: string[] = [];
  if (input.type === "post" && !input.cover) issues.push(`${input.slug}: cover_required`);
  if (input.cover) {
    if (input.cover.status === "missing") issues.push(`${input.slug}: cover_not_found`);
    else {
      if (input.cover.status !== "active") issues.push(`${input.slug}: cover_not_active`);
      if (!input.cover.alt?.trim()) issues.push(`${input.slug}: cover_alt_required`);
    }
  }

  for (const locale of ADMIN_LOCALES) {
    const prefix = `${input.slug}.${locale}`;
    const value = input.localizations[locale];
    if (!value) {
      issues.push(`${prefix}: missing_locale`);
      continue;
    }
    if (!value.title?.trim()) issues.push(`${prefix}: title_required`);
    if (!value.excerpt?.trim()) issues.push(`${prefix}: excerpt_required`);
    if (input.type !== "site_section") {
      if (!Array.isArray(value.body) || value.body.length === 0) issues.push(`${prefix}: body_required`);
      if (!value.seoTitle?.trim()) issues.push(`${prefix}: seo_title_required`);
      if (!value.seoDescription?.trim()) issues.push(`${prefix}: seo_description_required`);
      if (value.seoTitle && codePointLength(value.seoTitle) > SEO_LIMITS[locale].title) {
        issues.push(`${prefix}: seo_title_too_long`);
      }
      if (value.seoDescription && codePointLength(value.seoDescription) > SEO_LIMITS[locale].description) {
        issues.push(`${prefix}: seo_description_too_long`);
      }
      for (const [index, block] of (value.body ?? []).entries()) {
        if (block.type === "image" && !block.alt.trim()) issues.push(`${prefix}.body.${index}: image_alt_required`);
      }
    }
  }
  return issues;
}

export type MediaCursor = { createdAt: string; id: string };

export function parseMediaCursor(value: unknown): MediaCursor | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,240}$/.test(value)) return null;
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = atob(normalized);
    const [createdAt, id] = decoded.split("\t");
    return createdAt && id && id.length <= 100 && !/[\u0000-\u001f]/.test(createdAt) ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

export function encodeMediaCursor(createdAt: string, id: string) {
  return encodeOpaqueCursor(createdAt, id);
}
