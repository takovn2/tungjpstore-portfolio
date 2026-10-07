import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "artifacts/project-captures");
const outputDir = path.join(root, "public/images/projects");

const images = [
  ["logivn-showcase-cover.png", "logivn-showcase-cover.webp", 90],
  ["logivn-showcase-overview.png", "logivn-showcase-overview.webp", 87],
  ["logivn-showcase-orders.png", "logivn-showcase-orders.webp", 87],
  ["logivn-showcase-staff.png", "logivn-showcase-staff.webp", 87],
  ["logivn-showcase-ai.png", "logivn-showcase-ai.webp", 87],
];

await mkdir(outputDir, { recursive: true });

await Promise.all(images.map(async ([source, target, quality]) => {
  await sharp(path.join(sourceDir, source))
    .resize({ width: 1586, withoutEnlargement: true })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toFile(path.join(outputDir, target));
}));

console.log(`Built ${images.length} LogiVN showcase images.`);
