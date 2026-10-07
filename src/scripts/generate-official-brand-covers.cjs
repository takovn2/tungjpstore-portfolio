const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const shopDir = "/Users/tunbee27/Documents/Profile/public/images/shop";

const brandMap = {
  "adobe.webp": { slug: "adobe", name: "Adobe Creative Cloud", color: "#ff0000" },
  "canva.webp": { slug: "canva", name: "Canva Pro", color: "#00c4cc" },
  "capcut-pro.webp": { slug: "capcut", name: "CapCut Pro", color: "#000000" },
  "chatgpt-plus.webp": { slug: "openai", name: "ChatGPT Plus", color: "#10a37f" },
  "claude-api.webp": { slug: "anthropic", name: "Claude API", color: "#d97757" },
  "claude-x20.webp": { slug: "anthropic", name: "Claude 3.5 Sonnet", color: "#d97757" },
  "cursor-pro.webp": { slug: "cursor", name: "Cursor AI Pro", color: "#000000" },
  "elevenlab.webp": { slug: "elevenlabs", name: "ElevenLabs AI Voice", color: "#000000" },
  "gemini-pro.webp": { slug: "googlegemini", name: "Gemini Advanced", color: "#1a73e8" },
  "gmail-aged.webp": { slug: "gmail", name: "Gmail Premium", color: "#ea4335" },
  "google-family.webp": { slug: "googleone", name: "Google One Family", color: "#ea4335" },
  "gpm-login.webp": { slug: "googlechrome", name: "GPM Anti-detect", color: "#4285f4" },
  "grok-api.webp": { slug: "x", name: "Grok API", color: "#000000" },
  "heygen.webp": { slug: "heygen", name: "HeyGen AI Video", color: "#7c3aed", fallback: "video" },
  "hma-vpn.webp": { slug: "hidemyass", name: "HMA VPN", color: "#ffc107", fallback: "shield" },
  "kiro.webp": { slug: "kiro", name: "Kiro AI", color: "#6366f1", fallback: "code" },
  "kiro-logo.webp": { slug: "kiro", name: "Kiro AI", color: "#6366f1", fallback: "code" },
  "kling.webp": { slug: "video", name: "Kling AI Video", color: "#2563eb", fallback: "video" },
  "leonardo-ai.webp": { slug: "leonardoai", name: "Leonardo.ai", color: "#ec4899", fallback: "sparkles" },
  "linkedin-premium.webp": { slug: "linkedin", name: "LinkedIn Premium", color: "#0a66c2" },
  "lovable.webp": { slug: "lovable", name: "Lovable.dev", color: "#ff4785", fallback: "heart" },
  "microsoft.webp": { slug: "microsoft", name: "Microsoft 365", color: "#00a4ef" },
  "netflix.webp": { slug: "netflix", name: "Netflix 4K Ultra", color: "#e50914" },
  "notion-enterprise.webp": { slug: "notion", name: "Notion Enterprise", color: "#000000" },
  "scribd.webp": { slug: "scribd", name: "Scribd Premium", color: "#1e293b" },
  "suno.webp": { slug: "suno", name: "Suno AI Music", color: "#000000" },
  "super-grok.webp": { slug: "x", name: "Super Grok", color: "#000000" },
  "tiktok.webp": { slug: "tiktok", name: "TikTok Shop", color: "#000000" },
  "veo3-anti.webp": { slug: "googlegemini", name: "Google Veo 3", color: "#1a73e8" },
  "veo3-credits.webp": { slug: "googlegemini", name: "Google Veo Credits", color: "#1a73e8" },
  "x-premium.webp": { slug: "x", name: "X Premium", color: "#000000" },
  "xbox.webp": { slug: "xbox", name: "Xbox Game Pass", color: "#107c41" },
  "ytb-premium.webp": { slug: "youtube", name: "YouTube Premium", color: "#ff0000" },
  "zoom-pro.webp": { slug: "zoom", name: "Zoom Pro", color: "#2d8cff" },
};

function fetchSvg(slug) {
  return new Promise((resolve) => {
    https.get(`https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/${slug}.svg`, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", () => resolve(null));
  });
}

function extractPath(svgText) {
  if (!svgText) return null;
  const match = svgText.match(/<path[^>]+d="([^"]+)"/);
  return match ? match[1] : null;
}

const fallbackPaths = {
  video: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
  shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
  code: "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
  sparkles: "M12 2L9.19 8.63 2 12l7.19 3.37L12 22l2.81-6.63L22 12l-7.19-3.37L12 2z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
};

async function generateAll() {
  console.log("Starting official brand SVG generation...");
  const tempDir = path.join(shopDir, "temp_svgs");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  for (const [file, config] of Object.entries(brandMap)) {
    if (config.preserve && fs.existsSync(path.join(shopDir, file))) {
      console.log(`Preserving existing generated cover: ${file}`);
      continue;
    }

    let rawSvg = await fetchSvg(config.slug);
    let pathData = extractPath(rawSvg);

    if (!pathData && config.fallback) {
      pathData = fallbackPaths[config.fallback] || null;
    }
    if (!pathData) {
      pathData = fallbackPaths.sparkles;
    }

    // Build exact fit SVG with transparent background
    const canvasSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 24 24">
  <path fill="${config.color}" d="${pathData}"/>
</svg>`;

    const svgPath = path.join(tempDir, file.replace(".webp", ".svg"));
    const webpPath = path.join(shopDir, file);

    fs.writeFileSync(svgPath, canvasSvg);
    execSync(`npx sharp-cli -i "${svgPath}" -o "${webpPath}" -q 92`);
    console.log(`Generated official brand cover: ${file}`);
  }

  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("All official brand cover images ready!");
}

generateAll().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
