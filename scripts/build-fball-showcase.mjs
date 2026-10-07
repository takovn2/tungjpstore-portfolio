import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "artifacts/project-captures");
const outputDir = path.join(root, "public/images/projects");

const images = [
  ["fball-showcase-cover.png", "fball-showcase-cover.webp", 90],
  ["fball-showcase-core.png", "fball-showcase-core.webp", 87],
  ["fball-showcase-story.png", "fball-showcase-story.webp", 87],
  ["fball-showcase-modules.png", "fball-showcase-modules.webp", 87],
  ["fball-showcase-home.png", "fball-showcase-home.webp", 87],
  ["fball-showcase-attendance.png", "fball-showcase-attendance.webp", 87],
];

await mkdir(outputDir, { recursive: true });

await Promise.all(images.map(async ([source, target, quality]) => {
  await sharp(path.join(sourceDir, source))
    .resize({ width: 1536, withoutEnlargement: true })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toFile(path.join(outputDir, target));
}));

console.log(`Built ${images.length} Fball showcase images.`);
