import {
  CONTACT_FOLLOW_UP_FILTERS,
  CONTACT_PRIORITIES,
  CONTACT_STAGES,
  CONTACT_STATUSES,
  type ContactFollowUpFilter,
  type ContactLocale,
  type ContactListInput,
  type ContactPriority,
  type ContactStage,
  type ContactStatus,
  type ContactUpdateInput,
} from "./contact-types";

const statusSet = new Set<string>(CONTACT_STATUSES);
const stageSet = new Set<string>(CONTACT_STAGES);
const prioritySet = new Set<string>(CONTACT_PRIORITIES);
const followUpSet = new Set<string>(CONTACT_FOLLOW_UP_FILTERS);
const localeSet = new Set(["vi", "en", "ja", "zh"]);
const TAG_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,39}$/;
const CONTACT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,100}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const cleanText = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const cleanMultiline = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    ? value.replaceAll("\r\n", "\n").trim()
    : null;

const parseDate = (value: unknown) => {
  const text = cleanText(value, 40);
  if (!text || !ISO_TIMESTAMP_PATTERN.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};

const parseDateFilter = (value: unknown, endOfDay = false) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    const parsed = new Date(`${value}${suffix}`);
    return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? undefined : parsed.toISOString();
  }
  return parseDate(value) ?? undefined;
};

export function parseContactId(value: unknown) {
  return typeof value === "string" && CONTACT_ID_PATTERN.test(value) ? value : null;
}

export function parseContactTag(value: unknown) {
  const tag = cleanText(value, 40)?.toLowerCase() ?? null;
  return tag && TAG_PATTERN.test(tag) ? tag : null;
}

function parseCursor(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value || value.length > 400 || !/^[a-zA-Z0-9_-]+$/.test(value)) return undefined;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = atob(padded);
    const separator = decoded.indexOf("\t");
    if (separator <= 0) return undefined;
    const updatedAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    return parseDate(updatedAt) === updatedAt && parseContactId(id) ? { updatedAt, id } : undefined;
  } catch {
    return undefined;
  }
}

function parseLimit(value: unknown) {
  if (value === undefined || value === null) return 25;
  const limit = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
}

function parseStatus(value: unknown, defaultValue: ContactStatus | null = "new") {
  if (value === undefined) return defaultValue;
  if (value === "all") return null;
  return typeof value === "string" && statusSet.has(value) ? value as ContactStatus : undefined;
}

function parseEnum<T extends string>(value: unknown, values: Set<string>) {
  if (value === undefined || value === null) return null as T | null;
  return typeof value === "string" && values.has(value) ? value as T : undefined;
}

function parseFilterValues(values: Record<string, unknown>, allowQuery: boolean): ContactListInput | null {
  const limit = parseLimit(values.limit);
  if (limit === null) return null;
  const cursor = parseCursor(values.cursor);
  if (cursor === undefined) return null;

  const query = allowQuery ? cleanText(values.q, 100) : null;
  if (allowQuery ? !query : Object.prototype.hasOwnProperty.call(values, "q")) return null;
  const status = parseStatus(values.status);
  const stage = parseEnum<ContactStage>(values.stage, stageSet);
  const priority = parseEnum<ContactPriority>(values.priority, prioritySet);
  const followUp = parseEnum<ContactFollowUpFilter>(values.followUp, followUpSet);
  const locale = parseEnum<ContactLocale>(values.locale, localeSet);
  if (status === undefined || stage === undefined || priority === undefined || followUp === undefined || locale === undefined) return null;

  const createdFrom = parseDateFilter(values.from);
  const createdTo = parseDateFilter(values.to, true);
  if (createdFrom === undefined || createdTo === undefined || (createdFrom && createdTo && createdFrom > createdTo)) return null;

  const assignee = values.assignee === undefined ? null : cleanText(values.assignee, 180);
  if (values.assignee !== undefined && !assignee) return null;
  const tag = values.tag === undefined ? null : parseContactTag(values.tag);
  if (values.tag !== undefined && !tag) return null;

  return {
    limit,
    cursor,
    query,
    status,
    stage,
    priority,
    assignee,
    tag,
    followUp,
    locale,
    createdFrom,
    createdTo,
  };
}

export function parseContactListInput(url: URL): ContactListInput | null {
  const params = url.searchParams;
  const allowed = new Set(["limit", "cursor", "status", "stage", "priority", "assignee", "tag", "followUp", "locale", "from", "to"]);
  for (const key of new Set(params.keys())) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return null;
  }
  const values: Record<string, unknown> = {};
  for (const key of allowed) {
    if (params.has(key)) values[key] = params.get(key);
  }
  return parseFilterValues(values, false);
}

export function parseContactSearchInput(value: unknown): ContactListInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowed = new Set(["q", "limit", "cursor", "status", "stage", "priority", "assignee", "tag", "followUp", "locale", "from", "to"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  if (typeof input.q !== "string") return null;
  return parseFilterValues(input, true);
}

export function parseContactUpdateInput(value: unknown): ContactUpdateInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowed = new Set(["expectedUpdatedAt", "status", "stage", "priority", "assignee", "followUpAt", "followUpNote", "tags"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  const expectedUpdatedAt = parseDate(input.expectedUpdatedAt);
  if (!expectedUpdatedAt) return null;

  const result: ContactUpdateInput = { expectedUpdatedAt };
  let mutations = 0;
  if ("status" in input) {
    if (typeof input.status !== "string" || !statusSet.has(input.status)) return null;
    result.status = input.status as ContactStatus;
    mutations += 1;
  }
  if ("stage" in input) {
    if (typeof input.stage !== "string" || !stageSet.has(input.stage)) return null;
    result.stage = input.stage as ContactStage;
    mutations += 1;
  }
  if ("priority" in input) {
    if (typeof input.priority !== "string" || !prioritySet.has(input.priority)) return null;
    result.priority = input.priority as ContactPriority;
    mutations += 1;
  }
  if ("assignee" in input) {
    if (input.assignee === null || input.assignee === "") result.assignee = null;
    else {
      const assignee = cleanText(input.assignee, 180);
      if (!assignee) return null;
      result.assignee = assignee;
    }
    mutations += 1;
  }
  if ("followUpAt" in input) {
    if (input.followUpAt === null || input.followUpAt === "") result.followUpAt = null;
    else {
      const followUpAt = parseDate(input.followUpAt);
      if (!followUpAt) return null;
      result.followUpAt = followUpAt;
    }
    mutations += 1;
  }
  if ("followUpNote" in input) {
    if (input.followUpNote === null || input.followUpNote === "") result.followUpNote = null;
    else {
      const followUpNote = cleanMultiline(input.followUpNote, 2_000);
      if (!followUpNote) return null;
      result.followUpNote = followUpNote;
    }
    mutations += 1;
  }
  if ("tags" in input) {
    if (!Array.isArray(input.tags) || input.tags.length > 20) return null;
    const tags = input.tags.map(parseContactTag);
    if (tags.some((tag) => tag === null)) return null;
    result.tags = [...new Set(tags as string[])];
    mutations += 1;
  }
  return mutations > 0 ? result : null;
}

export function parseContactNoteInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "body")) return null;
  const body = cleanMultiline(input.body, 8_000);
  return body || null;
}
