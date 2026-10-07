import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("Cloudflare build serves editable public CMS routes on demand", () => {
  assert.match(read("astro.config.mjs"), /output:\s*['"]server['"]/);
  assert.match(read("src/pages/api/contact.ts"), /export const prerender = false/);
  for (const file of [
    "src/pages/index.astro",
    "src/pages/work/index.astro",
    "src/pages/work/[slug].astro",
    "src/pages/lab.astro",
    "src/pages/blog.astro",
    "src/pages/contact.astro",
    "src/pages/[lang]/index.astro",
    "src/pages/[lang]/[...slug].astro",
  ]) {
    const source = read(file);
    assert.match(source, /export const prerender = false/, `${file} must be on-demand`);
    assert.match(source, /loadPublicSnapshot/, `${file} must read public CMS data`);
  }

  const wranglerSource = read("wrangler.jsonc");
  const wrangler = JSON.parse(wranglerSource);
  assert.equal(wrangler.workers_dev, false);
  assert.ok(wrangler.d1_databases.some((binding) => binding.binding === "CONTACT_DB"));
  assert.match(wrangler.vars.TURNSTILE_SITE_KEY, /^0x4[A-Za-z0-9]+$/);
  assert.equal(wrangler.assets.not_found_handling, "404-page");
  assert.ok(Array.isArray(wrangler.assets.run_worker_first));
  for (const route of [
    "/",
    "/api/*",
    "/admin",
    "/admin/*",
    "/contact*",
    "/work*",
    "/lab*",
    "/about*",
    "/privacy*",
    "/pricing*",
    "/terms-of-service*",
    "/refund-policy*",
    "/robots.txt",
    "/rss.xml",
    "/sitemap.xml",
    "/en",
    "/en/*",
    "/ja",
    "/ja/*",
    "/zh",
    "/zh/*",
    "/vi",
    "/vi/*",
  ]) {
    assert.ok(wrangler.assets.run_worker_first.includes(route), `${route} must run through the Worker`);
  }
  for (const staticRoute of ["/_astro/*", "/brand/*", "/images/*", "/icons/*", "/og/*", "/favicon.ico", "/site.webmanifest"]) {
    assert.equal(
      wrangler.assets.run_worker_first.includes(staticRoute),
      false,
      `${staticRoute} must remain asset-first to keep static requests out of the Worker`,
    );
  }
  assert.equal(wrangler.assets.run_worker_first.includes("/blog*"), true);
  assert.equal(wrangler.assets.run_worker_first.some((route) => route.startsWith("/_astro")), false);
  for (const hostname of ["tung.codes", "www.tung.codes", "tungjpstore.net", "www.tungjpstore.net"]) {
    assert.ok(wrangler.routes.some((route) => route.pattern === hostname && route.custom_domain === true));
  }
  assert.equal(wrangler.vars.SHOP_PUBLIC_ORIGIN, "https://tung.codes");
  assert.equal(wrangler.vars.MEDIA_PUBLIC_BASE_URL, "https://media.tung.codes");

  const middleware = read("src/middleware.ts");
  assert.match(middleware, /isLegacySiteHost\(host\)/);
  assert.match(middleware, /isSafeRedirectMethod/);
  assert.match(middleware, /target\.hostname = SITE_HOST/);
  assert.match(middleware, /target\.protocol = "https:"/);
  assert.match(middleware, /Response\.redirect\(target, 308\)/);
  assert.match(middleware, /Strict-Transport-Security/);
  assert.match(middleware, /https:\/\/media\.tung\.codes/);
  assert.match(middleware, /https:\/\/media\.tungjpstore\.net/);

  const packageJson = JSON.parse(read("package.json"));
  assert.match(packageJson.scripts.deploy, /npm run build && wrangler deploy --config dist\/server\/wrangler\.json/);
});

test("locale aliases and prerendered routes stay on the Worker before assets", () => {
  const wrangler = JSON.parse(read("wrangler.jsonc"));
  const workerFirst = wrangler.assets.run_worker_first;

  // The Vietnamese alias must reach Astro so /vi and /vi/* can canonicalize to the unprefixed routes.
  for (const route of ["/vi", "/vi/*"]) {
    assert.ok(workerFirst.includes(route), `${route} must run through the Worker for locale redirects`);
  }

  // Canonical public pages stay on the Worker so protocol and host redirects
  // cannot be bypassed by an edge-cached Static Asset response.
  for (const route of ["/about*", "/privacy*", "/pricing*", "/terms-of-service*", "/refund-policy*"]) {
    assert.ok(workerFirst.includes(route), `${route} must run through the Worker even when prerendered`);
  }
  for (const file of ["src/pages/about.astro", "src/pages/privacy.astro", "src/pages/pricing.astro", "src/pages/terms-of-service.astro", "src/pages/refund-policy.astro"]) {
    assert.match(read(file), /export const prerender = false/, `${file} must run through protocol and host middleware`);
  }
  assert.match(read("src/pages/404.astro"), /export const prerender = true/, "the static 404 fallback remains intentional");

  const localizedIndex = read("src/pages/[lang]/index.astro");
  const localizedRoute = read("src/pages/[lang]/[...slug].astro");
  for (const source of [localizedIndex, localizedRoute]) {
    assert.match(source, /if \(rawLang === "vi"\) return Astro\.redirect\([\s\S]*Astro\.url\.search[\s\S]*, 308\)/);
  }
});

test("static assets and the D1 rate limiter keep their production safeguards", () => {
  const headers = read("public/_headers");
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /Strict-Transport-Security: max-age=31536000/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /script-src[^\n]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers, /connect-src[^\n]*https:\/\/challenges\.cloudflare\.com/);

  const migration = read("migrations/0003_contact_rate_limits.sql");
  assert.match(migration, /ip_hash TEXT PRIMARY KEY/);
  assert.match(migration, /\(expires_at\)/);

  const contactApi = read("src/pages/api/contact.ts");
  assert.match(contactApi, /ON CONFLICT\(ip_hash\) DO UPDATE/);
  assert.match(contactApi, /CONTACT_DB\.batch\(\[cleanup, claim, insert, enqueueConfirmation\]\)/);
  assert.match(contactApi, /contact\.submission\.confirmed/);
  assert.match(contactApi, /last_claim_id = \?/);
  assert.doesNotMatch(contactApi, /datetime\(created_at\)/);
});
