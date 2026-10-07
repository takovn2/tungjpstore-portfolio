#!/usr/bin/env node
/**
 * TUNG Shop — Soft Teal product assets (full-bleed covers)
 * Large centered logo on a clean soft-teal plate; no thick card frame.
 *
 * Usage: node scripts/generate-shop-cute-assets.mjs [--public] [--limit N]
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const stamp = new Date().toISOString().slice(0, 10);
const root = path.resolve(".");
const artifactDir = path.join(root, `artifacts/shop-images-teal-${stamp}`);
const logoDirs = [
  path.join(root, "artifacts/shop-images-2026-07-25/logos"),
  path.join(root, "artifacts/shop-images-taphoa-2026-07-25/logos"),
  path.join(root, "artifacts/shop-images-cute-2026-08-05/logos"),
  path.join(artifactDir, "logos"),
];
const publicShop = path.join(root, "public/images/shop");
const publicThumbs = path.join(publicShop, "thumbs");
const publicIcons = path.join(publicShop, "icons");

const writePublic = process.argv.includes("--public") || !process.argv.includes("--artifacts-only");
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) || 0 : 0;

const TEAL = "#2A9D8F";
const TEAL_SOFT = "#EAF5F3";
const TEAL_BG = "#F4FAF9";

const products = [
  { slug: "chatgpt-plus", name: "ChatGPT Plus", category: "AI", tint: "#2A9D8F", icon: "logos/openai-icon" },
  { slug: "gemini-pro", name: "Gemini Pro", category: "AI", tint: "#4A7C8C", icon: "logos/google-gemini" },
  { slug: "claude-api", name: "Claude API", category: "AI", tint: "#2A9D8F", icon: "simple-icons/anthropic" },
  { slug: "claude-x20", name: "Claude x20", category: "AI", tint: "#2A9D8F", icon: "simple-icons/anthropic" },
  { slug: "super-grok", name: "Super Grok", category: "AI", tint: "#1A2B2A", icon: "logos/grok" },
  { slug: "grok-api", name: "Grok API", category: "AI", tint: "#1A2B2A", icon: "logos/grok" },
  { slug: "cursor-pro", name: "Cursor Pro", category: "Dev", tint: "#2A9D8F", icon: "simple-icons/cursor" },
  { slug: "lovable", name: "Lovable", category: "Dev", tint: "#2A9D8F", icon: "simple-icons/lovable" },
  { slug: "kiro", name: "Kiro", category: "Dev", tint: "#2A9D8F" },
  { slug: "canva", name: "Canva Pro", category: "Creative", tint: "#2A9D8F", icon: "devicon/canva" },
  { slug: "capcut-pro", name: "CapCut Pro", category: "Creative", tint: "#1A2B2A", icon: "simple-icons/capcut" },
  { slug: "adobe", name: "Adobe", category: "Creative", tint: "#4A7C8C", icon: "logos/adobe-icon" },
  { slug: "elevenlab", name: "ElevenLabs", category: "Creative", tint: "#1A2B2A", icon: "simple-icons/elevenlabs" },
  { slug: "suno", name: "Suno", category: "Creative", tint: "#2A9D8F", icon: "simple-icons/suno" },
  { slug: "leonardo-ai", name: "Leonardo AI", category: "Creative", tint: "#4A7C8C" },
  { slug: "heygen", name: "HeyGen", category: "Creative", tint: "#2A9D8F" },
  { slug: "kling", name: "Kling", category: "Creative", tint: "#2A9D8F" },
  { slug: "veo3-anti", name: "Veo 3", category: "Creative", tint: "#2A9D8F", icon: "simple-icons/deepmind" },
  { slug: "veo3-credits", name: "Veo Credits", category: "Creative", tint: "#2A9D8F", icon: "simple-icons/deepmind" },
  { slug: "netflix", name: "Netflix", category: "Entertainment", tint: "#1A2B2A", icon: "logos/netflix-icon" },
  { slug: "ytb-premium", name: "YouTube Premium", category: "Entertainment", tint: "#1A2B2A", icon: "logos/youtube-icon" },
  { slug: "xbox", name: "Xbox", category: "Entertainment", tint: "#2A9D8F", icon: "cib/xbox" },
  { slug: "tiktok", name: "TikTok", category: "Entertainment", tint: "#1A2B2A", icon: "logos/tiktok-icon" },
  { slug: "scribd", name: "Scribd", category: "Entertainment", tint: "#4A7C8C" },
  { slug: "microsoft", name: "Microsoft 365", category: "Productivity", tint: "#2A9D8F", icon: "logos/microsoft-icon" },
  { slug: "notion-enterprise", name: "Notion", category: "Productivity", tint: "#1A2B2A", icon: "logos/notion-icon" },
  { slug: "zoom-pro", name: "Zoom Pro", category: "Productivity", tint: "#2A9D8F", icon: "logos/zoom-icon" },
  { slug: "linkedin-premium", name: "LinkedIn Premium", category: "Productivity", tint: "#4A7C8C", icon: "logos/linkedin-icon" },
  { slug: "google-family", name: "Google One", category: "Productivity", tint: "#2A9D8F", icon: "logos/google-icon" },
  { slug: "gmail-aged", name: "Gmail Aged", category: "Productivity", tint: "#2A9D8F", icon: "logos/google-gmail" },
  { slug: "gpm-login", name: "GPM Login", category: "Tools", tint: "#4A7C8C" },
  { slug: "hma-vpn", name: "HMA VPN", category: "Tools", tint: "#2A9D8F" },
  { slug: "x-premium", name: "X Premium", category: "Tools", tint: "#1A2B2A", icon: "logos/x" },
];

const W = 1200;
const H = 900;

function plateSvg(tint, seed = 0) {
  const x = 200 + (seed % 5) * 30;
  const y = 160 + (seed % 4) * 20;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${TEAL_BG}"/>
      <stop offset="55%" stop-color="${TEAL_SOFT}"/>
      <stop offset="100%" stop-color="#DCEFED"/>
    </linearGradient>
    <radialGradient id="b1" cx="28%" cy="30%" r="50%">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="b2" cx="78%" cy="70%" r="48%">
      <stop offset="0%" stop-color="${tint}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${x}" cy="${y}" r="340" fill="url(#b1)"/>
  <circle cx="980" cy="620" r="300" fill="url(#b2)"/>
</svg>`);
}

async function findLocalLogo(slug) {
  for (const dir of logoDirs) {
    for (const name of [`${slug}.svg`, `${slug}.png`, `${slug}.webp`]) {
      const file = path.join(dir, name);
      try {
        await fs.access(file);
        return file;
      } catch {}
    }
  }
  if (slug === "kiro") {
    for (const p of [
      path.join(publicShop, "kiro-logo.svg"),
      path.join(publicShop, "kiro-logo.webp"),
      path.join(logoDirs[0], "kiro.svg"),
      path.join(logoDirs[0], "kiro.png"),
    ]) {
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
  }
  return null;
}

async function fetchLogo(product) {
  const local = await findLocalLogo(product.slug);
  if (local) return local;
  if (!product.icon) return null;
  const dir = logoDirs[3];
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${product.slug}.svg`);
  try {
    await fs.access(file);
    return file;
  } catch {}
  const response = await fetch(`https://api.iconify.design/${product.icon}.svg?height=400`);
  if (!response.ok) {
    console.warn(`[logo-miss] ${product.slug}`);
    return null;
  }
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

function monogramSvg(letter, tint) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" rx="80" fill="${tint}"/>
  <text x="200" y="230" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="180" font-weight="800" fill="#ffffff">${letter}</text>
</svg>`);
}

async function logoPng(product, logoPath) {
  if (!logoPath) {
    const letter = (product.name.trim()[0] || "?").toUpperCase();
    return sharp(monogramSvg(letter, product.tint)).png().toBuffer();
  }
  const buf = await fs.readFile(logoPath);
  return sharp(buf, { density: 320 })
    .resize(560, 560, { fit: "inside", withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Full-bleed: large logo centered, soft plate only — no thick white card frame */
async function composeCover(product, logoBuf) {
  const plate = await sharp(plateSvg(product.tint, product.slug.length)).png().toBuffer();
  const logoSized = await sharp(logoBuf)
    .resize(620, 620, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const lm = await sharp(logoSized).metadata();
  const lw = lm.width || 620;
  const lh = lm.height || 620;
  const left = Math.round((W - lw) / 2);
  const top = Math.round((H - lh) / 2);

  return sharp(plate)
    .composite([{ input: logoSized, left, top }])
    .webp({ quality: 90 })
    .toBuffer();
}

async function composeIcon(logoBuf, tint) {
  const bg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${TEAL_BG}"/>
      <stop offset="100%" stop-color="${tint}" stop-opacity="0.22"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
</svg>`);
  const logo = await sharp(logoBuf)
    .resize(360, 360, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const lm = await sharp(logo).metadata();
  const left = Math.round((512 - (lm.width || 360)) / 2);
  const top = Math.round((512 - (lm.height || 360)) / 2);
  return sharp(bg).composite([{ input: logo, left, top }]).webp({ quality: 90 }).toBuffer();
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  if (writePublic) {
    await fs.mkdir(publicThumbs, { recursive: true });
    await fs.mkdir(publicIcons, { recursive: true });
  }
  const list = limit > 0 ? products.slice(0, limit) : products;
  console.log(`Generating ${list.length} full-bleed teal covers → ${writePublic ? "public + " : ""}${artifactDir}`);

  for (const [index, product] of list.entries()) {
    try {
      const logoPath = await fetchLogo(product);
      const logoBuf = await logoPng(product, logoPath);
      const cover = await composeCover(product, logoBuf);
      const icon = await composeIcon(logoBuf, product.tint);
      const thumb = await sharp(cover)
        .resize(640, 640, { fit: "cover", position: "centre" })
        .avif({ quality: 55 })
        .toBuffer();

      await fs.writeFile(path.join(artifactDir, `${product.slug}.webp`), cover);
      await fs.writeFile(path.join(artifactDir, `${product.slug}-icon.webp`), icon);
      if (writePublic) {
        await fs.writeFile(path.join(publicShop, `${product.slug}.webp`), cover);
        await fs.writeFile(path.join(publicThumbs, `${product.slug}.avif`), thumb);
        await fs.writeFile(path.join(publicIcons, `${product.slug}.webp`), icon);
      }
      console.log(`[${index + 1}/${list.length}] ${product.slug}`);
    } catch (error) {
      console.error(`[fail] ${product.slug}`, error.message);
    }
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
