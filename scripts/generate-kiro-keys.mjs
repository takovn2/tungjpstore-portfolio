#!/usr/bin/env node
/**
 * Generate synthetic mail|pass|2fa inventory lines for Kiro variants.
 * These are format-correct placeholders for ops import — not real provider accounts.
 *
 * Usage:
 *   node scripts/generate-kiro-keys.mjs
 *   node scripts/generate-kiro-keys.mjs --count=100 --out=artifacts/kiro-keys
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const variants = [
  { file: "kiro-pro.txt", sku: "KIRO-PRO-1K", plan: "pro", credits: 1000 },
  { file: "kiro-pro-plus.txt", sku: "KIRO-PRO-PLUS-2K", plan: "pro_plus", credits: 2000 },
  { file: "kiro-promax.txt", sku: "KIRO-PROMAX-5K", plan: "pro_max", credits: 5000 },
  { file: "kiro-power.txt", sku: "KIRO-POWER-10K", plan: "power", credits: 10000 },
];

function parseArgs(argv) {
  const out = { count: 100, outDir: "artifacts/kiro-keys" };
  for (const arg of argv) {
    if (arg.startsWith("--count=")) out.count = Math.max(1, Math.min(500, Number(arg.slice(8)) || 100));
    if (arg.startsWith("--out=")) out.outDir = arg.slice(6);
  }
  return out;
}

function randomBase32(length) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => BASE32[b % 32]).join("");
}

function randomLocal(plan, index) {
  const salt = randomBase32(6).toLowerCase();
  return `kiro.${plan}.${salt}.${String(index).padStart(3, "0")}`;
}

function buildKey(plan, index) {
  const email = `${randomLocal(plan, index)}@seed.tungjpstore.local`;
  const password = `Kiro_${plan}_${String(index).padStart(3, "0")}_${randomBase32(6)}!`;
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
  expiresOn: "2026-08-01",
  note: "Synthetic seed inventory only. Replace with real merchant keys before customer fulfillment if required.",
  variants: [],
};

for (const variant of variants) {
  const lines = Array.from({ length: count }, (_, i) => buildKey(variant.plan, i + 1));
  const filePath = path.join(absOut, variant.file);
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  manifest.variants.push({
    sku: variant.sku,
    plan: variant.plan,
    credits: variant.credits,
    file: variant.file,
    count: lines.length,
  });
  console.log(`[ok] ${variant.sku}: ${lines.length} keys -> ${filePath}`);
}

await fs.writeFile(path.join(absOut, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[done] ${variants.length} files × ${count} keys in ${absOut}`);
