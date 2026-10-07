# Contact CRM Backend Contract

Vùng CRM dùng `CONTACT_DB` và nằm sau Cloudflare Access tại `/admin/api/contacts`. Mọi mutation dùng cùng CSRF cookie/header và Origin check với CMS hiện có. Response luôn `private, no-store`.

## Enums

- `status`: `new | reviewing | replied | closed | spam`
- `stage`: `inbox | qualified | contacted | proposal | won | lost`
- `priority`: `low | normal | high | urgent`
- `followUp` filter: `due | scheduled | none`

Tag được chuẩn hóa lowercase, tối đa 20 tag/contact; mỗi tag dài 1-40 ký tự và chỉ gồm `a-z`, `0-9`, `:`, `_`, `-`.

## List And Search

```http
GET /admin/api/contacts?limit=25&cursor=...&status=new&stage=qualified&priority=high&assignee=owner@example.com&tag=saas&followUp=due&locale=vi&from=2026-07-01&to=2026-07-31
```

- `limit`: 1-100, mặc định 25.
- `status`: mặc định `new`; gửi `status=all` để bỏ lọc trạng thái.
- `assignee=unassigned`: chỉ contact chưa gán người phụ trách.
- `locale`: `vi | en | ja | zh`.
- `from` và `to`: ngày ISO `YYYY-MM-DD` hoặc timestamp ISO; khoảng ngày được áp dụng trên `created_at`.
- Pagination là keyset theo `updatedAt DESC, id DESC`; client xem `pagination.hasMore` và gửi lại `pagination.nextCursor` nguyên trạng.
- List trả `messagePreview` tối đa 280 ký tự; nội dung đầy đủ chỉ nằm ở detail.

Tìm kiếm PII không dùng query string. Client gửi JSON qua endpoint riêng và vẫn phải kèm CSRF như mọi POST admin:

```http
POST /admin/api/contacts/search
Content-Type: application/json
X-CSRF-Token: <session token>
```

```json
{
  "q": "tung@example.com",
  "status": "new",
  "locale": "vi",
  "from": "2026-07-01",
  "to": "2026-07-31",
  "limit": 25,
  "cursor": null
}
```

`q` là bắt buộc, dài tối đa 100 ký tự và dùng prefix search không phân biệt hoa thường trên name, email, company và project website. Các ký tự `%`, `_`, `\` được escape. Endpoint từ chối field ngoài allowlist để contact PII không lọt vào URL hoặc log truy cập.

```json
{
  "ok": true,
  "items": [{
    "id": "uuid",
    "name": "Tung",
    "email": "tung@example.com",
    "company": "Tung Labs",
    "projectWebsite": "https://example.com",
    "messagePreview": "...",
    "locale": "vi",
    "status": "new",
    "stage": "inbox",
    "priority": "normal",
    "assignee": null,
    "followUpAt": null,
    "followUpNote": null,
    "tags": [],
    "createdAt": "2026-07-24T00:00:00.000Z",
    "updatedAt": "2026-07-24T00:00:00.000Z"
  }],
  "pagination": { "limit": 25, "hasMore": false, "nextCursor": null }
}
```

## Detail

```http
GET /admin/api/contacts/:id
```

Trả toàn bộ field list, `message`, `userAgent`, tối đa 100 note gần nhất và 100 activity gần nhất. `ip_hash` không được đưa ra API CRM.

## Update

```http
PATCH /admin/api/contacts/:id
Content-Type: application/json
X-CSRF-Token: <session token>
```

```json
{
  "expectedUpdatedAt": "2026-07-24T00:00:00.000Z",
  "status": "reviewing",
  "stage": "qualified",
  "priority": "high",
  "assignee": "owner@example.com",
  "followUpAt": "2026-07-25T03:00:00.000Z",
  "followUpNote": "Chuẩn bị câu hỏi discovery",
  "tags": ["saas", "f-and-b"]
}
```

Mọi field ngoài allowlist bị từ chối. Field không gửi sẽ giữ nguyên; gửi `null` hoặc chuỗi rỗng để xóa assignee/follow-up. `expectedUpdatedAt` là optimistic lock; stale editor nhận `409 contact_conflict`. Update thành công ghi activity `contact.updated` trong cùng D1 batch.

## Notes

```http
POST /admin/api/contacts/:id/notes
Content-Type: application/json
X-CSRF-Token: <session token>

{ "body": "Nội dung ghi chú, tối đa 8.000 ký tự." }
```

Response `201` trả `{ "ok": true, "note": ... }`. Note và activity `note.created` được ghi nguyên tử; không có hard-delete endpoint.

## Errors

- `400 invalid_contact_query`
- `404 contact_not_found`
- `409 contact_conflict`
- `415 invalid_content_type`
- `422 contact_validation_failed | contact_note_validation_failed`
- `503 contact_crm_not_configured | contact_crm_unavailable`

UI không cần và không được gửi Cloudflare credential. Access JWT, CSRF và actor email được backend hiện có xử lý. Contact PII không được ghi vào URL, analytics, client log, local storage hoặc public cache.
