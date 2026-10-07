import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("the public CMS seed contains every published item in all four locales", () => {
  const seed = read("content-migrations/0003_seed_public_content.sql");
  for (const slug of [
    "home-hero",
    "contact-profile",
    "logivn",
    "payment-infrastructure",
    "fball",
    "payment-confirmation-reconciliation",
    "tenant-boundaries-in-practice",
    "low-cost-cloud-operations",
    "assisted-operations-with-confirmation",
    "e-invoicing-domain-model",
  ]) assert.match(seed, new RegExp(`'${slug}'`), `missing seed slug ${slug}`);
  assert.equal((seed.match(/^-- (site_section|project|post)\//gm) ?? []).length, 10);
  assert.equal((seed.match(/INSERT OR IGNORE INTO localizations/g) ?? []).length, 40);
  for (const locale of ["vi", "en", "ja", "zh"]) {
    assert.equal((seed.match(new RegExp(`INSERT OR IGNORE INTO localizations[^\n]+, '${locale}',`, "g")) ?? []).length, 10);
  }
  assert.doesNotMatch(seed, /(?<![Ff])ball\.vn/);
  assert.doesNotMatch(seed, /mailto:/);
  assert.match(seed, /WHERE id = 'default' AND config_json = '\{\}'/);
});

test("seed generation is reproducible and guarded for repeated execution", () => {
  const script = read("scripts/seed-content.mjs");
  assert.match(script, /INSERT OR IGNORE INTO content_items/);
  assert.match(script, /INSERT OR IGNORE INTO revisions/);
  assert.match(script, /published_at, slug, sort_order, cover_media_id/);
  assert.match(script, /WHERE EXISTS \(SELECT 1 FROM content_items/);
  assert.match(script, /current_published_revision_id IS NULL AND status = 'published' AND version = 1/);
  assert.match(script, /Refusing to apply without --remote or --local/);
  assert.match(script, /seed:public-content:v1/);
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/seed-content.mjs", "--check"], {
    cwd: projectRoot,
    stdio: "pipe",
  });
});
