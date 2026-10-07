import { adminError, adminJson, isResponse, readJsonBody } from "../http";
import { addContactNote, ContactNotFoundError, getContact, isContactConflict, listContacts, updateContact } from "../contact-repository";
import { parseContactId, parseContactListInput, parseContactNoteInput, parseContactSearchInput, parseContactUpdateInput } from "../contact-validation";
import type { AdminRouteContext } from "./context";

export async function handleContactRoutes(ctx: AdminRouteContext): Promise<Response> {
  const { request, segments, method, bindings, user, requestId } = ctx;
  const contactDb = bindings.CONTACT_DB;
  if (!contactDb) return adminError("contact_crm_not_configured", 503);
  try {
    if (method === "GET" && segments.length === 1) {
      const input = parseContactListInput(new URL(request.url));
      if (!input) return adminError("invalid_contact_query", 400);
      const result = await listContacts(contactDb, input);
      return adminJson({ ok: true, ...result });
    }
    if (segments.length === 2 && segments[1] === "search" && method !== "POST") {
      return adminError("method_not_allowed", 405);
    }
    if (method === "POST" && segments.length === 2 && segments[1] === "search") {
      const payload = await readJsonBody(request, 16_000);
      if (isResponse(payload)) return payload;
      const input = parseContactSearchInput(payload);
      if (!input) return adminError("invalid_contact_query", 400);
      const result = await listContacts(contactDb, input);
      return adminJson({ ok: true, ...result });
    }
    const contactId = parseContactId(segments[1]);
    if (!contactId) return adminError("contact_not_found", 404);
    if (method === "GET" && segments.length === 2) {
      const contact = await getContact(contactDb, contactId);
      return contact ? adminJson({ ok: true, contact }) : adminError("contact_not_found", 404);
    }
    if (method === "PATCH" && segments.length === 2) {
      const payload = await readJsonBody(request, 64_000);
      if (isResponse(payload)) return payload;
      const input = parseContactUpdateInput(payload);
      if (!input) return adminError("contact_validation_failed", 422);
      const contact = await updateContact(contactDb, contactId, input, user.email, requestId);
      return adminJson({ ok: true, contact });
    }
    if (method === "POST" && segments.length === 3 && segments[2] === "notes") {
      const payload = await readJsonBody(request, 16_000);
      if (isResponse(payload)) return payload;
      const body = parseContactNoteInput(payload);
      if (!body) return adminError("contact_note_validation_failed", 422);
      const note = await addContactNote(contactDb, contactId, body, user.email, requestId);
      return adminJson({ ok: true, note }, 201);
    }
    return adminError("method_not_allowed", 405);
  } catch (error) {
    if (error instanceof ContactNotFoundError) return adminError("contact_not_found", 404);
    if (isContactConflict(error)) return adminError("contact_conflict", 409);
    console.error(JSON.stringify({ event: "contact_crm_api_failed", requestId, message: error instanceof Error ? error.message : "unknown" }));
    return adminError("contact_crm_unavailable", 503);
  }
}
