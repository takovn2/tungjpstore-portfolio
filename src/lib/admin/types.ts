import type { ShopBindings } from "../shop/types";

export const ADMIN_LOCALES = ["vi", "en", "ja", "zh"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];

export const CONTENT_TYPES = ["site_section", "project", "post"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export type ContentStatus = "draft" | "published" | "archived";

export type BodyBlock =
  | { type: "paragraph" | "heading" | "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; src: string; alt: string }
  | { type: "cta"; label: string; href: string }
  | { type: "metric"; label: string; value: string };

export type LocalizedContent = {
  title?: string;
  eyebrow?: string;
  excerpt?: string;
  body?: BodyBlock[];
  seoTitle?: string;
  seoDescription?: string;
};

export type ContentMeta = Record<string, string | number | boolean | string[] | null>;
export type LocalizedMap = Partial<Record<AdminLocale, LocalizedContent>>;

export type AdminBindings = ShopBindings & {
  CONTACT_DB?: D1Database;
  MEDIA?: R2Bucket;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ALLOWED_EMAILS?: string;
  ADMIN_AUTH_SECRET?: string;
  MEDIA_PUBLIC_BASE_URL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export type AdminUser = {
  sub: string;
  email: string;
  name?: string;
};

export type ContentListItem = {
  id: string;
  type: ContentType;
  slug: string;
  status: ContentStatus;
  sortOrder: number;
  coverMediaId: string | null;
  meta: ContentMeta;
  version: number;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type ContentRevisionDetail = {
  id: string;
  version: number;
  slug: string | null;
  sortOrder: number | null;
  coverMediaId: string | null;
  localizations: LocalizedMap;
  meta: ContentMeta;
};

export type ContentDetail = ContentListItem & {
  draft?: ContentRevisionDetail;
  published?: ContentRevisionDetail;
};
