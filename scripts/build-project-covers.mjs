import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const captures = path.join(root, "artifacts/project-captures");
const output = path.join(root, "public/images/projects");

const projects = [
  {
    slug: "logivn",
    code: "01 / LIVE OPERATIONS",
    title: "LogiVN",
    descriptor: "QR ORDER  /  TABLE  /  KITCHEN  /  PAYMENT",
    primary: "logivn-tables.png",
    secondary: "logivn-orders.png",
    raw: ["logivn-orders", "logivn-tables", "logivn-analytics"],
    accent: "#c9f43d",
    surface: "#0c1712",
  },
  {
    slug: "fball",
    code: "02 / CLUB OPERATING SYSTEM",
    title: "Fball.vn",
    descriptor: "MATCH  /  ATTENDANCE  /  LINEUP  /  FUND",
    primary: "fball-tools.png",
    secondary: "fball-calendar.png",
    raw: ["fball-calendar", "fball-tools"],
    accent: "#c9f43d",
    surface: "#10150d",
  },
];

const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function coverOverlay(project) {
  const lines = Array.from({ length: 12 }, (_, index) => {
    const x = 70 + index * 150;
    return `<path d="M${x} 0V1125" stroke="rgba(255,255,255,.035)"/>`;
  }).join("");

  return Buffer.from(`
    <svg width="1800" height="1125" viewBox="0 0 1800 1125" xmlns="http://www.w3.org/2000/svg">
      <style>
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 3px; }
        .display { font-family: Georgia, 'Times New Roman', serif; }
      </style>
      ${lines}
      <path d="M70 76H1730" stroke="rgba(255,255,255,.2)"/>
      <circle cx="86" cy="50" r="7" fill="${project.accent}"/>
      <text x="110" y="57" fill="#f4f2eb" font-size="21" class="mono">${escapeXml(project.code)}</text>
      <text x="1730" y="57" fill="rgba(244,242,235,.58)" text-anchor="end" font-size="17" class="mono">REAL PRODUCT CAPTURE / 07.2026</text>
      <rect x="70" y="865" width="10" height="178" fill="${project.accent}"/>
      <text x="112" y="968" fill="#f4f2eb" font-size="94" class="display">${escapeXml(project.title)}</text>
      <text x="115" y="1018" fill="rgba(244,242,235,.68)" font-size="17" class="mono">${escapeXml(project.descriptor)}</text>
      <text x="1730" y="1030" fill="${project.accent}" text-anchor="end" font-size="20" class="mono">SHIPPED SYSTEM / VERIFIED SURFACE</text>
      <path d="M111 1057H1730" stroke="rgba(255,255,255,.2)"/>
    </svg>
  `);
}

async function framedCapture(source, width, height) {
  return sharp(path.join(captures, source))
    .resize(width, height, { fit: "cover", position: "top" })
    .modulate({ saturation: 0.92, brightness: 0.98 })
    .sharpen({ sigma: 0.45 })
    .extend({ top: 7, bottom: 7, left: 7, right: 7, background: "#d8ddd6" })
    .webp({ quality: 90 })
    .toBuffer();
}

async function buildCover(project) {
  const main = await framedCapture(project.primary, 1370, 770);
  const detail = await framedCapture(project.secondary, 630, 365);
  const shadow = await sharp({ create: { width: 1396, height: 796, channels: 4, background: "rgba(0,0,0,.55)" } })
    .blur(18)
    .png()
    .toBuffer();
  const detailShadow = await sharp({ create: { width: 656, height: 391, channels: 4, background: "rgba(0,0,0,.62)" } })
    .blur(14)
    .png()
    .toBuffer();

  await sharp({ create: { width: 1800, height: 1125, channels: 4, background: project.surface } })
    .composite([
      { input: shadow, left: 105, top: 116 },
      { input: main, left: 92, top: 102 },
      { input: detailShadow, left: 1104, top: 574 },
      { input: detail, left: 1091, top: 561 },
      { input: coverOverlay(project), left: 0, top: 0 },
    ])
    .webp({ quality: 88, effort: 5 })
    .toFile(path.join(output, `${project.slug}-operations-v2.webp`));
}

async function buildRawCapture(name) {
  await sharp(path.join(captures, `${name}.png`))
    .modulate({ saturation: 0.94, brightness: 1.01 })
    .sharpen({ sigma: 0.4 })
    .webp({ quality: 86, effort: 5 })
    .toFile(path.join(output, `${name}-capture.webp`));
}

await mkdir(output, { recursive: true });
for (const project of projects) {
  await Promise.all(project.raw.map(buildRawCapture));
  await buildCover(project);
}

console.log(`Built ${projects.length} project covers and ${projects.flatMap((project) => project.raw).length} product captures.`);
