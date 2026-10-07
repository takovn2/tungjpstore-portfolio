import { adminError, adminJson, isResponse, readJsonBody } from "../http";
import { createContent, getDashboardStats, getContent, getRevision, getSiteState, isOptimisticConflict, isPublishValidationError, listContent, listRevisions, publishContentBatch, restoreContent, restoreRevisionAsDraft, saveDraft, saveSiteState, softDeleteContent, unpublishContent, PROTECTED_SITE_SECTION_SLUGS } from "../repository";
import { parseContentMeta, parseContentType, parseExpectedVersion, parseLocalizedMap, parseMediaId, parseSlug, parseSortOrder } from "../validation";
import { ADMIN_LOCALES, type LocalizedMap } from "../types";
import { syncAllTelegramBotsMenus } from "../../../lib/shop/telegram-bot-config";
import type { AdminRouteContext } from "./context";
import { parseActionVersion, requireDb } from "./context";

// Keep bulk publish bounded even on the Paid plan; set-based writes and a
// dedicated query-budget regression are required before raising this cap.
const MAX_PUBLISH_ITEMS = 4;

function completeLocales(value: LocalizedMap): LocalizedMap {
  return Object.fromEntries(ADMIN_LOCALES.map((locale) => [locale, value[locale] ?? {}])) as LocalizedMap;
}

function parseContentInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const slug = parseSlug(input.slug);
  const sortOrder = parseSortOrder(input.sortOrder);
  const coverMediaId = parseMediaId(input.coverMediaId);
  const meta = parseContentMeta(input.meta);
  const localizations = parseLocalizedMap(input.localizations);
  if (!slug || sortOrder === null || meta === null || localizations === null) return null;
  return { slug, sortOrder, coverMediaId, meta, localizations: completeLocales(localizations) };
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : fallback;
}

export async function handleContentRoutes(ctx: AdminRouteContext): Promise<Response> {
  const { request, segments, method, bindings, user, requestId } = ctx;
  const db = requireDb(bindings);
  if (!db) return adminError("content_not_configured", 503);
  try {
    if (segments[0] === "dashboard" && method === "GET" && segments.length === 1) {
      // CMS stats and the optional CRM counter live in separate databases;
      // fetch both in parallel instead of paying two sequential round trips.
      const [dashboard, newContacts] = await Promise.all([
        getDashboardStats(db),
        bindings.CONTACT_DB
          ? bindings.CONTACT_DB.prepare("SELECT COUNT(*) AS count FROM contact_submissions WHERE status = 'new'")
            .first<{ count: number }>()
            .then((row) => row?.count ?? 0)
            .catch(() => {
              // A missing optional CRM migration must not make CMS overview unavailable.
              return 0;
            })
          : Promise.resolve(0),
      ]);
      return adminJson({
        ok: true,
        dashboard,
        counts: {
          published: dashboard.content.published,
          drafts: dashboard.content.draft,
          newContacts,
        },
        health: {
          access: true,
          contentDb: true,
          contactDb: Boolean(bindings.CONTACT_DB),
          media: Boolean(bindings.MEDIA),
        },
      });
    }
    if (segments[0] === "content") {
      if (method === "GET" && segments.length === 1) {
        const url = new URL(request.url);
        const requestedType = url.searchParams.get("type");
        const type = requestedType ? parseContentType(requestedType) : null;
        const deletedParam = url.searchParams.get("deleted") ?? "active";
        const deleted = deletedParam === "deleted" || deletedParam === "all" ? deletedParam : "active";
        if (requestedType && !type) return adminError("invalid_content_type", 400);
        const limit = parsePositiveInt(url.searchParams.get("limit"), 50);
        const items = await listContent(db, type, deleted, { limit });
        return adminJson({ ok: true, items });
      }
      const contentType = parseContentType(segments[1]);
      if (!contentType) return adminError("invalid_content_type", 400);
      if (method === "POST" && segments.length === 2) {
        const payload = await readJsonBody(request);
        if (isResponse(payload)) return payload;
        const input = parseContentInput(payload);
        if (!input) return adminError("validation_failed", 422);
        const created = await createContent(db, { type: contentType, ...input }, user.email, requestId);
        return adminJson({ ok: true, item: created }, 201);
      }
      const itemId = segments[2];
      if (!itemId) return adminError("content_not_found", 404);
      const item = await getContent(db, itemId);
      if (!item || item.type !== contentType) return adminError("content_not_found", 404);
      if (method === "GET" && segments.length === 3) return adminJson({ ok: true, item });
      if (method === "PUT" && segments.length === 3) {
        const payload = await readJsonBody(request);
        if (isResponse(payload)) return payload;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return adminError("validation_failed", 422);
        const body = payload as Record<string, unknown>;
        const expectedVersion = parseExpectedVersion(body.expectedVersion);
        const input = parseContentInput(body);
        if (!input || expectedVersion === null) return adminError("validation_failed", 422);
        if (item.type === "site_section" && PROTECTED_SITE_SECTION_SLUGS.has(item.slug) && input.slug !== item.slug) {
          return adminError("site_section_slug_locked", 409);
        }
        const updated = await saveDraft(db, { id: item.id, expectedVersion, ...input }, user.email, requestId);
        return adminJson({ ok: true, item: updated });
      }
      const action = segments[3];
      if (method === "POST" && ["publish", "unpublish", "delete", "restore"].includes(action ?? "")) {
        const payload = await readJsonBody(request);
        if (isResponse(payload)) return payload;
        const expectedVersion = parseActionVersion(payload);
        if (expectedVersion === null) return adminError("validation_failed", 422);
        let updated: Awaited<ReturnType<typeof getContent>>;
        if (action === "publish") {
          const revisionId = payload && typeof payload === "object" && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).revisionId === "string"
            ? (payload as Record<string, unknown>).revisionId as string : item.draftRevisionId;
          if (!revisionId) return adminError("draft_not_found", 409);
          [updated] = await publishContentBatch(db, [{ id: item.id, revisionId, expectedVersion }], user.email, requestId);
        } else if (action === "unpublish") updated = await unpublishContent(db, item.id, expectedVersion, user.email, requestId);
        else if (action === "delete") updated = await softDeleteContent(db, item.id, expectedVersion, user.email, requestId);
        else updated = await restoreContent(db, item.id, expectedVersion, user.email, requestId);
        return adminJson({ ok: true, item: updated });
      }
      if (method === "GET" && action === "revisions") return adminJson({ ok: true, revisions: await listRevisions(db, item.id) });
      if (method === "GET" && action === "revision" && segments.length === 5) {
        const revision = await getRevision(db, item.id, segments[4]);
        return revision ? adminJson({ ok: true, revision }) : adminError("revision_not_found", 404);
      }
      if (method === "POST" && action === "revision" && segments.length === 6 && segments[5] === "restore") {
        const payload = await readJsonBody(request);
        if (isResponse(payload)) return payload;
        const expectedVersion = parseActionVersion(payload);
        if (expectedVersion === null) return adminError("validation_failed", 422);
        const revisionId = segments[4];
        if (!(await getRevision(db, item.id, revisionId))) return adminError("revision_not_found", 404);
        const restored = await restoreRevisionAsDraft(db, {
          id: item.id,
          revisionId,
          expectedVersion,
        }, user.email, requestId);
        return adminJson({ ok: true, item: restored });
      }
      return adminError("method_not_allowed", 405);
    }

    if (segments[0] === "publish" && method === "POST") {
      const payload = await readJsonBody(request);
      if (isResponse(payload) || !payload || typeof payload !== "object" || Array.isArray(payload)) return isResponse(payload) ? payload : adminError("validation_failed", 422);
      const rawItems = (payload as Record<string, unknown>).items;
      if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_PUBLISH_ITEMS) return adminError("validation_failed", 422);
      const items = rawItems.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const entry = raw as Record<string, unknown>;
        return typeof entry.id === "string" && typeof entry.revisionId === "string" && parseExpectedVersion(entry.expectedVersion) !== null
          ? { id: entry.id, revisionId: entry.revisionId, expectedVersion: entry.expectedVersion as number } : null;
      });
      if (items.some((entry) => entry === null)) return adminError("validation_failed", 422);
      const published = await publishContentBatch(db, items as Array<{ id: string; revisionId: string; expectedVersion: number }>, user.email, requestId);
      return adminJson({ ok: true, items: published });
    }

    if (segments[0] === "settings") {
      if (method === "GET" && segments.length === 1) return adminJson({ ok: true, settings: await getSiteState(db) });
      if (method === "PUT" && segments.length === 1) {
        const payload = await readJsonBody(request);
        if (isResponse(payload) || !payload || typeof payload !== "object" || Array.isArray(payload)) return isResponse(payload) ? payload : adminError("validation_failed", 422);
        const body = payload as Record<string, unknown>;
        const expectedVersion = parseExpectedVersion(body.expectedVersion);
        const config = parseContentMeta(body.config);
        if (!config || expectedVersion === null) return adminError("validation_failed", 422);
        const saved = await saveSiteState(db, config, expectedVersion, user.email, requestId);
        syncAllTelegramBotsMenus(bindings as never).catch((err) => console.warn("Failed syncAllTelegramBotsMenus:", err));
        return adminJson({ ok: true, settings: saved });
      }
    }
    return adminError("not_found", 404);
  } catch (error) {
    if (isPublishValidationError(error)) return adminError("publish_validation_failed", 422, { issues: error.issues });
    if (isOptimisticConflict(error)) return adminError("conflict", 409);
    console.error(JSON.stringify({ event: "admin_api_failed", requestId, message: error instanceof Error ? error.message : "unknown" }));
    return adminError("service_unavailable", 503);
  }
}
