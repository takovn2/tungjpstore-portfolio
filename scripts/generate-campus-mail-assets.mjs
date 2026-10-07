#!/usr/bin/env node
/**
 * Campus Mail Lab covers — soft-teal shop plate + exact SVG type.
 * Usage: node scripts/generate-campus-mail-assets.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicShop = path.join(root, "public/images/shop");
const publicThumbs = path.join(publicShop, "thumbs");
const publicIcons = path.join(publicShop, "icons");
const artifactDir = path.join(root, "artifacts/shop-images-campus-mail-2026-08-14");

const W = 1200;
const H = 900;
const TEAL = "#2A9D8F";
const TEAL_SOFT = "#EAF5F3";
const TEAL_BG = "#F4FAF9";
const INK = "#2A2430";
const INK_SOFT = "#7A6F7C";

function coverSvg() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${TEAL_BG}"/>
      <stop offset="55%" stop-color="${TEAL_SOFT}"/>
      <stop offset="100%" stop-color="#DCEFED"/>
    </linearGradient>
    <radialGradient id="glow1" cx="28%" cy="28%" r="48%">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="78%" cy="74%" r="44%">
      <stop offset="0%" stop-color="#7C9CFF" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#7C9CFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="seal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2FC48A"/>
      <stop offset="100%" stop-color="${TEAL}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="280" cy="220" r="340" fill="url(#glow1)"/>
  <circle cx="980" cy="680" r="300" fill="url(#glow2)"/>

  <g transform="translate(600 318)">
    <circle r="148" fill="#fff" stroke="${TEAL}" stroke-width="3"/>
    <circle r="136" fill="none" stroke="${TEAL}" stroke-width="1.5" stroke-dasharray="5 7" opacity="0.55"/>
    <circle r="108" fill="url(#seal)"/>
    <rect x="-46" y="-22" width="92" height="62" rx="8" fill="#fff"/>
    <path d="M-46 -10 L0 18 L46 -10" fill="none" stroke="${TEAL}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M-46 -22 L0 10 L46 -22" fill="none" stroke="${TEAL}" stroke-width="3" stroke-linecap="round" opacity="0.45"/>
    <text y="-46" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="13" font-weight="800" letter-spacing="3.2" fill="#fff">CAMPUS</text>
  </g>

  <text x="600" y="548" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.2">Campus Mail</text>
  <text x="600" y="592" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="20" font-weight="600" fill="${INK_SOFT}">Hộp thư campus giả định · mail|pass|2fa</text>

  <g font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="15" font-weight="700">
    <rect x="246" y="640" width="200" height="40" rx="20" fill="#fff"/>
    <text x="346" y="665" text-anchor="middle" fill="${TEAL}">quillmere.edu</text>
    <rect x="500" y="640" width="200" height="40" rx="20" fill="#fff"/>
    <text x="600" y="665" text-anchor="middle" fill="${TEAL}">lanternwick.edu</text>
    <rect x="754" y="640" width="200" height="40" rx="20" fill="#fff"/>
    <text x="854" y="665" text-anchor="middle" fill="${TEAL}">mossglen.edu</text>
  </g>
</svg>`);
}

function iconSvg() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${TEAL_BG}"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0.22"/>
    </linearGradient>
    <linearGradient id="seal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2FC48A"/>
      <stop offset="100%" stop-color="${TEAL}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <circle cx="256" cy="256" r="150" fill="url(#seal)"/>
  <rect x="186" y="232" width="140" height="92" rx="12" fill="#fff"/>
  <path d="M186 250 L256 294 L326 250" fill="none" stroke="${TEAL}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);
}

function guideSvg(step, title, lines) {
  const body = lines.map((line, index) =>
    `<text x="120" y="${430 + index * 42}" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="26" font-weight="500" fill="${INK_SOFT}">${escapeXml(line)}</text>`
  ).join("\n  ");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${TEAL_BG}"/>
      <stop offset="100%" stop-color="${TEAL_SOFT}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="180" cy="170" r="220" fill="${TEAL}" fill-opacity="0.10"/>
  <rect x="72" y="72" width="1056" height="756" rx="36" fill="#fff"/>
  <circle cx="168" cy="188" r="48" fill="${TEAL}"/>
  <text x="168" y="204" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="36" font-weight="800" fill="#fff">${step}</text>
  <text x="240" y="176" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="18" font-weight="700" fill="${TEAL}" letter-spacing="2.4">BƯỚC ${step}</text>
  <text x="240" y="220" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="40" font-weight="800" fill="${INK}">${escapeXml(title)}</text>
  <rect x="120" y="276" width="120" height="6" rx="3" fill="${TEAL}"/>
  ${body}
</svg>`);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function writeWebp(svg, dest, width, height) {
  const buffer = await sharp(svg).resize(width, height).webp({ quality: 90 }).toBuffer();
  await fs.writeFile(dest, buffer);
  return buffer;
}

const guides = [
  {
    slug: "campus-mail-guide-1",
    step: "1",
    title: "Nhận đúng một dòng key",
    lines: [
      "Sau khi thanh toán được xác minh, mở đơn hàng.",
      "Copy đúng 1 dòng, không thêm khoảng trắng.",
      "Mỗi dòng là một đơn vị kho — đừng tách sẻ.",
    ],
  },
  {
    slug: "campus-mail-guide-2",
    step: "2",
    title: "Tách email · mật khẩu · 2FA",
    lines: [
      "Định dạng cố định: email|password|2fa",
      "Ví dụ: mail001@quillmere.edu|Seed_…|JBSW…",
      "Parser tự động hóa chỉ cần split theo dấu |",
    ],
  },
  {
    slug: "campus-mail-guide-3",
    step: "3",
    title: "Gắn secret 2FA khi test OTP",
    lines: [
      "Phần thứ ba là secret Base32, không phải mã 6 số.",
      "Thêm vào authenticator bằng Enter a setup key.",
      "OTP đổi mỗi 30 giây — dùng mã đang hiện.",
    ],
  },
];

await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(publicThumbs, { recursive: true });
await fs.mkdir(publicIcons, { recursive: true });

const cover = await writeWebp(coverSvg(), path.join(publicShop, "campus-mail.webp"), W, H);
await fs.writeFile(path.join(artifactDir, "campus-mail.webp"), cover);
const thumb = await sharp(cover).resize(640, 640, { fit: "cover", position: "centre" }).avif({ quality: 55 }).toBuffer();
await fs.writeFile(path.join(publicThumbs, "campus-mail.avif"), thumb);
const icon = await writeWebp(iconSvg(), path.join(publicIcons, "campus-mail.webp"), 512, 512);
await fs.writeFile(path.join(artifactDir, "campus-mail-icon.webp"), icon);

for (const guide of guides) {
  const image = await writeWebp(guideSvg(guide.step, guide.title, guide.lines), path.join(publicShop, `${guide.slug}.webp`), W, H);
  await fs.writeFile(path.join(artifactDir, `${guide.slug}.webp`), image);
  const guideThumb = await sharp(image).resize(640, 480, { fit: "cover" }).avif({ quality: 55 }).toBuffer();
  await fs.writeFile(path.join(publicThumbs, `${guide.slug}.avif`), guideThumb);
  console.log(`[ok] ${guide.slug}`);
}

console.log("[done] campus-mail covers + 3 guide plates");
