const https = require("https");
const fs = require("fs");
const { execSync } = require("child_process");

const domains = {
  "capcut-pro.webp": "capcut.com",
  "cursor-pro.webp": "cursor.com",
  "elevenlab.webp": "elevenlabs.io",
  "google-family.webp": "one.google.com",
  "suno.webp": "suno.com",
  "heygen.webp": "heygen.com",
  "kiro.webp": "kiro.ai",
  "kling.webp": "klingai.com",
  "leonardo-ai.webp": "leonardo.ai",
  "lovable.webp": "lovable.dev"
};

const shopDir = "/Users/tunbee27/Documents/Profile/public/images/shop";

async function fetchFavicon(domain, outFile) {
  const url = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=256`;
  const tempPath = `/tmp/${outFile.replace(".webp", ".png")}`;
  
  return new Promise((resolve) => {
    https.get(url, (res) => {
      const file = fs.createWriteStream(tempPath);
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          try {
            // Check file size, if very small it might be a 16x16 default
            const stats = fs.statSync(tempPath);
            if (stats.size > 100) {
               execSync(`npx sharp-cli -i "${tempPath}" -o "${shopDir}/${outFile}" -q 92`);
               console.log(`Generated favicon logo for: ${outFile} from ${domain}`);
            } else {
               console.log(`Favicon too small or failed for: ${outFile}`);
            }
          } catch(e) {
            console.error("Sharp failed for", outFile, e.message);
          }
          resolve();
        });
      });
    }).on("error", resolve);
  });
}

async function run() {
  console.log("Fixing missing logos...");
  for (const [file, domain] of Object.entries(domains)) {
    await fetchFavicon(domain, file);
  }
  console.log("Done fixing missing logos.");
}

run();
