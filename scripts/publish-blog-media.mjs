#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bucket = process.env.MEDIA_BUCKET_NAME ?? "tung-profile-media";
const entries = [
  [
    "ai-workflow-system",
    "Workflow-first AI system"
  ],
  [
    "ai-workflow-system-detail",
    "Workflow desk detail"
  ],
  [
    "cloudflare-rag-edge",
    "Edge RAG knowledge system"
  ],
  [
    "cloudflare-rag-edge-detail",
    "Knowledge index desk detail"
  ],
  [
    "multilingual-product-system",
    "Multilingual product system"
  ],
  [
    "multilingual-product-system-detail",
    "Localization review detail"
  ],
  [
    "agentic-ai-security-gates",
    "Agent authority and approval gates"
  ],
  [
    "agentic-ai-security-gates-detail",
    "Access control desk detail"
  ],
  [
    "logivn-one-order-flow",
    "LogiVN shared order flow"
  ],
  [
    "logivn-one-order-flow-detail",
    "Kitchen order state detail"
  ],
  [
    "fball-matchday-state",
    "Fball match-day shared state"
  ],
  [
    "fball-matchday-state-detail",
    "Pitch and ball detail"
  ],
  [
    "tenant-boundary-product",
    "Tenant boundary product design"
  ],
  [
    "tenant-boundary-product-detail",
    "Workspace boundary detail"
  ],
  [
    "payment-evidence-first",
    "Payment evidence before merchant state"
  ],
  [
    "payment-evidence-first-detail",
    "Reconciliation paperwork detail"
  ]
].map(([slug, label]) => ({
  slug,
  label,
  file: resolve(root, `public/images/blog/${slug}.webp`),
  key: `blog/${slug}.webp`,
}));

const args = new Set(process.argv.slice(2));
if (args.has("--apply") && !args.has("--remote") && !args.has("--local")) {
  throw new Error("Refusing to upload without --remote or --local");
}
if (args.has("--remote") && args.has("--local")) {
  throw new Error("Choose exactly one of --remote or --local");
}

for (const entry of entries) {
  if (!existsSync(entry.file)) throw new Error(`Missing blog media: ${entry.file}`);
  const metadata = await sharp(entry.file).metadata();
  const stat = statSync(entry.file);
  if (metadata.format !== "webp" || metadata.width !== 1600 || metadata.height !== 900) {
    throw new Error(`${entry.file} must be a 1600x900 WebP`);
  }
  if (stat.size > 180 * 1024) throw new Error(`${entry.file} exceeds the 180 KiB media budget`);
}

if (!args.has("--apply")) {
  for (const entry of entries) console.log(`${entry.key} <- ${entry.file} (${entry.label})`);
  console.log("Dry run only. Pass --apply --remote to publish to production R2.");
  process.exit(0);
}

for (const entry of entries) {
  const commandArgs = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${entry.key}`,
    `--file=${entry.file}`,
    "--content-type=image/webp",
  ];
  if (args.has("--remote")) commandArgs.push("--remote");
  execFileSync("npx", commandArgs, { cwd: root, stdio: "inherit" });
}
