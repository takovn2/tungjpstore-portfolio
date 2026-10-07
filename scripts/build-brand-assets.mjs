import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const brandDir = new URL("../public/brand/", import.meta.url);
const ogDir = new URL("../public/og/", import.meta.url);
const lockupPath = new URL("tung-horizontal-lockup-on-dark.png", brandDir);
const wordmarkPath = new URL("tung-wordmark-on-dark.png", brandDir);
const iconPath = new URL("tung-icon-on-dark.png", brandDir);

// Rebuild the legacy filename from the clean wordmark so stale domain text
// cannot survive in an asset that is still referenced by older caches.
const lockup = await sharp(await readFile(wordmarkPath))
  .resize(513, 173, { fit: "contain", background: { r: 17, g: 19, b: 23, alpha: 0 } })
  .png()
  .toBuffer();
await sharp(lockup).toFile(fileURLToPath(lockupPath));

const [icon, decoration] = await Promise.all([
  sharp(await readFile(iconPath)).resize(220, 214, { fit: "contain", background: { r: 17, g: 19, b: 23, alpha: 0 } }).png().toBuffer(),
  Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#111317"/>
    <path d="M88 92h250" stroke="#C8FF4D" stroke-width="3"/>
    <path d="M88 538h1024" stroke="#8A9098" stroke-opacity=".35"/>
    <circle cx="982" cy="315" r="190" fill="none" stroke="#8A9098" stroke-opacity=".16"/>
    <circle cx="982" cy="315" r="146" fill="none" stroke="#C8FF4D" stroke-opacity=".2"/>
    <path d="M982 86v458M752 315h360" stroke="#8A9098" stroke-opacity=".1"/>
    <text x="88" y="484" fill="#C8FF4D" font-family="Menlo,Consolas,monospace" font-size="18" letter-spacing="5">TUNG.CODES</text>
  </svg>`),
]);

await sharp(decoration)
  .composite([
    { input: lockup, left: 70, top: 210 },
    { input: icon, left: 872, top: 205 },
  ])
  .png()
  .toFile(fileURLToPath(new URL("default.png", ogDir)));

console.log("Rebuilt clean TUNG brand and OG assets.");
