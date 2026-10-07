import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAdmin } from "../AdminApp";
import { Button } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { formatDate, toLocalDateTime } from "../lib/format";
import { localeLabel, priorityLabel, stageLabel, statusLabel } from "../lib/labels";

type ContactListItem = {
  id: string; name: string; email: string; company: string | null; projectWebsite: string | null;
  messagePreview: string; locale: string; status: string; stage: string; priority: string;
  assignee: string | null; followUpAt: string | null; followUpNote: string | null; tags: string[];
  createdAt: string; updatedAt: string;
};

type ContactDetail = ContactListItem & {
  message: string; userAgent: string | null;
  notes: Array<{ id: string; body: string; author: string; createdAt: string }>;
  activities: Array<{ id: string; actor: string; action: string; createdAt: string }>;
};

const EMPTY_FILTERS = { status: "new", stage: "", priority: "", assignee: "", tag: "", followUp: "", locale: "", from: "", to: "" };

function ContactDetailPane({ contact, onSaved }: { contact: ContactDetail; onSaved: (contact: ContactDetail) => void }) {
  const { markDirty } = useAdmin();
  const status = useStatus();
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({
    status: contact.status, stage: contact.stage, priority: contact.priority,
    assignee: contact.assignee || "", followUpAt: toLocalDateTime(contact.followUpAt), followUpNote: contact.followUpNote || "", tags: (contact.tags || []).join(", "),
  });
  const [note, setNote] = useState("");

  const replySubject = encodeURIComponent(`Re: ${contact.company || contact.name}`);

  const save = async () => {
    setBusy("save");
    try {
      const payload = {
        expectedUpdatedAt: contact.updatedAt,
        status: form.status, stage: form.stage, priority: form.priority,
        assignee: form.assignee.trim() || null,
        followUpAt: form.followUpAt ? new Date(form.followUpAt).toISOString() : null,
        followUpNote: form.followUpNote.trim() || null,
        tags: form.tags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      };
      const data = await api<{ contact: ContactDetail }>(`contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      markDirty("contact", false);
      onSaved(data.contact);
      status("Đã cập nhật liên hệ và ghi vào lịch sử hoạt động.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không lưu được liên hệ.", true);
    } finally {
      setBusy("");
    }
  };

  const addNote = async () => {
    setBusy("note");
    try {
      await api(`contacts/${contact.id}/notes`, { method: "POST", body: JSON.stringify({ body: note.trim() }) });
      setNote("");
      const data = await api<{ contact: ContactDetail }>(`contacts/${contact.id}`);
      onSaved(data.contact);
      status("Đã thêm ghi chú nội bộ.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không thêm được ghi chú.", true);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="contact-detail">
      <div className="contact-identity">
        <div>
          <h2 id="contact-detail-title">{contact.name}</h2>
          <p>{contact.email}</p>
          <p>
            {contact.company || "Không có tên công ty"}
            {contact.projectWebsite ? <> · <a href={contact.projectWebsite} target="_blank" rel="noreferrer">Website ↗</a></> : null}
          </p>
        </div>
        <a className="button primary" href={`mailto:${encodeURIComponent(contact.email)}?subject=${replySubject}`}>Trả lời email ↗</a>
      </div>
      <div className="contact-message">{contact.message}</div>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        void save();
      }} onChange={() => markDirty("contact")}>
        <div className="grid3">
          <label><strong>Trạng thái</strong>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {Object.entries({ new: "Mới", reviewing: "Đang xem xét", replied: "Đã trả lời", closed: "Đã đóng", spam: "Spam" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><strong>Giai đoạn</strong>
            <select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>
              <option value="">—</option>
              {Object.entries(stageLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><strong>Ưu tiên</strong>
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              <option value="">—</option>
              {Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label><strong>Người phụ trách</strong><input value={form.assignee} onChange={(event) => setForm({ ...form, assignee: event.target.value })} placeholder="owner@example.com" /></label>
          <label><strong>Thời điểm follow-up</strong><input type="datetime-local" value={form.followUpAt} onChange={(event) => setForm({ ...form, followUpAt: event.target.value })} /></label>
        </div>
        <label><strong>Ghi chú follow-up</strong><textarea value={form.followUpNote} onChange={(event) => setForm({ ...form, followUpNote: event.target.value })} /></label>
        <label><strong>Tags</strong><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="saas, f-and-b" /></label>
        <div className="actions">
          <button type="submit" className="button primary" disabled={busy === "save"}>{busy === "save" ? "Đang lưu…" : "Lưu xử lý"}</button>
        </div>
      </form>
      <section className="section-card" style={{ marginTop: "1rem" }}>
        <div className="section-heading"><div><h3>Ghi chú nội bộ</h3><p>Không gửi cho khách hàng.</p></div></div>
        <form className="form" onSubmit={(event) => {
          event.preventDefault();
          void addNote();
        }}>
          <label><strong>Nội dung ghi chú</strong><textarea maxLength={8000} required value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <Button type="submit" busy={busy === "note"} busyLabel="Đang thêm…">Thêm ghi chú</Button>
        </form>
        <div className="timeline">
          {contact.notes?.length ? contact.notes.map((entry) => (
            <article key={entry.id}><strong>{entry.author}</strong><p>{entry.body}</p><time>{formatDate(entry.createdAt, true)}</time></article>
          )) : <p className="help">Chưa có ghi chú nội bộ.</p>}
        </div>
      </section>
      <details className="advanced" style={{ marginTop: "1rem" }}>
        <summary>Lịch sử hoạt động</summary>
        <div className="timeline">
          {contact.activities?.length ? contact.activities.map((entry) => (
            <article key={entry.id}><strong>{entry.action}</strong><p>{entry.actor}</p><time>{formatDate(entry.createdAt, true)}</time></article>
          )) : <p className="help">Chưa có hoạt động.</p>}
        </div>
      </details>
    </div>
  );
}

export function ContactsView() {
  const { markDirty } = useAdmin();
  const status = useStatus();
  const [items, setItems] = useState<ContactListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status: "new" });
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const requestPage = useCallback(async (nextCursor: string | null, activeFilters: typeof filters, search: string) => {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(activeFilters)) {
      if (value && value !== "all") payload[key] = value;
    }
    if (search.trim()) payload.q = search.trim();
    for (const [key, endOfDay] of [["from", false], ["to", true]] as Array<[string, boolean]>) {
      const value = payload[key];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) continue;
      const [year, month, day] = value.split("-").map(Number);
      const local = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
      if (!Number.isNaN(local.valueOf())) payload[key] = local.toISOString();
    }
    payload.limit = "25";
    if (nextCursor) payload.cursor = nextCursor;
    if (payload.q) return api<{ items?: ContactListItem[]; pagination?: { nextCursor?: string | null; hasMore?: boolean } }>("contacts/search", { method: "POST", body: JSON.stringify(payload) });
    const params = new URLSearchParams(payload);
    return api<{ items?: ContactListItem[]; pagination?: { nextCursor?: string | null; hasMore?: boolean } }>(`contacts?${params.toString()}`);
  }, []);

  const load = useCallback(async (reset: boolean) => {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const data = await requestPage(reset ? null : cursor, filters, query);
      if (id !== requestId.current) return;
      setItems(reset ? data.items || [] : [...items, ...(data.items || [])]);
      setCursor(data.pagination?.nextCursor || null);
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch (error) {
      if (id !== requestId.current) return;
      if (reset) setItems([]);
      status(error instanceof Error ? error.message : "Không tải được inbox.", true);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [cursor, filters, items, query, requestPage, status]);

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openContact = async (id: string) => {
    try {
      const data = await api<{ contact: ContactDetail }>(`contacts/${id}`);
      markDirty("contact", false);
      setDetail(data.contact);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không mở được liên hệ.", true);
    }
  };

  return (
    <section id="contacts-view">
      <header className="view-heading">
        <div>
          <p className="eyebrow">Vận hành</p>
          <h1 tabIndex={-1}>Contacts CRM</h1>
          <p className="help">Inbox hai lớp: lọc nhanh bên trái, toàn bộ ngữ cảnh bên phải.</p>
        </div>
        <div className="view-actions">
          <Button busy={busy} busyLabel="Đang tải…" onClick={() => void load(true)}>Làm mới</Button>
        </div>
      </header>
      <form
        className="filter-bar contacts-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setDetail(null);
          void load(true);
        }}
      >
        <label><strong>Tìm kiếm</strong><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="tên, email, công ty" /></label>
        <label><strong>Trạng thái</strong>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="new">Mới</option>
            <option value="all">Tất cả</option>
            {Object.entries(statusLabel).filter(([value]) => value !== "deleted").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><strong>Giai đoạn</strong>
          <select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}>
            <option value="">—</option>
            {Object.entries(stageLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><strong>Ưu tiên</strong>
          <select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
            <option value="">—</option>
            {Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><strong>Follow-up</strong>
          <select value={filters.followUp} onChange={(event) => setFilters({ ...filters, followUp: event.target.value })}>
            <option value="">—</option>
            <option value="due">Đến hạn</option>
            <option value="scheduled">Đã lên lịch</option>
            <option value="none">Không có</option>
          </select>
        </label>
        <label><strong>Locale</strong>
          <select value={filters.locale} onChange={(event) => setFilters({ ...filters, locale: event.target.value })}>
            <option value="">—</option>
            {Object.entries(localeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><strong>Tag</strong><input value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })} placeholder="saas" /></label>
        <label><strong>Từ</strong><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label><strong>Đến</strong><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <button type="submit" className="button primary small">Áp dụng</button>
      </form>
      <div className="contacts-layout">
        <div className="contacts-list" aria-busy={busy || undefined}>
          <p className="help" id="contact-list-status">{items.length ? `${items.length} liên hệ đang hiển thị` : "Không có liên hệ phù hợp"}</p>
          <p className="help" id="contact-count">{items.filter((item) => item.status === "new").length} mới</p>
          {items.length ? items.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`contact-row${detail?.id === entry.id ? " active" : ""}`}
              onClick={() => void openContact(entry.id)}
            >
              <span className="contact-row-head">
                <strong>{entry.name}</strong>
                <span className={`badge ${entry.priority === "urgent" ? "danger" : entry.status === "new" ? "ready" : ""}`}>{priorityLabel[entry.priority] || entry.priority}</span>
              </span>
              <p>{entry.company || entry.email} · {statusLabel[entry.status] || entry.status} · {stageLabel[entry.stage] || entry.stage} · {localeLabel[entry.locale] || entry.locale}</p>
              <p>{entry.messagePreview || "Không có nội dung xem trước"}</p>
              <time>{formatDate(entry.updatedAt, true)}</time>
            </button>
          )) : <div className="empty">Inbox không có liên hệ phù hợp.</div>}
          {hasMore ? <Button busy={busy} busyLabel="Đang tải…" onClick={() => void load(false)}>Tải thêm</Button> : null}
        </div>
        <div className="contact-detail-pane" id="contact-detail">
          {detail ? (
            <ContactDetailPane
              contact={detail}
              onSaved={(next) => {
                setDetail(next);
                void load(true);
              }}
            />
          ) : <div className="empty">Chọn một liên hệ để xem toàn bộ nội dung và lịch sử xử lý.</div>}
        </div>
      </div>
    </section>
  );
}
