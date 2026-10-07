import { getTranslation, type Locale } from "../i18n/dictionaries";
import type { BodyBlock } from "./admin/types";
import type { PublicPost } from "./public-content";

const curatedLabEntryBySlug = {
  "payment-confirmation-reconciliation": "paymentConfirmation",
  "tenant-boundaries-in-practice": "taxWorkflow",
  "low-cost-cloud-operations": "lowCostInfrastructure",
  "assisted-operations-with-confirmation": "aiAssisted",
  "e-invoicing-domain-model": "eInvoicing",
} as const;

/** Keep seeded Lab entries aligned with the polished public dictionary copy. */
export function curateLabPost(post: PublicPost, locale: Locale): PublicPost {
  if (post.surface !== "lab") return post;
  const key = curatedLabEntryBySlug[post.slug as keyof typeof curatedLabEntryBySlug];
  if (!key) return post;

  const copy = getTranslation(locale).lab;
  const entry = copy.entries[key];
  const body = [
    { type: "heading", text: copy.questionLabel },
    { type: "paragraph", text: entry.question },
    { type: "heading", text: copy.whyItMattersLabel },
    { type: "paragraph", text: entry.whyItMatters },
    { type: "heading", text: copy.currentConclusionLabel },
    { type: "quote", text: entry.currentConclusion },
  ] satisfies BodyBlock[];

  return {
    ...post,
    title: entry.topic,
    category: entry.category,
    excerpt: entry.currentConclusion,
    seoTitle: `${entry.topic} — Tung`,
    seoDescription: entry.currentConclusion,
    status: entry.status,
    body,
  };
}

export function curateLabPosts(posts: PublicPost[], locale: Locale): PublicPost[] {
  return posts.map((post) => curateLabPost(post, locale));
}
