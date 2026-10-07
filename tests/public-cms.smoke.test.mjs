import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadContentStore() {
  return importSource(compile(read("src/lib/content-store.ts")));
}

async function loadPublicContent() {
  return importSource(compile(read("src/lib/public-content.ts")));
}

let adminModuleRun = 0;
async function loadAdminApi(overrides = {}) {
  const json = (body, status = 200, extraHeaders) => {
    const headers = new Headers(extraHeaders);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "private, no-store, max-age=0");
    return new Response(JSON.stringify(body), { status, headers });
  };
  const stubs = {
    env: {},
    verifyCloudflareAccess: async () => ({ ok: true, user: { email: "owner@example.com" } }),
    createCsrfSession: () => ({ token: "csrf", cookie: "admin_csrf=csrf" }),
    verifyMutationRequest: () => null,
    getAdminSession: async () => ({ id: "test-admin-session" }),
    clearAdminSessionCookie: () => "admin_session=; Max-Age=0",
    adminSecurityError: (result) => json({ ok: false, code: result?.code || "security_error" }, 401),
    securityStatus: async () => ({ configured: true, authenticated: true }),
    setupAdminPassword: async () => ({ ok: true, passwordSetAt: "2026-07-24T00:00:00.000Z" }),
    createAdminLoginChallenge: async () => ({ ok: true, challenge: { challengeId: "challenge", nonce: "nonce", action: "login", expiresAt: "2026-07-24T00:02:00.000Z" } }),
    loginAdminPassword: async () => ({ ok: true, session: { cookie: "admin_session=test", expiresAt: "2026-07-25T00:00:00.000Z" } }),
    logoutAdminSession: async () => {},
    revokeAdminSessions: async () => {},
    changeAdminPassword: async () => ({ ok: true, passwordSetAt: "2026-07-24T00:00:00.000Z" }),
    adminError: (code, status = 400, details) => json({ ok: false, code, ...(details ?? {}) }, status),
    adminJson: json,
    isResponse: (value) => value instanceof Response,
    readJsonBody: async (request) => request.json(),
    addContactNote: async () => null,
    ContactNotFoundError: class ContactNotFoundError extends Error {},
    getContact: async () => null,
    isContactConflict: () => false,
    listContacts: async () => ({ items: [], pagination: {} }),
    updateContact: async () => null,
    parseContactId: () => null,
    parseContactListInput: () => null,
    parseContactNoteInput: () => null,
    parseContactSearchInput: () => null,
    parseContactUpdateInput: () => null,
    createContent: async () => null,
    getContent: async () => null,
    getRevision: async () => null,
    getSiteState: async () => ({}),
    isOptimisticConflict: () => false,
    listContent: async () => [],
    listMedia: async () => ({ items: [], pagination: { limit: 24, hasMore: false, nextCursor: null } }),
    listRevisions: async () => [],
    getDashboardStats: async () => ({ content: {}, media: {} }),
    restoreRevisionAsDraft: async () => null,
    publishContentBatch: async () => [],
    isPublishValidationError: () => false,
    restoreContent: async () => null,
    saveDraft: async () => null,
    saveSiteState: async () => ({}),
    softDeleteContent: async () => null,
    unpublishContent: async () => null,
    PROTECTED_SITE_SECTION_SLUGS: new Set(["home-hero", "contact-profile"]),
    ADMIN_LOCALES: ["vi", "en", "ja", "zh"],
    parseContentMeta: (value) => value,
    parseContentType: (value) => ["site_section", "project", "post"].includes(value) ? value : null,
    parseExpectedVersion: (value) => Number.isInteger(value) && value >= 1 ? value : null,
    parseLocalizedMap: (value) => value,
    parseMediaId: (value) => value ?? null,
    parseMediaCursor: () => null,
    parseSlug: (value) => value,
    parseSortOrder: (value) => value,
    syncAllTelegramBotsMenus: async () => {},
    ...overrides,
  };
  const names = Object.keys(stubs);
  globalThis.__adminApiTestStubs = stubs;
  const routerSources = [
    "src/lib/admin/router/context.ts",
    "src/lib/admin/router/security-routes.ts",
    "src/lib/admin/router/media-routes.ts",
    "src/lib/admin/router/contact-routes.ts",
    "src/lib/admin/router/content-routes.ts",
    "src/lib/admin/router/shop/shared.ts",
    "src/lib/admin/router/shop/catalog.ts",
    "src/lib/admin/router/shop/ops.ts",
    "src/lib/admin/router/shop/payments.ts",
    "src/lib/admin/router/shop/integrations.ts",
    "src/lib/admin/router/shop-routes.ts",
    "src/pages/admin/api/[...path].ts",
  ].map((path) => compile(read(path)).replace(/^import\s+.*;\s*$/gm, ""));
  const unique = ++adminModuleRun;
  return importSource(`const { ${names.join(", ")} } = globalThis.__adminApiTestStubs;\n${routerSources.join("\n")}\n// test-module-${unique}`);
}

let sitemapModuleRun = 0;
async function loadSitemapApi(overrides = {}) {
  const stubs = {
    defaultLocale: "vi",
    locales: ["vi", "en", "ja", "zh"],
    localizePath: (path, locale) => locale === "vi" ? path : `/${locale}${path === "/" ? "" : path}`,
    loadPublicSnapshot: async () => ({
      managedSlugs: { site_section: [], project: [], post: [] },
      projects: [],
      posts: [],
    }),
    publishedProjects: (snapshot) => snapshot.projects,
    publishedPosts: (snapshot) => snapshot.posts,
    setPublicCache: (headers, state = "ok") => {
      headers.set("cache-control", state === "unavailable" ? "no-store, max-age=0" : state === "not-found" ? "public, max-age=0, must-revalidate" : "public, max-age=0, s-maxage=60, must-revalidate");
      headers.set("cloudflare-cdn-cache-control", state === "unavailable" ? "no-store, max-age=0" : state === "not-found" ? "public, max-age=30, must-revalidate" : "public, max-age=60, must-revalidate");
    },
    ...overrides,
  };
  globalThis.__sitemapTestStubs = stubs;
  const source = compile(read("src/pages/sitemap.xml.ts"))
    .replace(/^import\s+.*;\s*$/gm, "");
  const unique = ++sitemapModuleRun;
  return importSource(`const { ${Object.keys(stubs).join(", ")} } = globalThis.__sitemapTestStubs;\n${source}\n// sitemap-test-${unique}`);
}

test("public content reads bind the exact locale and exclude drafts and soft-deleted items", async () => {
  const { getPublishedContent } = await loadContentStore();
  const calls = [];
  const row = {
    id: "project-1",
    type: "project",
    slug: "logivn",
    item_status: "published",
    deleted_at: null,
    sort_order: 0,
    version: 4,
    meta_json: JSON.stringify({ featured: true }),
    localized_json: JSON.stringify({ title: "English title" }),
    cover_media_id: "media-1",
    cover_object_key: "cms/cover.webp",
    cover_alt: "LogiVN cover",
    published_at: "2026-07-23T10:00:00.000Z",
  };
  const db = {
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return { first: async () => row };
        },
      };
    },
  };

  const result = await getPublishedContent(db, {
    type: "project",
    slug: "logivn",
    locale: "en",
    mediaPublicBaseUrl: "https://media.tung.codes/",
  });

  assert.deepEqual(calls[0].bindings, ["en", "project", "logivn"]);
  assert.match(calls[0].sql, /r\.id\s*=\s*ci\.current_published_revision_id/);
  assert.match(calls[0].sql, /r\.status\s*=\s*'published'/);
  assert.match(calls[0].sql, /l\.locale\s*=\s*\?/);
  assert.match(calls[0].sql, /ci\.deleted_at\s+IS\s+NULL/i);
  assert.match(calls[0].sql, /COALESCE\(r\.slug,\s*ci\.slug\)/i);
  assert.doesNotMatch(calls[0].sql, /l\.locale\s+IN\s*\(|locale\s*=\s*'vi'/i);
  assert.equal(result.locale, "en");
  assert.equal(result.content.title, "English title");
  assert.equal(result.coverUrl, "https://media.tung.codes/cms/cover.webp");
});

test("public content returns null for absent bindings, missing locale rows and invalid JSON", async () => {
  const { getPublishedContent } = await loadContentStore();
  assert.equal(await getPublishedContent(undefined, { type: "project", slug: "logivn", locale: "ja" }), null);

  const missingLocaleDb = {
    prepare: () => ({ bind: () => ({ first: async () => null }) }),
  };
  assert.equal(await getPublishedContent(missingLocaleDb, { type: "project", slug: "logivn", locale: "ja" }), null);

  const invalidJsonDb = {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          id: "project-1",
          type: "project",
          slug: "logivn",
          item_status: "published",
          deleted_at: null,
          sort_order: 0,
          version: 1,
          meta_json: "{}",
          localized_json: "{invalid",
          cover_media_id: null,
          cover_object_key: null,
          cover_alt: null,
          published_at: null,
        }),
      }),
    }),
  };
  assert.equal(await getPublishedContent(invalidJsonDb, { type: "project", slug: "logivn", locale: "zh" }), null);

  const invalidShapeDb = {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          id: "project-1",
          type: "project",
          slug: "logivn",
          item_status: "published",
          deleted_at: null,
          sort_order: 0,
          version: 1,
          meta_json: "{}",
          localized_json: JSON.stringify({ title: "Valid JSON", body: [null] }),
          cover_media_id: null,
          cover_object_key: null,
          cover_alt: null,
          published_at: null,
        }),
      }),
    }),
  };
  assert.equal(await getPublishedContent(invalidShapeDb, { type: "project", slug: "logivn", locale: "en" }), null);
});

test("published reader does not leak newer drafts, deleted records or Vietnamese fallback", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { getPublishedContent } = await loadContentStore();
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
  const d1 = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) {
          bindings = values;
          return prepared;
        },
        async first() {
          return statement.get(...bindings) ?? null;
        },
        async all() {
          return { results: statement.all(...bindings) };
        },
      };
      return prepared;
    },
  };
  const insertItem = sqlite.prepare(`INSERT INTO content_items
    (id, type, slug, status, sort_order, cover_media_id, meta_json, version,
      current_published_revision_id, created_at, updated_at, deleted_at)
    VALUES (?, 'project', ?, ?, 0, ?, '{}', ?, ?, ?, ?, ?)`);
  const insertRevision = sqlite.prepare(`INSERT INTO revisions
    (id, content_item_id, version, status, data_json, created_by, created_at, published_at)
    VALUES (?, ?, ?, ?, '{}', 'owner@example.com', ?, ?)`);
  const insertLocale = sqlite.prepare(
    "INSERT INTO localizations (revision_id, locale, data_json) VALUES (?, ?, ?)",
  );
  const now = "2026-07-23T10:00:00.000Z";

  sqlite.prepare(`INSERT INTO media
    (id, object_key, filename, mime_type, byte_size, alt, status, created_by, created_at)
    VALUES ('media-1', 'cms/logivn.webp', 'logivn.webp', 'image/webp', 16, 'LogiVN', 'active', 'owner@example.com', ?)`)
    .run(now);
  insertItem.run("project-1", "logivn", "published", "media-1", 2, "revision-published", now, now, null);
  insertRevision.run("revision-published", "project-1", 1, "published", now, now);
  insertRevision.run("revision-draft", "project-1", 2, "draft", now, null);
  insertLocale.run("revision-published", "vi", JSON.stringify({ title: "Ban tieng Viet da xuat ban" }));
  insertLocale.run("revision-published", "en", JSON.stringify({ title: "Published English" }));
  insertLocale.run("revision-draft", "en", JSON.stringify({ title: "SECRET NEW DRAFT" }));

  insertItem.run("project-2", "deleted-project", "archived", null, 1, "revision-deleted", now, now, now);
  insertRevision.run("revision-deleted", "project-2", 1, "published", now, now);
  insertLocale.run("revision-deleted", "en", JSON.stringify({ title: "Deleted content" }));

  insertItem.run("project-3", "draft-only", "draft", null, 1, null, now, now, null);
  insertRevision.run("revision-only-draft", "project-3", 1, "draft", now, null);
  insertLocale.run("revision-only-draft", "en", JSON.stringify({ title: "Draft only" }));

  try {
    const english = await getPublishedContent(d1, {
      type: "project",
      slug: "logivn",
      locale: "en",
      mediaPublicBaseUrl: "https://media.tung.codes",
    });
    assert.equal(english?.content.title, "Published English");
    assert.notEqual(english?.content.title, "SECRET NEW DRAFT");
    assert.equal(english?.coverUrl, "https://media.tung.codes/cms/logivn.webp");
    assert.equal(await getPublishedContent(d1, { type: "project", slug: "logivn", locale: "ja" }), null);
    assert.equal(await getPublishedContent(d1, { type: "project", slug: "deleted-project", locale: "en" }), null);
    assert.equal(await getPublishedContent(d1, { type: "project", slug: "draft-only", locale: "en" }), null);
  } finally {
    sqlite.close();
  }
});

test("public snapshot distinguishes unavailable, empty and ready without resurrecting managed fallback", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { getPublicContentSnapshot } = await loadContentStore();
  const unavailable = await getPublicContentSnapshot(undefined, { locale: "en" });
  assert.deepEqual(unavailable, {
    status: "unavailable",
    locale: "en",
    items: [],
    managedSlugs: { site_section: [], project: [], post: [] },
    siteState: null,
  });

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
  const calls = [];
  const d1 = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const call = { sql, bindings: [] };
      calls.push(call);
      let bindings = [];
      const prepared = {
        bind(...values) {
          bindings = values;
          call.bindings = values;
          return prepared;
        },
        async first() {
          return statement.get(...bindings) ?? null;
        },
        async all() {
          return { results: statement.all(...bindings) };
        },
      };
      return prepared;
    },
  };

  const empty = await getPublicContentSnapshot(d1, { locale: "en" });
  assert.equal(empty.status, "empty");
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.managedSlugs, { site_section: [], project: [], post: [] });
  assert.deepEqual(empty.siteState?.config, {});

  const insertItem = sqlite.prepare(`INSERT INTO content_items
    (id, type, slug, status, sort_order, cover_media_id, meta_json, version,
      current_published_revision_id, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?)`);
  const insertRevision = sqlite.prepare(`INSERT INTO revisions
    (id, content_item_id, version, status, data_json, created_by, created_at, published_at)
    VALUES (?, ?, 1, ?, ?, 'owner@example.com', ?, ?)`);
  const insertLocale = sqlite.prepare(
    "INSERT INTO localizations (revision_id, locale, data_json) VALUES (?, ?, ?)",
  );
  const now = "2026-07-23T11:00:00.000Z";

  insertItem.run("project-live", "project", "logivn", "published", 1, 1, "revision-live", now, now, null);
  insertRevision.run("revision-live", "project-live", "published", JSON.stringify({ featured: true }), now, now);
  insertLocale.run("revision-live", "vi", JSON.stringify({ title: "LogiVN VI" }));
  insertLocale.run("revision-live", "en", JSON.stringify({ title: "LogiVN EN" }));

  insertItem.run("project-untranslated", "project", "fball", "published", 2, 1, "revision-untranslated", now, now, null);
  insertRevision.run("revision-untranslated", "project-untranslated", "published", "{}", now, now);
  insertLocale.run("revision-untranslated", "vi", JSON.stringify({ title: "Fball VI only" }));

  insertItem.run("project-draft", "project", "draft-project", "draft", 3, 1, null, now, now, null);
  insertRevision.run("revision-draft-snapshot", "project-draft", "draft", "{}", now, null);
  insertLocale.run("revision-draft-snapshot", "en", JSON.stringify({ title: "Draft leak" }));

  insertItem.run("post-deleted", "post", "deleted-post", "archived", 1, 2, "revision-deleted-snapshot", now, now, now);
  insertRevision.run("revision-deleted-snapshot", "post-deleted", "published", "{}", now, now);
  insertLocale.run("revision-deleted-snapshot", "en", JSON.stringify({ title: "Deleted leak" }));

  sqlite.prepare("UPDATE site_state SET config_json = ?, version = 3, updated_at = ? WHERE id = 'default'")
    .run(JSON.stringify({ contactEmail: "hello@tung.codes" }), now);

  try {
    calls.length = 0;
    const ready = await getPublicContentSnapshot(d1, {
      locale: "en",
      mediaPublicBaseUrl: "https://media.tung.codes",
    });
    assert.equal(ready.status, "ready");
    assert.deepEqual(ready.items.map((item) => [item.type, item.slug, item.content.title]), [
      ["project", "logivn", "LogiVN EN"],
    ]);
    assert.deepEqual(ready.managedSlugs.project, ["draft-project", "fball", "logivn"]);
    assert.deepEqual(ready.managedSlugs.post, ["deleted-post"]);
    assert.equal(ready.siteState?.version, 3);
    assert.equal(ready.siteState?.config.contactEmail, "hello@tung.codes");

    const contentQuery = calls.find((call) => /FROM content_items ci/.test(call.sql));
    assert.ok(contentQuery);
    assert.deepEqual(contentQuery.bindings, ["en"]);
    assert.match(contentQuery.sql, /l\.locale\s*=\s*\?/);
    assert.match(contentQuery.sql, /COALESCE\(r\.slug,\s*ci\.slug\)/i);
    assert.doesNotMatch(contentQuery.sql, /locale\s*=\s*'vi'/i);
  } finally {
    sqlite.close();
  }
});

test("managed slugs suppress bundled fallback and public cache stays short-lived", async () => {
  const { canUseBundledFallback, isManaged, setPublicCache } = await loadPublicContent();
  const base = {
    locale: "en",
    items: [],
    siteState: null,
    managedSlugs: { site_section: [], project: [], post: [] },
  };
  assert.equal(isManaged({ ...base, status: "unavailable" }, "project", "fball"), false);
  assert.equal(isManaged({
    ...base,
    status: "ready",
    managedSlugs: { site_section: [], project: ["fball"], post: [] },
  }, "project", "fball"), true);
  assert.equal(canUseBundledFallback({ ...base, status: "unavailable" }, "project"), false);
  assert.equal(canUseBundledFallback({ ...base, status: "empty" }, "project"), true);
  assert.equal(canUseBundledFallback({
    ...base,
    status: "ready",
    managedSlugs: { site_section: ["home-hero"], project: ["fball"], post: [] },
  }, "project", "logivn"), false);
  assert.equal(canUseBundledFallback({
    ...base,
    status: "ready",
    managedSlugs: { site_section: ["home-hero"], project: [], post: [] },
  }, "site_section", "contact-profile"), true);

  const headers = new Headers();
  setPublicCache(headers);
  assert.equal(headers.get("cache-control"), "public, max-age=0, s-maxage=60, must-revalidate");
  assert.equal(headers.get("cloudflare-cdn-cache-control"), "public, max-age=60, must-revalidate");
  const unavailableHeaders = new Headers();
  setPublicCache(unavailableHeaders, "unavailable");
  assert.equal(unavailableHeaders.get("cache-control"), "no-store, max-age=0");
});

test("dynamic sitemap uses each locale's published projects and posts only", async () => {
  const loadedLocales = [];
  const snapshots = {
    vi: {
      status: "ready",
      items: [],
      managedSlugs: { site_section: [], project: ["logivn"], post: [] },
      projects: [{ slug: "logivn" }],
      posts: [],
    },
    en: {
      status: "ready",
      items: [{ type: "site_section", slug: "home-hero" }],
      managedSlugs: { site_section: ["home-hero", "contact-profile"], project: ["logivn", "fball"], post: ["published-note", "draft-note"] },
      projects: [{ slug: "logivn" }],
      posts: [{ slug: "published-note" }],
    },
    ja: {
      status: "empty",
      items: [],
      managedSlugs: { site_section: [], project: [], post: [] },
      projects: [],
      posts: [],
    },
    zh: {
      status: "ready",
      items: [],
      managedSlugs: { site_section: [], project: ["fball", "deleted-project"], post: [] },
      projects: [{ slug: "fball" }],
      posts: [],
    },
  };
  const sitemap = await loadSitemapApi({
    loadPublicSnapshot: async (locale) => {
      loadedLocales.push(locale);
      return snapshots[locale];
    },
  });

  const response = await sitemap.GET({ site: new URL("https://tung.codes") });
  const xml = await response.text();

  assert.deepEqual(loadedLocales, ["vi", "en", "ja", "zh"]);
  assert.match(xml, /https:\/\/tung.codes\/work\/logivn/);
  assert.match(xml, /https:\/\/tung.codes\/en\/work\/logivn/);
  assert.doesNotMatch(xml, /\/en\/work\/fball/);
  assert.match(xml, /https:\/\/tung.codes\/en\/lab\/published-note/);
  assert.match(xml, /<loc>https:\/\/tung.codes\/en<\/loc>/);
  assert.doesNotMatch(xml, /https:\/\/tung.codes\/en\/contact/);
  assert.doesNotMatch(xml, /draft-note/);
  assert.match(xml, /https:\/\/tung.codes\/ja\/work\/fball/);
  assert.match(xml, /https:\/\/tung.codes\/zh\/work\/fball/);
  assert.doesNotMatch(xml, /deleted-project/);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, s-maxage=60, must-revalidate");
});

test("sitemap emits an hreflang cluster so Google can map locales to each other", async () => {
  const sitemap = await loadSitemapApi({
    loadPublicSnapshot: async (locale) => ({
      status: "ready",
      items: [],
      managedSlugs: { site_section: [], project: ["logivn"], post: [] },
      projects: locale === "zh" ? [] : [{ slug: "logivn" }],
      posts: [],
    }),
  });

  const response = await sitemap.GET({ site: new URL("https://tung.codes") });
  const xml = await response.text();

  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);

  const urlFor = (href) => {
    const match = xml.match(new RegExp(`<url><loc>${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>[\\s\\S]*?</url>`));
    assert.ok(match, `no <url> emitted for ${href}`);
    return match[0];
  };

  // A path published in all four locales carries all four alternates, self-referencing.
  const cluster = urlFor("https://tung.codes/en/about");
  for (const tag of ["vi", "en", "ja", "zh-Hans"]) {
    assert.match(cluster, new RegExp(`hreflang="${tag}"`), `missing hreflang=${tag}`);
  }
  assert.match(cluster, /hreflang="x-default" href="https:\/\/tung\.codes\/en\/about"/);

  // zh uses zh-Hans in hreflang, never a bare "zh".
  assert.doesNotMatch(cluster, /hreflang="zh"/);

  // A path missing from one locale must not advertise that locale as an alternate,
  // and x-default must fall back to a locale that actually exists.
  const partial = urlFor("https://tung.codes/work/logivn");
  assert.match(partial, /hreflang="vi"/);
  assert.match(partial, /hreflang="ja"/);
  assert.doesNotMatch(partial, /hreflang="zh-Hans"/, "zh has no logivn, so no alternate may point there");
  assert.match(partial, /hreflang="x-default" href="https:\/\/tung\.codes\/en\/work\/logivn"/);
});

test("sitemap returns a non-cacheable 503 instead of inventing CMS routes while D1 is unavailable", async () => {
  const sitemap = await loadSitemapApi({
    loadPublicSnapshot: async (locale) => ({
      status: "unavailable",
      locale,
      items: [],
      managedSlugs: { site_section: [], project: [], post: [] },
      projects: [],
      posts: [],
      siteState: null,
    }),
  });

  const response = await sitemap.GET({ site: new URL("https://tung.codes") });
  const xml = await response.text();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.match(xml, /https:\/\/tung.codes\/about/);
  assert.match(xml, /https:\/\/tung.codes\/en\/privacy/);
  assert.doesNotMatch(xml, /\/work|\/lab|\/contact/);
});

test("malformed encoded admin paths return 400 before database access", async () => {
  let databaseRead = false;
  const env = {};
  Object.defineProperty(env, "CONTENT_DB", {
    get() {
      databaseRead = true;
      throw new Error("database must not be read for an invalid path");
    },
  });
  const api = await loadAdminApi({ env });
  const response = await api.ALL({
    request: new Request("https://tung.codes/admin/api/%E0%A4%A"),
    params: { path: "%E0%A4%A" },
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "invalid_path");
  assert.equal(databaseRead, false);
});

test("security setup exceptions are correlated without logging credentials", async () => {
  const api = await loadAdminApi({
    setupAdminPassword: async () => {
      throw new Error("D1 exploded PASSWORD_DO_NOT_LOG SECRET_DO_NOT_LOG");
    },
  });
  const logs = [];
  const previousError = console.error;
  console.error = (value) => logs.push(String(value));
  try {
    const response = await api.ALL({
      request: new Request("https://tung.codes/admin/api/security/setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://tung.codes",
          "x-csrf-token": "test-csrf",
          cookie: "__Host-admin_csrf=test-csrf",
        },
        body: JSON.stringify({ password: "BODY_DO_NOT_LOG" }),
      }),
      params: { path: "security/setup" },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "security_unavailable");
    const requestId = response.headers.get("x-request-id");
    assert.match(requestId ?? "", /^[0-9a-f-]{36}$/i);
    assert.equal(logs.length, 1);
    const event = JSON.parse(logs[0]);
    assert.deepEqual(event, {
      event: "admin_security_failed",
      requestId,
      action: "setup",
      stage: "setup",
      errorName: "Error",
    });
    assert.doesNotMatch(logs[0], /PASSWORD_DO_NOT_LOG|SECRET_DO_NOT_LOG|BODY_DO_NOT_LOG/);
  } finally {
    console.error = previousError;
  }
});

test("admin publish and restore actions preserve explicit versions and repository wiring", async () => {
  const calls = [];
  const api = await loadAdminApi({
    env: { CONTENT_DB: {} },
    getContent: async (_db, id) => ({ id, type: "project", draftRevisionId: "revision-7" }),
    publishContentBatch: async (_db, items, actor, requestId) => {
      calls.push({ action: "publish", items, actor, requestId });
      return [{ id: items[0].id, version: items[0].expectedVersion + 1, status: "published" }];
    },
    restoreContent: async (_db, id, expectedVersion, actor, requestId) => {
      calls.push({ action: "restore", id, expectedVersion, actor, requestId });
      return { id, version: expectedVersion + 1, status: "draft" };
    },
  });

  const publish = await api.ALL({
    request: new Request("https://tung.codes/admin/api/content/project/project-1/publish", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "request_publish_1" },
      body: JSON.stringify({ expectedVersion: 7, revisionId: "revision-7" }),
    }),
    params: { path: "content/project/project-1/publish" },
  });
  assert.equal(publish.status, 200);
  assert.match(calls[0].requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(publish.headers.get("x-request-id"), calls[0].requestId);
  assert.deepEqual({ ...calls[0], requestId: "server-generated" }, {
    action: "publish",
    items: [{ id: "project-1", revisionId: "revision-7", expectedVersion: 7 }],
    actor: "owner@example.com",
    requestId: "server-generated",
  });

  const restore = await api.ALL({
    request: new Request("https://tung.codes/admin/api/content/project/project-1/restore", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "request_restore_1" },
      body: JSON.stringify({ expectedVersion: 8 }),
    }),
    params: { path: "content/project/project-1/restore" },
  });
  assert.equal(restore.status, 200);
  assert.match(calls[1].requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(restore.headers.get("x-request-id"), calls[1].requestId);
  assert.deepEqual({ ...calls[1], requestId: "server-generated" }, {
    action: "restore",
    id: "project-1",
    expectedVersion: 8,
    actor: "owner@example.com",
    requestId: "server-generated",
  });
});

test("admin media upload returns the immutable public R2 URL", async () => {
  const bucketWrites = [];
  const batches = [];
  const db = {
    prepare(sql) {
      return { bind: (...bindings) => ({ sql, bindings }) };
    },
    async batch(statements) {
      batches.push(statements);
    },
  };
  const api = await loadAdminApi({
    env: {
      CONTENT_DB: db,
      MEDIA_PUBLIC_BASE_URL: "https://media.tung.codes/",
      MEDIA: {
        async put(key, bytes, options) {
          bucketWrites.push({ key, bytes: [...bytes], options });
        },
        async delete() {},
      },
    },
  });
  const form = new FormData();
  form.set("file", new File([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  ], "cover.png", { type: "image/png" }));
  form.set("alt", "LogiVN dashboard");

  const response = await api.ALL({
    request: new Request("https://tung.codes/admin/api/media", { method: "POST", body: form }),
    params: { path: "media" },
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(bucketWrites.length, 1);
  assert.equal(batches.length, 1);
  assert.equal(body.media.publicUrl, `https://media.tung.codes/${body.media.objectKey}`);
  assert.match(body.media.objectKey, /^cms\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.png$/);
  assert.equal(body.media.adminPreviewUrl, `/admin/api/media/${body.media.id}`);
  assert.equal(bucketWrites[0].options.httpMetadata.cacheControl, "public, max-age=31536000, immutable");
});

test("admin editor exposes publish validation issues and the media public URL", () => {
  const contentView = read("src/components/admin/views/ContentView.tsx");
  const apiClient = read("src/components/admin/api/client.ts");
  const labels = read("src/components/admin/lib/labels.ts");
  const coverPicker = read("src/components/admin/ui/CoverPicker.tsx");

  assert.match(apiClient, /issues/);
  assert.match(contentView, /publish_validation_failed/);
  for (const issue of [
    "missing_locale",
    "title_required",
    "excerpt_required",
    "body_required",
    "seo_title_required",
    "seo_description_required",
  ]) {
    assert.match(labels, new RegExp(`${issue}\\s*:`));
  }
  assert.match(coverPicker, /data\.media\?\.publicUrl/);
});
