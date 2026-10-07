const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const shopDir = "/Users/tunbee27/Documents/Profile/public/images/shop";
const lobeIconsDir = "/Users/tunbee27/Documents/Profile/node_modules/@lobehub/icons-static-svg/icons";
const localKiroSvg = "/Users/tunbee27/Documents/Profile/artifacts/shop-images-2026-07-25/logos/kiro.svg";

const brandMap = {
  // Simple Icons (latest version)
  "adobe.webp": { source: "simple-icons", slug: "adobe", color: "#ff0000" },
  "canva.webp": { source: "simple-icons", slug: "canva", color: "#00c4cc" },
  "chatgpt-plus.webp": { source: "lobe-icons", file: "openai.svg" },
  "claude-api.webp": { source: "lobe-icons", file: "claude-color.svg" },
  "claude-x20.webp": { source: "lobe-icons", file: "claude-color.svg" },
  "cursor-pro.webp": { source: "lobe-icons", file: "cursor.svg" },
  "elevenlab.webp": { source: "lobe-icons", file: "elevenlabs.svg" },
  "gemini-pro.webp": { source: "lobe-icons", file: "gemini-color.svg" },
  "gmail-aged.webp": { source: "simple-icons", slug: "gmail", color: "#ea4335" },
  "google-family.webp": { source: "lobe-icons", file: "google-color.svg" },
  "gpm-login.webp": { source: "simple-icons", slug: "googlechrome", color: "#4285f4" },
  "grok-api.webp": { source: "lobe-icons", file: "grok.svg" },
  "super-grok.webp": { source: "lobe-icons", file: "grok.svg" },
  "hma-vpn.webp": { source: "url-png", url: "https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://hidemyass.com&size=256" },
  "kiro.webp": { source: "local-svg", path: localKiroSvg },
  "kiro-logo.webp": { source: "local-svg", path: localKiroSvg },
  "kling.webp": { source: "lobe-icons", file: "kling-color.svg" },
  "linkedin-premium.webp": { source: "simple-icons", slug: "linkedin", color: "#0a66c2" },
  "lovable.webp": { source: "lobe-icons", file: "lovable-color.svg" },
  "microsoft.webp": { source: "simple-icons", slug: "microsoft", color: "#00a4ef" },
  "netflix.webp": { source: "simple-icons", slug: "netflix", color: "#e50914" },
  "notion-enterprise.webp": { source: "simple-icons", slug: "notion", color: "#000000" },
  "scribd.webp": { source: "simple-icons", slug: "scribd", color: "#1e293b" },
  "suno.webp": { source: "lobe-icons", file: "suno.svg" },
  "tiktok.webp": { source: "simple-icons", slug: "tiktok", color: "#000000" },
  "veo3-anti.webp": { source: "lobe-icons", file: "gemini-color.svg" },
  "veo3-credits.webp": { source: "lobe-icons", file: "gemini-color.svg" },
  "x-premium.webp": { source: "simple-icons", slug: "x", color: "#000000" },
  "xbox.webp": { source: "simple-icons", slug: "xbox", color: "#107c41" },
  "ytb-premium.webp": { source: "simple-icons", slug: "youtube", color: "#ff0000" },
  "zoom-pro.webp": { source: "simple-icons", slug: "zoom", color: "#2d8cff" },
  
  // Custom Downloads
  "heygen.webp": { source: "url-png", url: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/assets/icon.png" },
  "leonardo-ai.webp": { source: "url-png", url: "https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://leonardo.ai&size=256" }
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}, status: ${res.statusCode}`));
      }
      let data = [];
      res.on("data", chunk => data.push(chunk));
      res.on("end", () => resolve(Buffer.concat(data)));
    }).on("error", reject);
  });
}

async function processBrand(file, config) {
  const tempSvgPath = path.join("/tmp", file.replace(".webp", ".svg"));
  const tempPngPath = path.join("/tmp", file.replace(".webp", ".png"));
  const targetWebpPath = path.join(shopDir, file);
  
  console.log(`Processing ${file} from source ${config.source}...`);

  if (config.source === "simple-icons") {
    const url = `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${config.slug}.svg`;
    const svgBuffer = await fetchUrl(url);
    let svgText = svgBuffer.toString("utf8");
    
    // Inject the brand color
    svgText = svgText.replace("<path ", `<path fill="${config.color}" `);
    
    fs.writeFileSync(tempSvgPath, svgText);
    execSync(`npx sharp-cli -i "${tempSvgPath}" -o "${targetWebpPath}" -q 92 resize 800 800`);
    fs.unlinkSync(tempSvgPath);
  } 
  else if (config.source === "lobe-icons") {
    const svgPath = path.join(lobeIconsDir, config.file);
    if (!fs.existsSync(svgPath)) {
      throw new Error(`Lobe icon not found: ${svgPath}`);
    }
    // Lobe icons are already beautiful color SVGs, just convert directly!
    execSync(`npx sharp-cli -i "${svgPath}" -o "${targetWebpPath}" -q 92 resize 800 800`);
  } 
  else if (config.source === "local-svg") {
    if (!fs.existsSync(config.path)) {
      throw new Error(`Local SVG not found: ${config.path}`);
    }
    execSync(`npx sharp-cli -i "${config.path}" -o "${targetWebpPath}" -q 92 resize 800 800`);
  } 
  else if (config.source === "url-png") {
    const pngBuffer = await fetchUrl(config.url);
    fs.writeFileSync(tempPngPath, pngBuffer);
    execSync(`npx sharp-cli -i "${tempPngPath}" -o "${targetWebpPath}" -q 92 resize 800 800`);
    fs.unlinkSync(tempPngPath);
  }
  
  console.log(`Successfully generated: ${file}`);
}

async function run() {
  console.log("Generating 33 perfect brand covers...");
  for (const [file, config] of Object.entries(brandMap)) {
    try {
      await processBrand(file, config);
    } catch(err) {
      console.error(`[ERROR] Failed to process ${file}:`, err.message);
      process.exit(1); // Stop immediately if any logo fails! No silent errors.
    }
  }
  console.log("All 33 brand covers generated successfully!");
}

run();
