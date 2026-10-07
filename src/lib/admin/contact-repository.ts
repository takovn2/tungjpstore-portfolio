import type {
  ContactActivity,
  ContactDetail,
  ContactListInput,
  ContactListItem,
  ContactNote,
  ContactUpdateInput,
} from "./contact-types";
import { encodeOpaqueCursor, escapeLike, isGuardConflict, safeJsonParse } from "./db-utils";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  project_website: string | null;
  message?: string;
  message_preview?: string;
  locale: string;
  user_agent?: string | null;
  status: string;
  stage: string;
  priority: string;
  assignee: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  tags_csv: string | null;
  created_at: string;
  updated_at: string;
};

type NoteRow = {
  id: string;
  body: string;
  author: string;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  actor: string;
  action: string;
  details_json: string;
  created_at: string;
};

const baseColumns = `
  cs.id, cs.name, cs.email, cs.company, cs.project_website, cs.locale,
  cs.status, cs.stage, cs.priority, cs.assignee, cs.follow_up_at, cs.follow_up_note,
  cs.created_at, cs.updated_at,
  (SELECT group_concat(ordered_tags.tag, ',') FROM (
    SELECT ct.tag FROM contact_tags ct WHERE ct.submission_id = cs.id ORDER BY ct.tag
  ) ordered_tags) AS tags_csv`;

const parseDetails = (value: string): Record<string, unknown> => safeJsonParse(value, {});

const fromRow = (row: ContactRow): ContactListItem => ({
  id: row.id,
  name: row.name,
  email: row.email,
  company: row.company,
  projectWebsite: row.project_website,
  messagePreview: row.message_preview ?? row.message?.slice(0, 280) ?? "",
  locale: row.locale,
  status: row.status,
  stage: row.stage,
  priority: row.priority,
  assignee: row.assignee,
  followUpAt: row.follow_up_at,
  followUpNote: row.follow_up_note,
  tags: row.tags_csv ? row.tags_csv.split(",").filter(Boolean) : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const encodeCursor = (item: ContactListItem) => encodeOpaqueCursor(item.updatedAt, item.id);

export class ContactNotFoundError extends Error {
  constructor() {
    super("Contact not found");
    this.name = "ContactNotFoundError";
  }
}

export function isContactConflict(error: unknown) {
  return isGuardConflict(error, "contact_crm_guards");
}

async function assertContactExists(db: D1Database, id: string) {
  const row = await db.prepare("SELECT id FROM contact_submissions WHERE id = ? LIMIT 1")
    .bind(id).first<{ id: string }>();
  if (!row) throw new ContactNotFoundError();
}

export async function listContacts(db: D1Database, input: ContactListInput) {
  const clauses = ["1 = 1"];
  const bindings: unknown[] = [];
  if (input.status) {
    clauses.push("cs.status = ?");
    bindings.push(input.status);
  }
  if (input.stage) {
    clauses.push("cs.stage = ?");
    bindings.push(input.stage);
  }
  if (input.priority) {
    clauses.push("cs.priority = ?");
    bindings.push(input.priority);
  }
  if (input.assignee === "unassigned") clauses.push("cs.assignee IS NULL");
  else if (input.assignee) {
    clauses.push("cs.assignee = ?");
    bindings.push(input.assignee);
  }
  if (input.tag) {
    clauses.push("EXISTS (SELECT 1 FROM contact_tags filter_tag WHERE filter_tag.submission_id = cs.id AND filter_tag.tag = ?)");
    bindings.push(input.tag);
  }
  if (input.locale) {
    clauses.push("cs.locale = ?");
    bindings.push(input.locale);
  }
  if (input.createdFrom) {
    clauses.push("cs.created_at >= ?");
    bindings.push(input.createdFrom);
  }
  if (input.createdTo) {
    clauses.push("cs.created_at <= ?");
    bindings.push(input.createdTo);
  }
  if (input.query) {
    const prefix = `${escapeLike(input.query)}%`;
    clauses.push(`(
      cs.name COLLATE NOCASE LIKE ? ESCAPE '\\' OR
      cs.email COLLATE NOCASE LIKE ? ESCAPE '\\' OR
      COALESCE(cs.company, '') COLLATE NOCASE LIKE ? ESCAPE '\\' OR
      COALESCE(cs.project_website, '') COLLATE NOCASE LIKE ? ESCAPE '\\'
    )`);
    bindings.push(prefix, prefix, prefix, prefix);
  }
  const now = new Date().toISOString();
  if (input.followUp === "due") {
    clauses.push("cs.follow_up_at IS NOT NULL AND cs.follow_up_at <= ?");
    bindings.push(now);
  } else if (input.followUp === "scheduled") {
    clauses.push("cs.follow_up_at IS NOT NULL AND cs.follow_up_at > ?");
    bindings.push(now);
  } else if (input.followUp === "none") clauses.push("cs.follow_up_at IS NULL");
  if (input.cursor) {
    clauses.push(`(
      cs.updated_at < ? OR
      (cs.updated_at = ? AND cs.id < ?)
    )`);
    bindings.push(input.cursor.updatedAt, input.cursor.updatedAt, input.cursor.id);
  }

  const result = await db.prepare(`SELECT ${baseColumns}, substr(cs.message, 1, 280) AS message_preview
    FROM contact_submissions cs
    WHERE ${clauses.join(" AND ")}
    ORDER BY cs.updated_at DESC, cs.id DESC
    LIMIT ?`)
    .bind(...bindings, input.limit + 1).all<ContactRow>();
  const hasMore = result.results.length > input.limit;
  const items = result.results.slice(0, input.limit).map(fromRow);
  return {
    items,
    pagination: {
      limit: input.limit,
      hasMore,
      nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null,
    },
  };
}

export async function getContact(db: D1Database, id: string): Promise<ContactDetail | null> {
  const row = await db.prepare(`SELECT ${baseColumns}, cs.message, cs.user_agent
    FROM contact_submissions cs WHERE cs.id = ? LIMIT 1`)
    .bind(id).first<ContactRow>();
  if (!row) return null;
  const [notesResult, activitiesResult] = await Promise.all([
    db.prepare(`SELECT id, body, author, created_at, updated_at
      FROM contact_notes
      WHERE submission_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 100`)
      .bind(id).all<NoteRow>(),
    db.prepare(`SELECT id, actor, action, details_json, created_at
      FROM contact_activities
      WHERE submission_id = ?
      ORDER BY created_at DESC LIMIT 100`)
      .bind(id).all<ActivityRow>(),
  ]);
  const notes: ContactNote[] = notesResult.results.map((note) => ({
    id: note.id,
    body: note.body,
    author: note.author,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  }));
  const activities: ContactActivity[] = activitiesResult.results.map((activity) => ({
    id: activity.id,
    actor: activity.actor,
    action: activity.action,
    details: parseDetails(activity.details_json),
    createdAt: activity.created_at,
  }));
  return { ...fromRow(row), message: row.message ?? "", userAgent: row.user_agent ?? null, notes, activities };
}

export async function updateContact(
  db: D1Database,
  id: string,
  input: ContactUpdateInput,
  actor: string,
  requestId: string,
) {
  await assertContactExists(db, id);
  const assignments: string[] = [];
  const values: unknown[] = [];
  const changed: string[] = [];
  const add = (column: string, key: string, value: unknown) => {
    assignments.push(`${column} = ?`);
    values.push(value);
    changed.push(key);
  };
  if (input.status !== undefined) add("status", "status", input.status);
  if (input.stage !== undefined) add("stage", "stage", input.stage);
  if (input.priority !== undefined) add("priority", "priority", input.priority);
  if (input.assignee !== undefined) add("assignee", "assignee", input.assignee);
  if (input.followUpAt !== undefined) add("follow_up_at", "followUpAt", input.followUpAt);
  if (input.followUpNote !== undefined) add("follow_up_note", "followUpNote", input.followUpNote);
  if (input.tags !== undefined) changed.push("tags");
  const now = new Date().toISOString();
  assignments.push("updated_at = ?");
  values.push(now);
  const guard = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO contact_crm_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM contact_submissions
        WHERE id = ? AND updated_at = ?
      ) THEN 1 ELSE 0 END`)
      .bind(guard, id, input.expectedUpdatedAt),
    db.prepare(`UPDATE contact_submissions SET ${assignments.join(", ")}
      WHERE id = ? AND updated_at = ?`)
      .bind(...values, id, input.expectedUpdatedAt),
  ];
  if (input.tags !== undefined) {
    statements.push(db.prepare("DELETE FROM contact_tags WHERE submission_id = ?").bind(id));
    for (const tag of input.tags) {
      statements.push(db.prepare(`INSERT INTO contact_tags (submission_id, tag, created_at)
        VALUES (?, ?, ?)`)
        .bind(id, tag, now));
    }
  }
  statements.push(
    db.prepare(`INSERT INTO contact_activities
      (id, submission_id, actor, action, details_json, created_at)
      VALUES (?, ?, ?, 'contact.updated', ?, ?)`)
      .bind(crypto.randomUUID(), id, actor, JSON.stringify({ requestId, fields: changed }), now),
    db.prepare("DELETE FROM contact_crm_guards WHERE token = ?").bind(guard),
  );
  await db.batch(statements);
  return getContact(db, id);
}

export async function addContactNote(
  db: D1Database,
  submissionId: string,
  body: string,
  actor: string,
  requestId: string,
) {
  const noteId = crypto.randomUUID();
  const activityId = crypto.randomUUID();
  const guard = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      // The guard predicate is bare existence, so a failed CHECK here means
      // the submission vanished between read and write — no pre-read needed.
      db.prepare(`INSERT INTO contact_crm_guards (token, valid)
        SELECT ?, CASE WHEN EXISTS (
          SELECT 1 FROM contact_submissions WHERE id = ?
        ) THEN 1 ELSE 0 END`)
        .bind(guard, submissionId),
      db.prepare(`INSERT INTO contact_notes
        (id, submission_id, body, author, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(noteId, submissionId, body, actor, now, now),
      db.prepare(`INSERT INTO contact_activities
        (id, submission_id, actor, action, details_json, created_at)
        VALUES (?, ?, ?, 'note.created', ?, ?)`)
        .bind(activityId, submissionId, actor, JSON.stringify({ requestId, noteId }), now),
      db.prepare(`UPDATE contact_submissions SET updated_at = ? WHERE id = ?`)
        .bind(now, submissionId),
      db.prepare("DELETE FROM contact_crm_guards WHERE token = ?").bind(guard),
    ]);
  } catch (error) {
    if (isContactConflict(error)) throw new ContactNotFoundError();
    throw error;
  }
  return {
    id: noteId,
    body,
    author: actor,
    createdAt: now,
    updatedAt: now,
  } satisfies ContactNote;
}
