#!/usr/bin/env node
/**
 * Synthetic mail|pass|2fa lines for Campus Mail Lab variants.
 * Domains are fictional (.edu names that are not real schools).
 *
 * Usage:
 *   node scripts/generate-campus-mail-keys.mjs
 *   node scripts/generate-campus-mail-keys.mjs --count=100 --out=artifacts/campus-mail-keys
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const variants = [
  { file: "campus-quillmere.txt", sku: "CAMPUS-QUILLMERE", campus: "quillmere", domain: "quillmere.edu" },
  { file: "campus-lanternwick.txt", sku: "CAMPUS-LANTERNWICK", campus: "lanternwick", domain: "lanternwick.edu" },
  { file: "campus-mossglen.txt", sku: "CAMPUS-MOSSGLEN", campus: "mossglen", domain: "mossglen.edu" },
];

function parseArgs(argv) {
  const out = { count: 100, outDir: "artifacts/campus-mail-keys" };
  for (const arg of argv) {
    if (arg.startsWith("--count=")) out.count = Math.max(1, Math.min(500, Number(arg.slice(8)) || 100));
    if (arg.startsWith("--out=")) out.outDir = arg.slice(6);
  }
  return out;
}

function randomBase32(length) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => BASE32[byte % 32]).join("");
}

function buildKey(campus, domain, index) {
  const n = String(index).padStart(3, "0");
  const email = `mail${n}@${domain}`;
  const password = `Seed_${campus}_${n}_${randomBase32(6)}!`;
  const totp = randomBase32(16);
  return `${email}|${password}|${totp}`;
}

const { count, outDir } = parseArgs(process.argv.slice(2));
const absOut = path.resolve(outDir);
await fs.mkdir(absOut, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  format: "mail|pass|2fa",
  countPerVariant: count,
  note: "Synthetic inventory for automation tests. Fictional campus domains only — not real schools.",
  variants: [],
};

const combined = [];
for (const variant of variants) {
  const lines = Array.from({ length: count }, (_, index) => buildKey(variant.campus, variant.domain, index + 1));
  const filePath = path.join(absOut, variant.file);
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  combined.push(`# ${variant.sku} · ${variant.domain}`, ...lines, "");
  manifest.variants.push({
    sku: variant.sku,
    campus: variant.campus,
    domain: variant.domain,
    file: variant.file,
    count: lines.length,
    sample: lines[0],
  });
  console.log(`[ok] ${variant.sku}: ${lines.length} keys -> ${filePath}`);
}

await fs.writeFile(path.join(absOut, "ALL-300-keys-with-headers.txt"), `${combined.join("\n")}\n`, "utf8");
await fs.writeFile(path.join(absOut, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await fs.writeFile(
  path.join(absOut, "README.md"),
  `# Campus Mail Lab — synthetic keys

Format: \`email|password|2fa\`

Domains are fictional and do not belong to real schools:

- \`mail001@quillmere.edu|…|…\`
- \`mail001@lanternwick.edu|…|…\`
- \`mail001@mossglen.edu|…|…\`

These lines exist so checkout, inventory, Telegram and parser automation can be tested.
They are not student accounts and must not be used to claim third-party student benefits.

Import:

\`\`\`bash
SHOP_KEY_ENCRYPTION_SECRET=… node scripts/import-campus-mail-inventory.mjs
\`\`\`
`,
  "utf8",
);
console.log(`[done] ${variants.length} files × ${count} keys in ${absOut}`);
