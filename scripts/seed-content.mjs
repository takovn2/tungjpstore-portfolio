#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "content-migrations/0003_seed_public_content.sql");
const seedTimestamp = "2026-07-23T00:00:00.000Z";
const seedActor = "seed:public-content:v1";

const localeOrder = ["vi", "en", "ja", "zh"];
const projectOrder = ["logivn", "paymentInfrastructure", "fball"];
const postOrder = [
  ["paymentConfirmation", "payment-confirmation-reconciliation", "research"],
  ["taxWorkflow", "tenant-boundaries-in-practice", "active"],
  ["lowCostInfrastructure", "low-cost-cloud-operations", "testing"],
  ["aiAssisted", "assisted-operations-with-confirmation", "active"],
  ["eInvoicing", "e-invoicing-domain-model", "research"],
];

const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => sql(JSON.stringify(value));
const id = (type, slug) => `seed_${type}_${slug.replaceAll("-", "_")}`;
const revisionId = (type, slug) => `${id(type, slug)}_r1`;

function localizedStatusMeta(translations, getStatus) {
  return {
    statusLabel: getStatus(translations.vi),
    statusLabelVi: getStatus(translations.vi),
    statusLabelEn: getStatus(translations.en),
    statusLabelJa: getStatus(translations.ja),
    statusLabelZh: getStatus(translations.zh),
  };
}

function projectMeta(key, translations) {
  const meta = {
    status: key === "paymentInfrastructure" ? "research" : "active",
    ...localizedStatusMeta(translations, (copy) => copy.projects[key].status),
    variant: key === "paymentInfrastructure" ? "payment" : key,
    research: key === "paymentInfrastructure",
  };
  if (key === "logivn") {
    meta.liveUrl = "https://logivn.com";
  }
  if (key === "fball") {
    meta.liveUrl = "https://fball.vn";
  }
  return meta;
}

function projectBody(key, project, locale) {
  const body = [
    { type: "quote", text: project.thesis },
    { type: "paragraph", text: project.summary },
    { type: "heading", text: locale === "vi" ? "Bối cảnh" : locale === "en" ? "Context" : locale === "ja" ? "背景" : "背景" },
    { type: "list", items: project.context },
    { type: "heading", text: locale === "vi" ? "Quyết định chính" : locale === "en" ? "Key decisions" : locale === "ja" ? "主な判断" : "关键决策" },
    { type: "list", items: project.decisions },
    { type: "heading", text: locale === "vi" ? "Kết quả hiện tại" : locale === "en" ? "Current outcomes" : locale === "ja" ? "現在の成果" : "当前成果" },
    { type: "list", items: project.outcomes },
    { type: "quote", text: project.reflection },
  ];
  const ctas = [];
  if (key === "logivn") ctas.push({ type: "cta", label: locale === "vi" ? "Mở LogiVN" : locale === "en" ? "Open LogiVN" : locale === "ja" ? "LogiVNを開く" : "打开 LogiVN", href: "https://logivn.com" });
  if (key === "fball") ctas.push({ type: "cta", label: locale === "vi" ? "Mở Fball.vn" : locale === "en" ? "Open Fball.vn" : locale === "ja" ? "Fball.vnを開く" : "打开 Fball.vn", href: "https://fball.vn" });
  return [...body, ...ctas];
}

function postBody(entry, locale, href) {
  const labels = {
    vi: ["Câu hỏi", "Vì sao đáng quan tâm", "Kết luận hiện tại"],
    en: ["Question", "Why it matters", "Current conclusion"],
    ja: ["問い", "なぜ重要か", "現在の結論"],
    zh: ["问题", "为什么重要", "当前结论"],
  }[locale];
  const body = [
    { type: "heading", text: labels[0] },
    { type: "paragraph", text: entry.question },
    { type: "heading", text: labels[1] },
    { type: "paragraph", text: entry.whyItMatters },
    { type: "heading", text: labels[2] },
    { type: "quote", text: entry.currentConclusion },
  ];
  if (!href) return body;
  const ctaLabels = { vi: "Xem nghiên cứu vận hành thanh toán", en: "Read the payment operations research", ja: "決済運用リサーチを見る", zh: "查看支付运营研究" };
  return [...body, { type: "cta", label: ctaLabels[locale], href }];
}

function addItem(lines, { type, slug, sortOrder, meta, localizations }) {
  const itemId = id(type, slug);
  const revId = revisionId(type, slug);
  const metaJson = JSON.stringify(meta);
  lines.push(`-- ${type}/${slug}`);
  lines.push(`INSERT OR IGNORE INTO content_items (id, type, slug, status, sort_order, cover_media_id, meta_json, version, current_published_revision_id, created_at, updated_at, deleted_at) VALUES (${sql(itemId)}, ${sql(type)}, ${sql(slug)}, 'published', ${sortOrder}, NULL, ${sql(metaJson)}, 1, ${sql(revId)}, ${sql(seedTimestamp)}, ${sql(seedTimestamp)}, NULL);`);
  lines.push(`INSERT OR IGNORE INTO revisions (id, content_item_id, version, status, data_json, created_by, created_at, published_at, slug, sort_order, cover_media_id) SELECT ${sql(revId)}, ${sql(itemId)}, 1, 'published', ${sql(metaJson)}, ${sql(seedActor)}, ${sql(seedTimestamp)}, ${sql(seedTimestamp)}, ${sql(slug)}, ${sortOrder}, NULL WHERE EXISTS (SELECT 1 FROM content_items WHERE id = ${sql(itemId)});`);
  for (const locale of localeOrder) {
    lines.push(`INSERT OR IGNORE INTO localizations (revision_id, locale, data_json) SELECT ${sql(revId)}, ${sql(locale)}, ${sql(JSON.stringify(localizations[locale]))} WHERE EXISTS (SELECT 1 FROM revisions WHERE id = ${sql(revId)});`);
  }
  lines.push(`UPDATE content_items SET status = 'published', current_published_revision_id = ${sql(revId)} WHERE id = ${sql(itemId)} AND current_published_revision_id IS NULL AND status = 'published' AND version = 1 AND created_at = ${sql(seedTimestamp)} AND updated_at = ${sql(seedTimestamp)};`);
  lines.push("");
}

async function loadTranslations() {
  // The npm scripts run Node with strip-types so this stays sourced from the
  // same editorial dictionaries used by the public fallback pages.
  const module = await import(pathToFileURL(resolve(root, "src/i18n/dictionaries.ts")));
  return module.translations;
}

async function buildSql() {
  const translations = await loadTranslations();
  const lines = [
    "-- Generated by scripts/seed-content.mjs. Do not edit by hand.",
    "-- Safe to execute repeatedly: deterministic IDs and guarded inserts preserve later admin edits.",
    "PRAGMA foreign_keys = ON;",
    "",
  ];

  const heroLocalizations = Object.fromEntries(localeOrder.map((locale) => {
    const h = translations[locale].home;
    return [locale, {
      title: locale === "vi" || locale === "en"
        ? `${h.titleLead} ${h.titleEmphasis} ${h.titleTail}`
        : `${h.titleLead}${h.titleEmphasis}${h.titleTail}`,
      eyebrow: h.eyebrow,
      excerpt: h.supporting,
      seoTitle: h.metaTitle,
      seoDescription: h.metaDescription,
      body: [
        { type: "cta", label: h.primaryCta, href: "/pricing" },
        { type: "cta", label: h.contactCta.cta, href: "/contact" },
      ],
    }];
  }));
  addItem(lines, { type: "site_section", slug: "home-hero", sortOrder: 10, meta: { section: "hero" }, localizations: heroLocalizations });

  const contactLocalizations = Object.fromEntries(localeOrder.map((locale) => {
    const c = translations[locale].contact;
    return [locale, {
      title: c.heading,
      eyebrow: c.label,
      excerpt: c.intro,
      seoTitle: c.metaTitle,
      seoDescription: c.metaDescription,
      // ContactPage owns the form and fallback email; this section only
      // replaces the editorial heading and intro without duplicating UI.
      body: [],
    }];
  }));
  addItem(lines, { type: "site_section", slug: "contact-profile", sortOrder: 20, meta: { section: "contact" }, localizations: contactLocalizations });

  for (const [sortOrder, key] of projectOrder.entries()) {
    const localizations = Object.fromEntries(localeOrder.map((locale) => {
      const project = translations[locale].projects[key];
      return [locale, {
        title: project.name,
        eyebrow: project.category,
        excerpt: project.summary,
        seoTitle: `${project.name} — ${project.category}`,
        seoDescription: project.summary,
        body: projectBody(key, project, locale),
      }];
    }));
    const slug = key === "paymentInfrastructure" ? "payment-infrastructure" : key;
    addItem(lines, { type: "project", slug, sortOrder: 100 + sortOrder * 10, meta: projectMeta(key, translations), localizations });
  }

  for (const [sortOrder, [key, slug, status]] of postOrder.entries()) {
    const localizations = Object.fromEntries(localeOrder.map((locale) => {
      const entry = translations[locale].lab.entries[key];
      const title = entry.topic;
      return [locale, {
        title,
        eyebrow: entry.category,
        excerpt: entry.currentConclusion,
        seoTitle: `${title} — Tung`,
        seoDescription: entry.currentConclusion,
        body: postBody(entry, locale, key === "paymentConfirmation" ? "/work/payment-infrastructure" : null),
      }];
    }));
    addItem(lines, {
      type: "post",
      slug,
      sortOrder: 200 + sortOrder * 10,
      meta: {
        status,
        ...localizedStatusMeta(translations, (copy) => copy.lab.entries[key].status),
      },
      localizations,
    });
  }

  lines.push("-- Set a contact email only when the mailbox has been verified; this guarded update keeps the source fallback otherwise.");
  lines.push(`UPDATE site_state SET config_json = ${json({ contactEmail: null })}, version = 1, updated_by = ${sql(seedActor)}, updated_at = ${sql(seedTimestamp)} WHERE id = 'default' AND config_json = '{}' AND version = 1 AND updated_by = 'system';`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function printSummary(content) {
  const itemCount = (content.match(/^-- (site_section|project|post)\//gm) ?? []).length;
  const localeCount = (content.match(/INSERT OR IGNORE INTO localizations/g) ?? []).length;
  const checksum = createHash("sha256").update(content).digest("hex").slice(0, 16);
  console.log(`CMS seed: ${itemCount} items, ${localeCount} localized revisions, sha256:${checksum}`);
}

const args = new Set(process.argv.slice(2));
const content = await buildSql();
if (args.has("--write")) {
  writeFileSync(outputPath, content, "utf8");
  console.log(`Wrote ${outputPath}`);
}
if (args.has("--check")) {
  if (!existsSync(outputPath)) throw new Error(`Missing ${outputPath}; run cms:seed:generate first`);
  const current = readFileSync(outputPath, "utf8");
  if (current !== content) throw new Error(`${outputPath} is stale; run npm run cms:seed:generate`);
  console.log(`Checked ${outputPath}`);
}
if (args.has("--apply")) {
  if (!args.has("--remote") && !args.has("--local")) throw new Error("Refusing to apply without --remote or --local");
  if (!existsSync(outputPath)) throw new Error(`Missing ${outputPath}; run cms:seed:generate first`);
  const database = process.env.CONTENT_DB_NAME || "tungjpstore-content";
  const target = args.has("--remote") ? ["--remote"] : ["--local"];
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", database, ...target], { cwd: root, stdio: "inherit" });
}
if (args.has("--dry-run") || (!args.has("--write") && !args.has("--check") && !args.has("--apply"))) printSummary(content);
