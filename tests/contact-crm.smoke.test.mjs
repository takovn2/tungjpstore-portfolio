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

async function loadContactValidation() {
  const types = compile(read("src/lib/admin/contact-types.ts"));
  const validation = compile(read("src/lib/admin/contact-validation.ts")).replace(
    /import\s*\{[^}]+\}\s*from\s*["']\.\/contact-types["'];?/,
    "",
  );
  return importSource(`${types}\n${validation}`);
}

async function loadContactRepository() {
  const types = compile(read("src/lib/admin/contact-types.ts"));
  const dbUtils = compile(read("src/lib/admin/db-utils.ts")).replace(
    /import\s*\{[^}]+\}\s*from\s*["']\.\/http["'];?/,
    "",
  );
  const repository = compile(read("src/lib/admin/contact-repository.ts")).replace(
    /import\s*\{[^}]+\}\s*from\s*["']\.\/db-utils["'];?/,
    "",
  );
  return importSource(`${types}\n${dbUtils}\n${repository}`);
}

test("contact CRM migration is additive, indexed and keeps an immutable activity trail", () => {
  const migration = read("migrations/0004_contact_crm.sql");
  const searchIndexes = read("migrations/0005_contact_search_indexes.sql");
  for (const column of ["stage", "priority", "assignee", "follow_up_at", "follow_up_note", "updated_at"]) {
    assert.match(migration, new RegExp(`ALTER TABLE contact_submissions ADD COLUMN ${column}\\b`));
  }
  for (const table of ["contact_tags", "contact_notes", "contact_activities", "contact_crm_guards"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  for (const index of ["updated_at", "status_updated", "stage_updated", "priority_updated", "assignee_updated", "follow_up", "name_prefix", "email_prefix", "company_prefix", "project_website_prefix", "locale_updated"]) {
    assert.match(migration, new RegExp(`idx_contact_submissions_${index}`));
  }
  assert.match(migration, /REFERENCES contact_submissions\(id\) ON DELETE CASCADE/);
  assert.match(migration, /CHECK \(valid = 1\)/);
  assert.match(migration, /AFTER INSERT ON contact_submissions/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM contact_submissions/i);
  assert.match(searchIndexes, /idx_contact_submissions_project_website_prefix/);
  assert.match(searchIndexes, /idx_contact_submissions_locale_updated/);
  assert.doesNotMatch(searchIndexes, /DROP TABLE|DROP COLUMN|DELETE FROM contact_submissions/i);
});

test("contact CRM migration preserves legacy inserts and enforces referential integrity", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("migrations/0001_contact_submissions.sql"));
  sqlite.exec(read("migrations/0002_contact_limits_and_context.sql"));
  sqlite.exec(read("migrations/0003_contact_rate_limits.sql"));
  sqlite.exec(read("migrations/0004_contact_crm.sql"));
  sqlite.exec(read("migrations/0005_contact_search_indexes.sql"));

  sqlite.prepare(`INSERT INTO contact_submissions
    (id, name, email, message, locale, user_agent, ip_hash, created_at, status, company, project_website)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("legacy_1", "Tung", "tung@example.com", "Hello", "vi", "test", "hash", "2026-07-24T00:00:00.000Z", "new", "Tung Labs", "https://example.com");
  const row = sqlite.prepare("SELECT stage, priority, updated_at FROM contact_submissions WHERE id = ?").get("legacy_1");
  assert.equal(row.stage, "inbox");
  assert.equal(row.priority, "normal");
  assert.equal(row.updated_at, "2026-07-24T00:00:00.000Z");

  sqlite.prepare("INSERT INTO contact_tags (submission_id, tag, created_at) VALUES (?, ?, ?)")
    .run("legacy_1", "saas", "2026-07-24T00:00:00.000Z");
  assert.throws(() => sqlite.prepare("INSERT INTO contact_tags (submission_id, tag, created_at) VALUES (?, ?, ?)")
    .run("missing_1", "saas", "2026-07-24T00:00:00.000Z"));
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(sqlite.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  sqlite.close();
});

test("contact CRM validation bounds filters, cursors, tags and mutable fields", async () => {
  const validation = await loadContactValidation();
  const basic = validation.parseContactListInput(new URL("https://tung.codes/admin/api/contacts"));
  assert.equal(basic.limit, 25);
  assert.equal(basic.cursor, null);
  assert.equal(basic.status, "new");
  const cursor = btoa("2026-07-24T00:00:00.000Z\tcontact_123").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const filtered = validation.parseContactListInput(new URL(`https://tung.codes/admin/api/contacts?limit=50&cursor=${cursor}&status=reviewing&stage=qualified&priority=high&assignee=owner@example.com&tag=saas&followUp=due&locale=vi&from=2026-07-01&to=2026-07-31`));
  assert.equal(filtered.limit, 50);
  assert.equal(filtered.cursor.id, "contact_123");
  assert.equal(filtered.status, "reviewing");
  assert.equal(filtered.followUp, "due");
  assert.equal(filtered.locale, "vi");
  assert.equal(filtered.createdFrom, "2026-07-01T00:00:00.000Z");
  assert.equal(filtered.createdTo, "2026-07-31T23:59:59.999Z");
  assert.equal(validation.parseContactListInput(new URL(`https://example/admin/api/contacts?status=all`)).status, null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?q=Tung")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?search=Tung")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?status=new&status=all")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?limit=500")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?status=active")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?status=root")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?tag=Bad Tag")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?cursor=not-a-cursor")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?locale=fr")), null);
  assert.equal(validation.parseContactListInput(new URL("https://example/admin/api/contacts?createdFrom=2026-08-01&createdTo=2026-07-01")), null);

  const searched = validation.parseContactSearchInput({
    q: "tung@example.com",
    status: "new",
    locale: "vi",
    from: "2026-07-01",
    to: "2026-07-31",
    limit: 10,
  });
  assert.equal(searched.query, "tung@example.com");
  assert.equal(searched.status, "new");
  assert.equal(searched.createdFrom, "2026-07-01T00:00:00.000Z");
  assert.equal(validation.parseContactSearchInput({ q: "" }), null);
  assert.equal(validation.parseContactSearchInput({ q: "Tung", unknown: true }), null);
  assert.equal(validation.parseContactSearchInput({ q: "Tung", status: "active" }), null);

  assert.deepEqual(validation.parseContactUpdateInput({
    expectedUpdatedAt: "2026-07-24T00:00:00Z",
    status: "reviewing",
    stage: "qualified",
    priority: "urgent",
    assignee: "owner@example.com",
    followUpAt: "2026-07-25T03:00:00+09:00",
    tags: ["SaaS", "saas", "f-and-b"],
  }), {
    expectedUpdatedAt: "2026-07-24T00:00:00.000Z",
    status: "reviewing",
    stage: "qualified",
    priority: "urgent",
    assignee: "owner@example.com",
    followUpAt: "2026-07-24T18:00:00.000Z",
    tags: ["saas", "f-and-b"],
  });
  assert.equal(validation.parseContactUpdateInput({ expectedUpdatedAt: "2026-07-24", admin: true }), null);
  assert.equal(validation.parseContactUpdateInput({ expectedUpdatedAt: "2026-07-24", priority: "critical" }), null);
  assert.equal(validation.parseContactUpdateInput({ expectedUpdatedAt: "2026-07-24" }), null);
  assert.equal(validation.parseContactNoteInput({ body: "<script>alert(1)</script>" }), null);
  assert.equal(validation.parseContactNoteInput({ body: "Follow up after reviewing the product brief." }), "Follow up after reviewing the product brief.");
  assert.equal(validation.parseContactNoteInput({ body: "Line one\r\nLine two" }), "Line one\nLine two");
});

test("contact CRM repository uses prepared keyset queries and atomic audit batches", () => {
  const repository = read("src/lib/admin/contact-repository.ts");
  const types = read("src/lib/admin/contact-types.ts");
  assert.doesNotMatch(repository, /SELECT \*/);
  assert.match(repository, /substr\(cs\.message, 1, 280\) AS message_preview/);
  assert.match(types, /messagePreview: string/);
  assert.match(repository, /cs\.updated_at < \?/);
  assert.match(repository, /cs\.id < \?/);
  assert.match(repository, /LIMIT \?/);
  assert.match(repository, /filter_tag\.tag = \?/);
  assert.match(repository, /cs\.locale = \?/);
  assert.match(repository, /cs\.created_at >= \?/);
  assert.match(repository, /cs\.created_at <= \?/);
  assert.match(repository, /COLLATE NOCASE LIKE \? ESCAPE/);
  assert.match(repository, /COALESCE\(cs\.project_website, ''\) COLLATE NOCASE LIKE/);
  assert.match(repository, /contact_crm_guards/);
  assert.match(repository, /contact_activities/);
  assert.match(repository, /contact\.updated/);
  assert.match(repository, /note\.created/);
  assert.match(repository, /db\.batch\(statements\)/);
});

test("contact CRM repository covers list, detail, optimistic update and note flows", async () => {
  const repository = await loadContactRepository();
  const row = {
    id: "contact_123",
    name: "Tung",
    email: "tung@example.com",
    company: "Tung Labs",
    project_website: "https://tung.codes",
    message: "A detailed request from the contact form.",
    message_preview: "A detailed request from the contact form.",
    locale: "vi",
    user_agent: "Mozilla/5.0",
    status: "new",
    stage: "inbox",
    priority: "normal",
    assignee: null,
    follow_up_at: null,
    follow_up_note: null,
    tags_csv: "saas,vi",
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
  };
  const batches = [];
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (this.sql.startsWith("SELECT id FROM contact_submissions")) return { id: row.id };
          if (this.sql.includes("FROM contact_submissions cs")) return row;
          return null;
        },
        async all() {
          if (this.sql.includes("FROM contact_notes")) return { results: [{ id: "note_1", body: "Call next week", author: "owner@example.com", created_at: row.updated_at, updated_at: row.updated_at }] };
          if (this.sql.includes("FROM contact_activities")) return { results: [{ id: "activity_1", actor: "owner@example.com", action: "contact.updated", details_json: '{"fields":["stage"]}', created_at: row.updated_at }] };
          return { results: [row, { ...row, id: "contact_122", updated_at: "2026-07-23T00:00:00.000Z" }] };
        },
      };
      return statement;
    },
    async batch(statements) { batches.push(statements); return statements.map(() => ({ success: true, meta: { changes: 1 }, results: [] })); },
  };

  const listed = await repository.listContacts(db, {
    limit: 1, cursor: null, query: "Tung", status: "new", stage: null,
    priority: null, assignee: null, tag: "saas", followUp: null,
    locale: null, createdFrom: null, createdTo: null,
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].messagePreview, row.message_preview);
  assert.equal(listed.pagination.hasMore, true);
  assert.ok(listed.pagination.nextCursor);

  const detail = await repository.getContact(db, row.id);
  assert.equal(detail.message, row.message);
  assert.deepEqual(detail.tags, ["saas", "vi"]);
  assert.equal(detail.notes[0].body, "Call next week");
  assert.equal(detail.activities[0].action, "contact.updated");

  const updated = await repository.updateContact(db, row.id, {
    expectedUpdatedAt: row.updated_at,
    stage: "qualified",
    tags: ["saas", "qualified"],
  }, "owner@example.com", "request_123");
  assert.equal(updated.message, row.message);
  assert.ok(batches.at(-1).some((statement) => statement.sql.includes("contact.updated")));

  const note = await repository.addContactNote(db, row.id, "Call next week", "owner@example.com", "request_124");
  assert.equal(note.body, "Call next week");
  assert.ok(batches.at(-1).some((statement) => statement.sql.includes("note.created")));
});

test("admin contact handlers reuse Access, CSRF and the separate CONTACT_DB binding", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  const contacts = read("src/lib/admin/router/contact-routes.ts");
  const api = [entry, contacts].join("\n");
  const types = read("src/lib/admin/types.ts");
  const contract = read("CONTACT_CRM.md");
  assert.match(types, /CONTACT_DB\?: D1Database/);
  assert.match(entry, /segments\[0\] === "contacts"/);
  assert.match(contacts, /parseContactListInput/);
  assert.match(contacts, /parseContactSearchInput/);
  assert.match(contacts, /segments\[1\] === "search"/);
  assert.match(contacts, /method === "PATCH"/);
  assert.match(contacts, /segments\[2\] === "notes"/);
  assert.match(contacts, /readJsonBody\(request, 64_000\)/);
  assert.match(contacts, /readJsonBody\(request, 16_000\)/);
  assert.match(contacts, /contact_crm_not_configured/);
  assert.match(contacts, /contact_conflict/);
  assert.ok(entry.indexOf('if (segments[0] === "contacts")') > entry.indexOf("verifyCloudflareAccess"));
  assert.ok(entry.indexOf("verifyCloudflareAccess") < entry.indexOf('if (segments[0] === "contacts")'));
  assert.ok(entry.indexOf("verifyMutationRequest(request)") < contacts.indexOf('method === "PATCH"'));
  for (const endpoint of [
    "GET /admin/api/contacts?",
    "POST /admin/api/contacts/search",
    "GET /admin/api/contacts/:id",
    "PATCH /admin/api/contacts/:id",
    "POST /admin/api/contacts/:id/notes",
  ]) assert.match(contract, new RegExp(endpoint.replace(/[?]/g, "\\?")));
  for (const value of ["new", "reviewing", "replied", "closed", "spam", "inbox", "qualified", "contacted", "proposal", "won", "lost"]) {
    assert.match(contract, new RegExp(`\\b${value}\\b`));
  }
});
