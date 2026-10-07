import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const endpoint = "http://localhost:20128/v1/images/generations";
const model = "cx/gpt-5.4-image";
const outputDir = path.resolve("artifacts/shop-images-2026-07-25");
const logoDir = path.join(outputDir, "logos");
const rawDir = path.join(outputDir, "raw");

const products = [
  {
    slug: "chatgpt-plus",
    name: "ChatGPT Plus",
    category: "AI ASSISTANT",
    icon: "logos/openai-icon",
    accent: "#10A37F",
    prompt: "luxury AI assistant portal, deep charcoal and warm ivory, flowing neural mesh ribbons, subtle golden data sparks, elegant glass arch, premium studio technology advertising",
  },
  {
    slug: "gemini-pro",
    name: "Gemini Pro",
    category: "MULTIMODAL AI",
    icon: "logos/google-gemini",
    accent: "#4285F4",
    prompt: "multimodal AI universe, prismatic blue cyan coral light, two luminous celestial forms converging, glassy cosmic geometry, polished Google-inspired creative technology atmosphere",
  },
  {
    slug: "canva",
    name: "Canva",
    category: "DESIGN PLATFORM",
    icon: "devicon/canva",
    accent: "#00C4CC",
    prompt: "joyful modern design studio, layered paper shapes, cyan teal magenta gradients, floating frames and creative tools, bright tactile materials, premium editorial composition",
  },
  {
    slug: "capcut-pro",
    name: "CapCut Pro",
    category: "VIDEO EDITING",
    icon: "selfhst/capcut",
    accent: "#111111",
    prompt: "high energy video editing stage, black white and electric cyan, kinetic film strips, sharp cut transitions, glossy motion panels, cinematic light beams, bold creator economy advertising",
  },
  {
    slug: "super-grok",
    name: "Super Grok",
    category: "REAL-TIME AI",
    icon: "logos/grok",
    accent: "#111111",
    prompt: "real-time intelligence observatory, black graphite and icy blue, orbital signal rings, cosmic data horizon, precise futuristic instruments, witty bold science fiction technology campaign",
  },
  {
    slug: "netflix",
    name: "Netflix",
    category: "STREAMING",
    icon: "logos/netflix-icon",
    accent: "#E50914",
    prompt: "premium home cinema at night, deep black and signature crimson light curtains, cinematic projector haze, dramatic theater reflections, immersive streaming entertainment campaign",
  },
  {
    slug: "cursor-pro",
    name: "Cursor Pro",
    category: "AI CODE EDITOR",
    icon: "simple-icons/cursor",
    accent: "#111111",
    prompt: "elite AI software workspace, obsidian desk with luminous code windows, emerald and ice blue syntax light, architectural grid, precise developer tools, sophisticated minimal product advertising",
  },
  {
    slug: "microsoft",
    name: "Microsoft",
    category: "PRODUCTIVITY",
    icon: "logos/microsoft-icon",
    accent: "#0078D4",
    prompt: "modern productivity workspace made of four colorful glass quadrants, blue green amber red light, organized documents and cloud forms, optimistic professional technology campaign",
  },
  {
    slug: "elevenlab",
    name: "ElevenLabs",
    category: "AI VOICE",
    icon: "simple-icons/elevenlabs",
    accent: "#111111",
    prompt: "premium voice synthesis studio, black ivory and electric amber, sculptural sound waves, translucent acoustic panels, human voice energy visualized as elegant ribbons, editorial audio technology",
  },
  {
    slug: "ytb-premium",
    name: "YouTube Premium",
    category: "VIDEO & MUSIC",
    icon: "logos/youtube-icon",
    accent: "#FF0000",
    prompt: "premium video and music lounge, vivid red light with warm black surroundings, floating play surfaces, rhythmic equalizer glow, cinematic creator entertainment campaign",
  },
  {
    slug: "veo3-anti",
    name: "Veo 3",
    category: "AI VIDEO",
    icon: "simple-icons/deepmind",
    accent: "#0F9D8A",
    prompt: "advanced generative film studio, teal aqua and midnight blue, cinematic frames transforming into realistic worlds, volumetric camera light, fluid DeepMind-inspired visual intelligence, premium AI video campaign",
  },
  {
    slug: "xbox",
    name: "Xbox",
    category: "GAMING",
    icon: "cib/xbox",
    accent: "#107C10",
    prompt: "next-generation gaming arena, signature Xbox green and deep black, luminous spherical architecture, energetic controller-inspired curves, immersive futuristic play environment",
  },
  {
    slug: "adobe",
    name: "Adobe",
    category: "CREATIVE CLOUD",
    icon: "logos/adobe-icon",
    accent: "#FF0000",
    prompt: "high-end creative studio, Adobe red with charcoal and warm white, layered photography illustration and motion canvases, precision grids, expressive light, premium creative software campaign",
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchLogo(product) {
  const file = path.join(logoDir, `${product.slug}.svg`);
  try {
    await fs.access(file);
    return file;
  } catch {}

  const response = await fetch(`https://api.iconify.design/${product.icon}.svg?height=320`);
  if (!response.ok) throw new Error(`Logo ${product.icon} returned ${response.status}`);
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

async function generateBackground(product) {
  const rawFile = path.join(rawDir, `${product.slug}.png`);
  try {
    await fs.access(rawFile);
    console.log(`[reuse] ${product.slug}`);
    return rawFile;
  } catch {}

  const prompt = [
    "Create a distinct 4:3 landscape commercial cover image.",
    product.prompt + ".",
    "Center a clean softly illuminated negative-space area for a logo badge.",
    "No text, no letters, no typography, no logo, no watermark, no UI screenshot.",
    "Highly polished art direction, realistic materials, rich depth, crisp details, storefront-ready.",
  ].join(" ");

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      console.log(`[generate ${attempt}/3] ${product.slug}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt, size: "1024x1024", quality: "high", n: 1, response_format: "b64_json" }),
        signal: AbortSignal.timeout(240_000),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.data?.[0]?.b64_json) {
        throw new Error(payload?.error?.message || `9Router returned ${response.status}`);
      }
      await fs.writeFile(rawFile, Buffer.from(payload.data[0].b64_json, "base64"));
      return rawFile;
    } catch (error) {
      lastError = error;
      console.warn(`[retry] ${product.slug}: ${error.message}`);
      if (attempt < 3) await sleep(30_000 * attempt);
    }
  }
  throw lastError;
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

async function composeCover(product, backgroundFile, logoFile) {
  const outputFile = path.join(outputDir, `${product.slug}.webp`);
  const logo = await sharp(logoFile).resize({ width: 250, height: 210, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const card = Buffer.from(`
    <svg width="520" height="500" viewBox="0 0 520 500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000000" flood-opacity="0.28"/>
        </filter>
      </defs>
      <rect x="20" y="12" width="480" height="456" rx="54" fill="#ffffff" fill-opacity="0.91" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2" filter="url(#shadow)"/>
      <rect x="64" y="374" width="392" height="3" rx="2" fill="${product.accent}" fill-opacity="0.86"/>
      <text x="260" y="415" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="29" font-weight="700" letter-spacing="1.2" fill="#111318">${escapeXml(product.name)}</text>
      <text x="260" y="450" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="3.2" fill="#626971">${escapeXml(product.category)}</text>
    </svg>
  `);

  await sharp(backgroundFile)
    .resize(1200, 900, { fit: "cover", position: "attention" })
    .modulate({ saturation: 1.04 })
    .composite([
      { input: card, left: 340, top: 190 },
      { input: logo, left: Math.round((1200 - 250) / 2), top: 292 },
    ])
    .webp({ quality: 88, effort: 5 })
    .toFile(outputFile);
  console.log(`[done] ${product.slug}`);
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(logoDir, { recursive: true });
await fs.mkdir(rawDir, { recursive: true });

for (const product of products) {
  const [logoFile, backgroundFile] = await Promise.all([fetchLogo(product), generateBackground(product)]);
  await composeCover(product, backgroundFile, logoFile);
}

console.log(`Generated ${products.length} covers in ${outputDir}`);
