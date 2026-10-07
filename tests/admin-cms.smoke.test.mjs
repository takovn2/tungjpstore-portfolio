import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadValidation() {
  const types = compile(read("src/lib/admin/types.ts"));
  const dbUtils = compile(read("src/lib/admin/db-utils.ts")).replace(
    /import\s*\{[^}]+\}\s*from\s*["']\.\/http["'];?/,
    "",
  );
  const validation = compile(read("src/lib/admin/validation.ts"))
    .replace(/import\s*\{[^}]+\}\s*from\s*["']\.\/types["'];?/, "")
    .replace(/import\s*\{[^}]+\}\s*from\s*["']\.\/db-utils["'];?/, "");
  return importSource(`${types}\n${dbUtils}\n${validation}`);
}

async function loadAdminSecurity() {
  const http = compile(read("src/lib/admin/http.ts"));
  const auth = compile(read("src/lib/admin/auth.ts")).replace(
    /import\s*\{\s*adminError\s*\}\s*from\s*["']\.\/http["'];?/,
    "",
  );
  return importSource(`${http}\n${auth}`);
}

test("Cloudflare Free bindings and the CONTENT_DB schema stay separated", () => {
  const wrangler = JSON.parse(read("wrangler.jsonc"));
  const contentDb = wrangler.d1_databases.find((binding) => binding.binding === "CONTENT_DB");
  const contactDb = wrangler.d1_databases.find((binding) => binding.binding === "CONTACT_DB");
  const media = wrangler.r2_buckets.find((binding) => binding.binding === "MEDIA");

  assert.ok(contentDb, "CONTENT_DB binding is missing");
  assert.ok(contactDb, "CONTACT_DB binding is missing");
  assert.notEqual(contentDb.database_name, contactDb.database_name);
  assert.equal(contentDb.migrations_dir, "content-migrations");
  assert.match(media?.bucket_name ?? "", /^[a-z0-9][a-z0-9-]{2,62}$/);
  assert.notEqual(media?.bucket_name, "REPLACE_WITH_MEDIA_BUCKET_NAME");
  assert.equal(existsSync(`${projectRoot}/content-migrations/0001_content_cms.sql`), true);

  const migration = read("content-migrations/0001_content_cms.sql");
  for (const table of ["content_items", "revisions", "localizations", "media", "audit_logs", "site_state", "transaction_guards"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(migration, /locale IN \('vi', 'en', 'ja', 'zh'\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_content_items_type_slug_active/);
  assert.match(migration, /WHERE deleted_at IS NULL/);
  assert.match(migration, /CHECK \(valid = 1\)/);
  assert.match(migration, /byte_size > 0 AND byte_size <= 8388608/);
});

test("CMS validation rejects unsafe routes, markup and unsupported locale shapes", async () => {
  const validation = await loadValidation();

  assert.equal(validation.parseSlug("hero-home"), "hero-home");
  assert.equal(validation.parseSlug("Hero Home"), null);
  assert.equal(validation.parseSlug("../hero"), null);
  assert.equal(validation.parseContentType("project"), "project");
  assert.equal(validation.parseContentType("user"), null);

  assert.ok(validation.parseLocalizedMap({
    vi: { title: "Tiêu đề", body: [{ type: "cta", label: "Xem dự án", href: "/work" }] },
    en: { title: "Title", body: [{ type: "cta", label: "View", href: "https://logivn.com" }] },
  }));
  assert.equal(validation.parseLocalizedMap({ ko: { title: "제목" } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { title: "<script>alert(1)</script>" } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "cta", label: "Bad", href: "javascript:alert(1)" }] } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "cta", label: "Bad", href: "//evil.example" }] } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "cta", label: "Source", href: "https://github.com/example/private" }] } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "cta", label: "Source", href: "https://github.com./example/private" }] } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "cta", label: "Source", href: "https://gist.github.com/example/private" }] } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "paragraph", text: "Mã nguồn tại github.com/example/private" }] } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "list", items: ["Sản phẩm", "https://github.com/example/private"] }] } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { title: "github.com/example/private" } }), null);
  assert.equal(validation.parseLocalizedMap({ vi: { body: [{ type: "image", src: "https://images.example/hero.webp", alt: "Hero" }] } }), null);
  assert.ok(validation.parseLocalizedMap({ vi: { body: [{ type: "image", src: "https://media.tung.codes/cms/hero.webp", alt: "Hero" }] } }));
  assert.ok(validation.parseLocalizedMap({ vi: { body: [{ type: "image", src: "https://media.tungjpstore.net/cms/legacy.webp", alt: "Legacy" }] } }));
  assert.equal(validation.parseContentMeta({ liveUrl: "http://insecure.example" }), null);
  assert.equal(validation.parseContentMeta({ repoUrl: "https://github.com/example/private" }), null);
  assert.equal(validation.parseContentMeta({ liveUrl: "https://github.com/example/private" }), null);
  assert.equal(validation.parseContentMeta({ liveUrl: "https://www.github.com./example/private" }), null);
  assert.equal(validation.parseContentMeta({ liveUrl: "https://user:password@example.com/live" }), null);
  assert.equal(validation.parseContentMeta({ evidence: "Xem github.com/example/private" }), null);
  assert.equal(validation.parseContentMeta({ evidence: ["Website production", "github.com/example/private"] }), null);
  assert.equal(validation.parseContentMeta({ contactEmail: "not-an-email" }), null);
  assert.deepEqual(validation.parseContentMeta({ liveUrl: "https://fball.vn", featured: true }), {
    liveUrl: "https://fball.vn/",
    featured: true,
  });
  assert.deepEqual(validation.parseContentMeta({ contactEmail: "hello@tung.codes" }), {
    contactEmail: "hello@tung.codes",
  });
});

test("admin mutations require same-origin CSRF and bounded JSON", async () => {
  const security = await loadAdminSecurity();
  const session = security.createCsrfSession();
  assert.match(session.token, /^[a-f0-9]{64}$/);
  assert.match(session.cookie, /__Host-admin_csrf=/);
  assert.match(session.cookie, /Path=\//);
  assert.match(session.cookie, /Secure/);
  assert.match(session.cookie, /HttpOnly/);
  assert.match(session.cookie, /SameSite=Strict/);

  const valid = new Request("https://tung.codes/admin/api/settings", {
    method: "PUT",
    headers: {
      origin: "https://tung.codes",
      cookie: `__Host-admin_csrf=${session.token}`,
      "x-csrf-token": session.token,
      "sec-fetch-site": "same-origin",
    },
  });
  assert.equal(security.verifyMutationRequest(valid), null);

  const crossSite = new Request(valid, { headers: { ...Object.fromEntries(valid.headers), origin: "https://evil.example" } });
  assert.equal(security.verifyMutationRequest(crossSite)?.status, 403);
  const missingToken = new Request(valid, { headers: { origin: "https://tung.codes" } });
  assert.equal(security.verifyMutationRequest(missingToken)?.status, 403);

  const wrongType = await security.readJsonBody(new Request(valid.url, { method: "POST", body: "x=1" }));
  assert.equal(wrongType.status, 415);
  const tooLarge = await security.readJsonBody(new Request(valid.url, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "512001" },
    body: "{}",
  }));
  assert.equal(tooLarge.status, 413);
  const parsed = await security.readJsonBody(new Request(valid.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  }));
  assert.deepEqual(parsed, { ok: true });

  const response = security.adminJson({ ok: true });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("admin routes authenticate before data access and preserve publishing safeguards", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  const content = read("src/lib/admin/router/content-routes.ts");
  const media = read("src/lib/admin/router/media-routes.ts");
  const api = [entry, content, media].join("\n");
  const repository = read("src/lib/admin/repository.ts");
  const auth = read("src/lib/admin/auth.ts");
  const admin = read("src/pages/admin/index.astro");
  const adminPageShell = read("src/components/admin/AdminApp.tsx");
  const contentView = read("src/components/admin/views/ContentView.tsx");

  assert.ok(api.indexOf("verifyCloudflareAccess") < api.indexOf("requireDb("));
  assert.match(auth, /cf-access-jwt-assertion/i);
  assert.match(auth, /payload\.iss !== issuer/);
  assert.match(auth, /audienceMatches\(payload\.aud, expectedAudience\)/);
  assert.match(auth, /CF_ACCESS_ALLOWED_EMAILS/);
  assert.match(auth, /crypto\.subtle\.verify/);
  assert.match(entry, /method !== "GET" && method !== "HEAD"/);
  assert.match(entry, /verifyMutationRequest\(request\)/);
  assert.match(entry, /invalid_path/);
  assert.match(media, /MAX_MEDIA_BYTES = 8 \* 1024 \* 1024/);
  assert.match(content, /MAX_PUBLISH_ITEMS = 4/);
  assert.match(content, /rawItems\.length > MAX_PUBLISH_ITEMS/);
  assert.doesNotMatch(api, /image\/svg\+xml/);
  assert.match(media, /invalid_media_signature/);
  assert.match(media, /MEDIA_PUBLIC_BASE_URL/);
  assert.match(content, /publish_validation_failed/);

  assert.match(repository, /assertPublishable\(db, items\)/);
  assert.match(repository, /for \(const locale of ADMIN_LOCALES\)/);
  assert.match(repository, /seo_title_required/);
  assert.match(repository, /seo_description_required/);
  assert.match(repository, /UPDATE revisions SET status = 'archived' WHERE content_item_id = \? AND status = 'draft'/);
  assert.match(repository, /transaction_guards/);
  assert.match(repository, /auditStatement/);
  assert.match(repository, /duplicate_content_or_revision/);
  assert.match(repository, /slug_locked/);
  assert.match(content, /site_section_slug_locked/);

  assert.match(admin, /export const prerender = false/);
  assert.match(admin, /private, no-store/);
  assert.match(admin, /noindex, nofollow, noarchive/);
  assert.match(adminPageShell, /Cloudflare Access/);
  for (const action of ["publish", "unpublish", "delete", "restore"]) {
    assert.match(contentView, new RegExp(String.raw`mutate\("${action}"\)`));
  }
  const labelsModule = read("src/components/admin/lib/labels.ts");
  assert.match(labelsModule, /locales = \["vi", "en", "ja", "zh"\]/);
});

test("admin offers labeled metadata fields and a no-code body block editor", () => {
  const admin = read("src/components/admin/views/ContentView.tsx");
  const settingsView = read("src/components/admin/views/SettingsView.tsx");

  for (const field of ["metaLiveUrl", "metaStatus", "metaVariant", "metaResearch"]) {
    assert.match(admin, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(admin, /name="metaRepoUrl"/);
  const labelsModule2 = read("src/components/admin/lib/labels.ts");
  assert.match(labelsModule2, /blockTypes = \["paragraph", "heading", "quote", "list", "image", "cta", "metric"\]/);
  assert.match(admin, /blockTypes\.map/);
  assert.match(admin, /\+ Thêm block/);
  assert.match(admin, /Body JSON nâng cao/);
  assert.match(admin, /Metadata JSON/);
  assert.match(settingsView, /contactEmail/);
  assert.match(settingsView, /collectSettings|parsed = JSON\.parse\(config/);
  assert.match(admin, /lastMediaId/);
  assert.match(admin, /nextStatus !== previousStatus/);
  assert.match(admin, /keys\.some\(\(key\) => meta\[key\] !== sourceMeta\[key\]\)/);
  assert.match(read("src/components/admin/views/ContactsView.tsx"), /id="contacts-view"/);
  assert.match(admin, /guardUnsaved/);
  assert.match(read("src/components/admin/ui/primitives.tsx"), /busyLabel/);
  assert.match(read("src/components/admin/AdminApp.tsx"), /useConfirm/);
  assert.match(read("src/styles/admin.css"), /prefers-reduced-motion/);
  assert.match(read("src/styles/admin.css"), /@media \(max-width: 900px\)/);
});
