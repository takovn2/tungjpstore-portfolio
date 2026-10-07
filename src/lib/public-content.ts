import type { BodyBlock, ContentMeta } from "./admin/types";
import type { PublishedContent, PublicContentSnapshot } from "./content-store";

export type PublicProject = {
  slug: string;
  name: string;
  category: string;
  status: string;
  thesis: string;
  summary: string;
  seoTitle: string;
  seoDescription: string;
  liveUrl: string | null;
  image: string | null;
  imageAlt: string;
  variant: "logivn" | "payment" | "fball";
  research: boolean;
  body: BodyBlock[] | null;
  publishedAt: string | null;
  updatedAt?: string | null;
};

export type PublicPost = {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  status: string;
  image: string | null;
  imageAlt: string;
  body: BodyBlock[];
  publishedAt: string | null;
  updatedAt: string | null;
  /** Blog posts are explicitly opted into the public editorial surface. */
  surface: "blog" | "lab";
};

export type PublicSiteSection = {
  slug: string;
  title: string;
  eyebrow: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  image: string | null;
  imageAlt: string;
  body: BodyBlock[];
};

const metaString = (meta: ContentMeta, key: string) => typeof meta[key] === "string" ? meta[key] as string : "";
const normalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/\.+$/, "");
const mediaHostSet = new Set(["media.tung.codes", "media.tungjpstore.net"]);
const isMediaHost = (hostname: string) => mediaHostSet.has(normalizeHostname(hostname));
const isRepositoryHostname = (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  return normalized === "github.com" || normalized.endsWith(".github.com") || normalized === "githubusercontent.com" || normalized.endsWith(".githubusercontent.com");
};
export const hasRepositoryReference = (value: string) => /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:github\.com|githubusercontent\.com)(?:\/|\b)/i.test(value);
const publicText = (value: unknown) => typeof value === "string" && !hasRepositoryReference(value) ? value.trim() : "";
const metaBoolean = (meta: ContentMeta, key: string) => meta[key] === true;
const localeSuffix = (locale: PublishedContent["locale"]) => locale === "vi" ? "Vi" : locale === "en" ? "En" : locale === "ja" ? "Ja" : "Zh";
const statusFallbacks: Record<PublishedContent["locale"], Record<string, string>> = {
  vi: { active: "Đang phát triển", expanding: "Đang mở rộng", research: "Nghiên cứu", archived: "Đã lưu trữ", live: "Đang vận hành", "in-progress": "Đang thực hiện", planned: "Đang lên kế hoạch", testing: "Đang thử nghiệm", paused: "Tạm dừng" },
  en: { active: "Active development", expanding: "Expanding", research: "Research", archived: "Archived", live: "Live", "in-progress": "In progress", planned: "Planned", testing: "Testing", paused: "Paused" },
  ja: { active: "開発中", expanding: "拡張中", research: "リサーチ", archived: "アーカイブ", live: "運用中", "in-progress": "進行中", planned: "計画中", testing: "テスト中", paused: "一時停止" },
  zh: { active: "开发中", expanding: "扩展中", research: "研究中", archived: "已归档", live: "运行中", "in-progress": "进行中", planned: "计划中", testing: "测试中", paused: "已暂停" },
};
const statusLabelFor = (item: PublishedContent) => {
  const status = metaString(item.meta, "status").trim().toLowerCase();
  const semantic = statusFallbacks[item.locale][status];
  if (semantic) return semantic;
  const localized = publicText(metaString(item.meta, `statusLabel${localeSuffix(item.locale)}`));
  if (localized) return localized;
  return item.locale === "vi" ? publicText(metaString(item.meta, "statusLabel")) : "";
};
export const safeImageUrl = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\/(?![\/\\])/.test(trimmed) && !trimmed.includes("\\")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && isMediaHost(url.hostname) && !url.username && !url.password && !hasRepositoryReference(trimmed)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};
const localizedMetaString = (item: PublishedContent, key: string) => metaString(item.meta, `${key}${localeSuffix(item.locale)}`);
const localizedImageAlt = (item: PublishedContent) =>
  publicText(localizedMetaString(item, "coverAlt")) || publicText(item.coverAlt) || publicText(item.content.title) || item.slug;
export const safePublicHref = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\/(?![\/\\])/.test(trimmed) && !trimmed.includes("\\")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && !isRepositoryHostname(url.hostname) && !url.username && !url.password && !hasRepositoryReference(trimmed)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};
const safeBody = (body: unknown): BodyBlock[] => {
  if (!Array.isArray(body)) return [];
  return body.filter((block): block is BodyBlock => {
    if (!block || typeof block !== "object" || Array.isArray(block)) return false;
    const candidate = block as Record<string, unknown>;
    const type = candidate.type;
    if (type === "paragraph" || type === "heading" || type === "quote") return typeof candidate.text === "string" && !hasRepositoryReference(candidate.text);
    if (type === "list") return Array.isArray(candidate.items) && candidate.items.every((item) => typeof item === "string" && !hasRepositoryReference(item));
    if (type === "image") return safeImageUrl(typeof candidate.src === "string" ? candidate.src : null) !== null && typeof candidate.alt === "string" && !hasRepositoryReference(candidate.alt);
    if (type === "cta") return typeof candidate.label === "string" && !hasRepositoryReference(candidate.label) && safePublicHref(candidate.href) !== null;
    if (type === "metric") return typeof candidate.label === "string" && !hasRepositoryReference(candidate.label) && typeof candidate.value === "string" && !hasRepositoryReference(candidate.value);
    return false;
  });
};
const publicBody = (item: PublishedContent): BodyBlock[] | null => {
  const body = safeBody(item.content.body);
  return body.length ? body : null;
};
const safeHttpsUrl = (value: string) => {
  const href = safePublicHref(value);
  return href?.startsWith("https://") ? href : null;
};

const variantFor = (item: PublishedContent): PublicProject["variant"] => {
  const configured = metaString(item.meta, "variant");
  if (configured === "payment" || configured === "fball" || configured === "logivn") return configured;
  if (item.slug === "fball") return "fball";
  if (item.slug.includes("payment")) return "payment";
  return "logivn";
};

export function projectFromPublished(item: PublishedContent): PublicProject {
  const body = safeBody(item.content.body);
  const firstQuote = body.find((block) => block.type === "quote");
  const status = statusLabelFor(item);
  return {
    slug: item.slug,
    name: publicText(item.content.title) || item.slug,
    category: publicText(item.content.eyebrow),
    status,
    thesis: firstQuote?.type === "quote" ? publicText(firstQuote.text) : publicText(item.content.excerpt),
    summary: publicText(item.content.excerpt),
    seoTitle: publicText(item.content.seoTitle) || publicText(item.content.title) || item.slug,
    seoDescription: publicText(item.content.seoDescription) || publicText(item.content.excerpt),
    liveUrl: safeHttpsUrl(metaString(item.meta, "liveUrl")),
    image: safeImageUrl(item.coverUrl),
    imageAlt: localizedImageAlt(item),
    variant: variantFor(item),
    research: metaBoolean(item.meta, "research") || metaString(item.meta, "status").toLowerCase() === "research" || item.slug.includes("payment"),
    body: publicBody(item),
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt ?? item.publishedAt,
  };
}

export function postFromPublished(item: PublishedContent): PublicPost {
  return {
    slug: item.slug,
    title: publicText(item.content.title) || item.slug,
    category: publicText(item.content.eyebrow),
    excerpt: publicText(item.content.excerpt),
    seoTitle: publicText(item.content.seoTitle) || publicText(item.content.title) || item.slug,
    seoDescription: publicText(item.content.seoDescription) || publicText(item.content.excerpt),
    status: statusLabelFor(item),
    image: safeImageUrl(item.coverUrl),
    imageAlt: localizedImageAlt(item),
    body: publicBody(item) || [],
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt ?? item.publishedAt,
    surface: metaString(item.meta, "surface").trim().toLowerCase() === "blog" ? "blog" : "lab",
  };
}

export function siteSectionFromPublished(item: PublishedContent): PublicSiteSection {
  return {
    slug: item.slug,
    title: publicText(item.content.title),
    eyebrow: publicText(item.content.eyebrow),
    excerpt: publicText(item.content.excerpt),
    seoTitle: publicText(item.content.seoTitle),
    seoDescription: publicText(item.content.seoDescription),
    image: safeImageUrl(item.coverUrl),
    imageAlt: localizedImageAlt(item),
    body: publicBody(item) ?? [],
  };
}

export function publishedProjects(snapshot: PublicContentSnapshot) {
  return snapshot.items.filter((item) => item.type === "project").map(projectFromPublished);
}

export function publishedPosts(snapshot: PublicContentSnapshot) {
  return snapshot.items.filter((item) => item.type === "post").map(postFromPublished);
}

/** Posts with an explicit blog surface feed SEO/indexable editorial routes. */
export function publishedBlogPosts(snapshot: PublicContentSnapshot) {
  return publishedPosts(snapshot).filter((post) => post.surface === "blog");
}

/** Posts without the blog opt-in remain available to the research lab. */
export function publishedLabPosts(snapshot: PublicContentSnapshot) {
  return publishedPosts(snapshot).filter((post) => post.surface !== "blog");
}

export function publishedSiteSection(snapshot: PublicContentSnapshot, slug: string) {
  const item = snapshot.items.find((candidate) => candidate.type === "site_section" && candidate.slug === slug);
  return item ? siteSectionFromPublished(item) : null;
}

export function isManaged(snapshot: PublicContentSnapshot, type: "site_section" | "project" | "post", slug?: string) {
  return slug ? snapshot.managedSlugs[type].includes(slug) : snapshot.managedSlugs[type].length > 0;
}

/**
 * Bundled content is safe only while the CMS is reachable and has never
 * claimed this content type. Site sections are independently addressable;
 * projects and posts become authoritative as soon as one item is managed.
 */
export function canUseBundledFallback(snapshot: PublicContentSnapshot, type: "site_section" | "project" | "post", slug?: string) {
  if (snapshot.status === "unavailable") return false;
  if (type === "site_section") return !isManaged(snapshot, type, slug);
  return !isManaged(snapshot, type);
}

export function siteSetting(snapshot: PublicContentSnapshot, key: string) {
  return snapshot.siteState?.config[key];
}

export function setPublicCache(headers: Headers, state: "ok" | "not-found" | "unavailable" = "ok") {
  if (state === "unavailable") {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Cloudflare-CDN-Cache-Control", "no-store, max-age=0");
    return;
  }
  if (state === "not-found") {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=30, must-revalidate");
    return;
  }
  // Publish writes D1 but does not have a global cache purge token. Keep the
  // edge window short so a publish becomes visible within roughly one minute.
  headers.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
  headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=60, must-revalidate");
}
