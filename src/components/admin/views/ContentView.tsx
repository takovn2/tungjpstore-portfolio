import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useAdmin } from "../AdminApp";
import { Button, Tabs } from "../ui/primitives";
import { Dialog, useConfirm } from "../ui/Dialog";
import { useStatus } from "../ui/Toast";
import { formatDate } from "../lib/format";
import { blockLabel, blockTypes, formatPublishIssue, localeLabel, locales, statusLabel, typeLabel } from "../lib/labels";

type BodyBlock =
  | { type: "paragraph" | "heading" | "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; src: string; alt: string }
  | { type: "cta"; label: string; href: string }
  | { type: "metric"; label: string; value: string };

type LocaleDraft = { title?: string; eyebrow?: string; excerpt?: string; seoTitle?: string; seoDescription?: string; body?: BodyBlock[] };

type ContentItem = {
  id: string | null;
  type?: string;
  slug: string;
  status: string;
  sortOrder: number;
  coverMediaId: string | null;
  meta: Record<string, unknown>;
  version: number;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  updatedAt: string;
  deletedAt: string | null;
  draft?: { slug?: string | null; sortOrder?: number | null; coverMediaId?: string | null; meta?: Record<string, unknown>; localizations?: Record<string, LocaleDraft> };
  published?: { localizations?: Record<string, LocaleDraft> };
};

function safeBlocks(value: unknown): BodyBlock[] {
  if (!Array.isArray(value)) return [];
  return value.map((block): BodyBlock | null => {
    if (!block || typeof block !== "object" || !(blockTypes as readonly string[]).includes(String((block as BodyBlock).type))) return null;
    const typed = block as Record<string, unknown>;
    const type = String(typed.type);
    if (type === "list") return { type, items: Array.isArray(typed.items) ? typed.items.map(String) : [] };
    if (type === "image") return { type, src: String(typed.src ?? ""), alt: String(typed.alt ?? "") };
    if (type === "cta") return { type, label: String(typed.label ?? ""), href: String(typed.href ?? "") };
    if (type === "metric") return { type, label: String(typed.label ?? ""), value: String(typed.value ?? "") };
    return { type: type as "paragraph" | "heading" | "quote", text: String(typed.text ?? "") };
  }).filter((block): block is BodyBlock => block !== null);
}

function blockDraft(type: string): BodyBlock {
  if (type === "list") return { type, items: [""] };
  if (type === "image") return { type, src: "", alt: "" };
  if (type === "cta") return { type, label: "", href: "" };
  if (type === "metric") return { type, label: "", value: "" };
  return { type: type as "paragraph", text: "" };
}

function localeReadiness(data: LocaleDraft) {
  const missing: string[] = [];
  if (!String(data.title || "").trim()) missing.push("title");
  if (!String(data.excerpt || "").trim()) missing.push("excerpt");
  if (!String(data.seoTitle || "").trim()) missing.push("seoTitle");
  if (!String(data.seoDescription || "").trim()) missing.push("seoDescription");
  if (!Array.isArray(data.body) || data.body.length === 0) missing.push("body");
  return { ready: missing.length === 0, missing };
}

const draftKey = (type: string, id: string | null) => `admin:draft:${type}:${id || "new"}`;

function BlockEditor({ blocks, onChange, locale }: { blocks: BodyBlock[]; onChange: (blocks: BodyBlock[]) => void; locale: string }) {
  const [newType, setNewType] = useState("paragraph");
  const update = (index: number, patch: Partial<BodyBlock> | BodyBlock) => {
    onChange(blocks.map((block, i) => (i === index ? { ...block, ...(patch as object) } as BodyBlock : block)));
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="block-editor">
      <div className="block-toolbar">
        <label><strong>Loại block</strong>
          <select value={newType} onChange={(event) => setNewType(event.target.value)}>
            {blockTypes.map((type) => <option key={type} value={type}>{blockLabel[type]}</option>)}
          </select>
        </label>
        <Button size="small" onClick={() => onChange([...blocks, blockDraft(newType)])}>+ Thêm block</Button>
      </div>
      <div className="block-list">
        {blocks.map((block, index) => (
          <article className="block" data-block-index={index} key={index}>
            <div className="block-head">
              <strong>{blockLabel[block.type] || block.type} · {index + 1}</strong>
              <div className="block-tools">
                <Button size="small" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Lên ${blockLabel[block.type]}`}>↑</Button>
                <Button size="small" disabled={index === blocks.length - 1} onClick={() => move(index, 1)} aria-label={`Xuống ${blockLabel[block.type]}`}>↓</Button>
                <Button size="small" onClick={() => onChange(blocks.filter((_, i) => i !== index))} aria-label={`Xoá ${blockLabel[block.type]}`}>Xoá</Button>
              </div>
            </div>
            {block.type === "paragraph" || block.type === "heading" || block.type === "quote" ? (
              <label><strong>{block.type === "heading" ? "Nội dung tiêu đề" : "Nội dung"}</strong><textarea rows={3} value={block.text} onChange={(event) => update(index, { text: event.target.value } as Partial<BodyBlock>)} /></label>
            ) : null}
            {block.type === "list" ? (
              <label><strong>Mỗi dòng là một mục</strong><textarea rows={3} value={block.items.join("\n")} onChange={(event) => update(index, { items: event.target.value.split("\n") } as unknown as Partial<BodyBlock>)} /></label>
            ) : null}
            {block.type === "image" ? (
              <div className="grid2">
                <label><strong>URL ảnh (HTTPS)</strong><input type="url" placeholder="https://…" value={block.src} onChange={(event) => update(index, { src: event.target.value } as unknown as Partial<BodyBlock>)} /></label>
                <label><strong>Mô tả ảnh</strong><input value={block.alt} onChange={(event) => update(index, { alt: event.target.value } as unknown as Partial<BodyBlock>)} /></label>
              </div>
            ) : null}
            {block.type === "cta" ? (
              <div className="grid2">
                <label><strong>Nhãn nút</strong><input value={block.label} onChange={(event) => update(index, { label: event.target.value } as unknown as Partial<BodyBlock>)} /></label>
                <label><strong>Liên kết</strong><input inputMode="url" placeholder="/work hoặc https://…" value={block.href} onChange={(event) => update(index, { href: event.target.value } as unknown as Partial<BodyBlock>)} /></label>
              </div>
            ) : null}
            {block.type === "metric" ? (
              <div className="grid2">
                <label><strong>Tên số liệu</strong><input value={block.label} onChange={(event) => update(index, { label: event.target.value } as unknown as Partial<BodyBlock>)} /></label>
                <label><strong>Giá trị</strong><input value={block.value} onChange={(event) => update(index, { value: event.target.value } as unknown as Partial<BodyBlock>)} /></label>
              </div>
            ) : null}
          </article>
        ))}
        {blocks.length === 0 ? <p className="help">Chưa có block nội dung cho {localeLabel[locale]}.</p> : null}
      </div>
      <details className="advanced">
        <summary>Body JSON nâng cao</summary>
        <textarea
          spellCheck={false}
          defaultValue={JSON.stringify(blocks, null, 2)}
          key={blocks.length}
          onBlur={(event) => {
            try {
              onChange(safeBlocks(JSON.parse(event.target.value || "[]")));
              event.target.setCustomValidity("");
            } catch {
              event.target.setCustomValidity("Body phải là JSON array các block hợp lệ");
            }
          }}
        />
      </details>
    </div>
  );
}

export function ContentView({ target, onTargetConsumed }: { target: { type: string; id?: string } | null; onTargetConsumed: () => void }) {
  const { contentType, setContentType, markDirty, isDirty, guardUnsaved, lastMediaId } = useAdmin();
  const status = useStatus();
  const confirm = useConfirm();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [scope, setScope] = useState("active");
  const [search, setSearch] = useState("");
  const [item, setItem] = useState<ContentItem | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<Array<{ id: string; version: number; status: string; createdAt: string }>>([]);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [savedDraftAt, setSavedDraftAt] = useState<string | null>(null);

  // Editor form state
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [coverMediaId, setCoverMediaId] = useState("");
  const [metaJson, setMetaJson] = useState("{}");
  const [metaLiveUrl, setMetaLiveUrl] = useState("");
  const [metaStatus, setMetaStatus] = useState("");
  const [metaVariant, setMetaVariant] = useState("");
  const [metaResearch, setMetaResearch] = useState(false);
  const [localizations, setLocalizations] = useState<Record<string, LocaleDraft>>({});
  const [activeLocale, setActiveLocale] = useState<string>("vi");
  const [metaTouched, setMetaTouched] = useState(false);

  const touch = useCallback(() => markDirty("content"), [markDirty]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await api<{ items?: ContentItem[] }>(`content?type=${contentType}&deleted=${scope}`);
      setItems(data.items || []);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không tải được danh sách.", true);
    } finally {
      setLoadingList(false);
    }
  }, [contentType, scope, status]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const applyItem = useCallback((next: ContentItem) => {
    setItem(next);
    markDirty("content", false);
    setPublishIssues([]);
    const draft = next.draft;
    setSlug((draft?.slug ?? next.slug) || "");
    setSortOrder(draft?.sortOrder ?? next.sortOrder ?? 0);
    setCoverMediaId(
      draft && Object.prototype.hasOwnProperty.call(draft, "coverMediaId") ? String(draft.coverMediaId ?? "") : String(next.coverMediaId ?? ""),
    );
    const sourceMeta = ((draft?.meta || next.meta || {}) as Record<string, unknown>);
    const safeMeta = { ...sourceMeta };
    delete safeMeta.repoUrl;
    delete safeMeta.repositoryUrl;
    delete safeMeta.repo_url;
    setMetaJson(JSON.stringify(safeMeta, null, 2));
    setMetaLiveUrl(typeof sourceMeta.liveUrl === "string" ? sourceMeta.liveUrl : "");
    setMetaStatus(typeof sourceMeta.status === "string" ? sourceMeta.status : "");
    setMetaVariant(typeof sourceMeta.variant === "string" ? sourceMeta.variant : "");
    setMetaResearch(sourceMeta.research === true);
    const source = draft?.localizations || next.published?.localizations || {};
    const next2: Record<string, LocaleDraft> = {};
    for (const locale of locales) {
      next2[locale] = { ...(source[locale] || {}), body: safeBlocks(source[locale]?.body) };
    }
    setLocalizations(next2);
    setActiveLocale("vi");
    setMetaTouched(false);
    // Offer a locally autosaved draft when one exists for this item.
    const key = draftKey(next.type || contentType, next.id);
    const stored = localStorage.getItem(key);
    setSavedDraft(stored);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { savedAt?: string };
        setSavedDraftAt(typeof parsed.savedAt === "string" ? parsed.savedAt : null);
      } catch {
        setSavedDraftAt(null);
      }
    } else setSavedDraftAt(null);
  }, [contentType, markDirty]);

  const openItem = useCallback(async (id: string) => {
    try {
      const data = await api<{ item: ContentItem }>(`content/${contentType}/${id}`);
      applyItem(data.item);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không mở được nội dung.", true);
    }
  }, [applyItem, contentType, status]);

  useEffect(() => {
    if (!target) return;
    if (target.id === "__new__") {
      applyItem({
        id: null, slug: "new-item", sortOrder: 0, coverMediaId: null, status: "draft", version: 0, meta: {},
        draft: { localizations: {} }, draftRevisionId: null, publishedRevisionId: null, deletedAt: null, updatedAt: new Date().toISOString(),
      });
      markDirty("content", true);
    } else if (target.id) {
      void openItem(target.id);
    }
    onTargetConsumed();
  }, [target, applyItem, markDirty, onTargetConsumed, openItem]);

  // Autosave: debounce dirty editor state into localStorage so a refresh never
  // destroys unsaved work. Only runs while dirty — otherwise re-opening an
  // item would silently overwrite the backup with unchanged server state.
  const autosaveRef = useRef(0);
  const contentDirty = isDirty("content");
  useEffect(() => {
    if (!item || !contentDirty) return;
    window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey(item.type || contentType, item.id), JSON.stringify({
          savedAt: new Date().toISOString(),
          slug, sortOrder, coverMediaId, metaJson, metaLiveUrl, metaStatus, metaVariant, metaResearch, localizations,
        }));
      } catch {
        /* storage full or blocked; autosave is best-effort */
      }
    }, 1000);
    return () => window.clearTimeout(autosaveRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, contentDirty, slug, sortOrder, coverMediaId, metaJson, metaLiveUrl, metaStatus, metaVariant, metaResearch, localizations]);

  const restoreSavedDraft = () => {
    if (!savedDraft) return;
    try {
      const parsed = JSON.parse(savedDraft) as Record<string, unknown>;
      if (typeof parsed.slug === "string") setSlug(parsed.slug);
      if (typeof parsed.sortOrder === "number") setSortOrder(parsed.sortOrder);
      setCoverMediaId(typeof parsed.coverMediaId === "string" ? parsed.coverMediaId : "");
      if (typeof parsed.metaJson === "string") setMetaJson(parsed.metaJson);
      if (typeof parsed.metaLiveUrl === "string") setMetaLiveUrl(parsed.metaLiveUrl);
      if (typeof parsed.metaStatus === "string") setMetaStatus(parsed.metaStatus);
      if (typeof parsed.metaVariant === "string") setMetaVariant(parsed.metaVariant);
      setMetaResearch(parsed.metaResearch === true);
      if (parsed.localizations && typeof parsed.localizations === "object") {
        const restored = parsed.localizations as Record<string, LocaleDraft>;
        const next: Record<string, LocaleDraft> = {};
        for (const locale of locales) next[locale] = { ...(restored[locale] || {}), body: safeBlocks(restored[locale]?.body) };
        setLocalizations(next);
      }
      markDirty("content", true);
      setSavedDraft(null);
      setSavedDraftAt(null);
      status("Đã khôi phục bản nháp cục bộ.");
    } catch {
      status("Bản nháp cục bộ bị hỏng; đã bỏ qua.", true);
    }
  };

  const discardSavedDraft = () => {
    if (item) localStorage.removeItem(draftKey(item.type || contentType, item.id));
    setSavedDraft(null);
    setSavedDraftAt(null);
  };

  const collectLocalizations = () => {
    const output: Record<string, LocaleDraft> = {};
    for (const locale of locales) {
      const data = localizations[locale] || {};
      const trimmed: LocaleDraft = {};
      if (String(data.title || "").trim()) trimmed.title = String(data.title).trim();
      if (String(data.eyebrow || "").trim()) trimmed.eyebrow = String(data.eyebrow).trim();
      if (String(data.excerpt || "").trim()) trimmed.excerpt = String(data.excerpt).trim();
      if (String(data.seoTitle || "").trim()) trimmed.seoTitle = String(data.seoTitle).trim();
      if (String(data.seoDescription || "").trim()) trimmed.seoDescription = String(data.seoDescription).trim();
      trimmed.body = data.body || [];
      output[locale] = trimmed;
    }
    return output;
  };

  const collectMeta = () => {
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(metaJson || "{}");
    } catch {
      throw new Error("Metadata JSON không hợp lệ");
    }
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("Metadata phải là một JSON object");
    delete meta.repoUrl;
    delete meta.repositoryUrl;
    delete meta.repo_url;
    const sourceMeta = (item?.draft?.meta || item?.meta || {}) as Record<string, unknown>;
    const previousStatus = typeof sourceMeta.status === "string" ? sourceMeta.status.trim() : "";
    const nextStatus = metaStatus.trim();
    const keys = ["statusLabel", "statusLabelVi", "statusLabelEn", "statusLabelJa", "statusLabelZh"];
    const labelsWereEdited = keys.some((key) => meta[key] !== sourceMeta[key]);
    if (nextStatus !== previousStatus && !labelsWereEdited) keys.forEach((key) => delete meta[key]);
    const set = (key: string, value: string) => {
      if (value) meta[key] = value;
      else delete meta[key];
    };
    set("status", nextStatus);
    if (contentType === "project") {
      set("liveUrl", metaLiveUrl.trim());
      set("variant", metaVariant);
      if (metaResearch) meta.research = true;
      else delete meta.research;
    }
    return meta;
  };

  const save = async () => {
    let meta: Record<string, unknown>;
    try {
      meta = collectMeta();
    } catch (error) {
      status(error instanceof Error ? error.message : "Metadata không hợp lệ.", true);
      return;
    }
    const body = {
      slug: slug.trim(),
      sortOrder: Number(sortOrder || 0),
      coverMediaId: coverMediaId.trim() || null,
      meta,
      localizations: collectLocalizations(),
    };
    try {
      const data = item?.id
        ? await api<{ item: ContentItem }>(`content/${contentType}/${item.id}`, { method: "PUT", body: JSON.stringify({ ...body, expectedVersion: item.version }) })
        : await api<{ item: ContentItem }>(`content/${contentType}`, { method: "POST", body: JSON.stringify(body) });
      applyItem(data.item);
      localStorage.removeItem(draftKey(contentType, data.item.id));
      setSavedDraft(null);
      setSavedDraftAt(null);
      status("Đã lưu bản nháp. Website công khai chưa thay đổi.");
      await loadList();
    } catch (error) {
      status(error instanceof Error ? error.message : "Không lưu được bản nháp.", true);
    }
  };

  const mutate = async (action: "publish" | "unpublish" | "delete" | "restore") => {
    if (!item?.id) return;
    const copy: Record<string, [string, string, boolean, string]> = {
      publish: ["Xuất bản nội dung?", "Bản nháp hiện tại sẽ thay thế nội dung đang hiển thị công khai ở cả bốn ngôn ngữ.", false, "Đang xuất bản…"],
      unpublish: ["Gỡ nội dung khỏi website?", "Nội dung sẽ ngừng hiển thị công khai nhưng lịch sử phiên bản vẫn được giữ lại.", true, "Đang gỡ…"],
      delete: ["Chuyển vào thùng rác?", "Nội dung sẽ không còn trong danh sách đang sử dụng. Bạn vẫn có thể khôi phục sau.", true, "Đang chuyển…"],
      restore: ["Khôi phục nội dung?", "Nội dung sẽ trở lại trạng thái có thể biên tập và rà soát trước khi xuất bản.", false, "Đang khôi phục…"],
    };
    const [title, message, danger, busyLabel] = copy[action];
    void busyLabel;
    if (!(await confirm(title, message, { danger }))) return;
    if (action === "publish") setPublishIssues([]);
    try {
      const data = await api<{ item: ContentItem }>(`content/${contentType}/${item.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: item.version,
          ...(action === "publish" && item.draftRevisionId ? { revisionId: item.draftRevisionId } : {}),
        }),
      });
      applyItem(data.item);
      status(action === "publish" ? "Đã xuất bản nội dung." : "Đã cập nhật trạng thái nội dung.");
      await loadList();
    } catch (error) {
      const typed = error as { code?: string; issues?: string[] };
      if (action === "publish" && typed.code === "publish_validation_failed") {
        setPublishIssues(Array.isArray(typed.issues) ? typed.issues : []);
      }
      status(error instanceof Error ? error.message : "Thao tác thất bại.", true);
    }
  };

  const loadRevisions = async () => {
    if (!item?.id) return;
    setRevisionsOpen(true);
    try {
      const data = await api<{ revisions?: Array<{ id: string; version: number; status: string; createdAt: string }> }>(`content/${contentType}/${item.id}/revisions`);
      setRevisions(data.revisions || []);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không tải được lịch sử.", true);
      setRevisions([]);
    }
  };

  const restoreRevision = async (revisionId: string) => {
    if (!item?.id) return;
    if (!(await confirm("Khôi phục revision?", "Một bản nháp mới sẽ được tạo; bản đã xuất bản không bị thay đổi.", { danger: false }))) return;
    try {
      const result = await api<{ item: ContentItem }>(`content/${contentType}/${item.id}/revision/${revisionId}/restore`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: item.version }),
      });
      applyItem(result.item);
      setRevisionsOpen(false);
      status("Đã khôi phục thành nháp.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không khôi phục được.", true);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && item) {
        event.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, slug, sortOrder, coverMediaId, metaJson, metaLiveUrl, metaStatus, metaVariant, metaResearch, localizations, contentType]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((entry) => !query || `${entry.slug} ${entry.status} ${entry.deletedAt ? "deleted" : ""}`.toLowerCase().includes(query));
  }, [items, search]);

  const updateLocale = (locale: string, patch: Partial<LocaleDraft>) => {
    setLocalizations((current) => ({ ...current, [locale]: { ...(current[locale] || {}), ...patch } }));
    touch();
  };

  const closeEditor = async () => {
    if (!(await guardUnsaved("content"))) return;
    setItem(null);
    discardSavedDraft();
  };

  const protectedSlug = item?.type === "site_section" && ["home-hero", "contact-profile"].includes(item.slug);

  if (item) {
    return (
      <section id="content-view">
        <header className="view-heading">
          <div>
            <p className="eyebrow">Nội dung · {typeLabel[contentType] || contentType}</p>
            <h1 tabIndex={-1}>{item.slug}</h1>
            <p className="help" id="revision-info">id={item.id || "new"} · v{item.version} · draft={item.draftRevisionId || "—"} · live={item.publishedRevisionId || "—"}</p>
          </div>
          <div className="view-actions">
            <Button onClick={() => void closeEditor()}>← Danh sách</Button>
          </div>
        </header>

        {savedDraft ? (
          <div className="draft-banner" role="status">
            <span>Phát hiện bản nháp cục bộ chưa lưu{savedDraftAt ? ` (tự lưu lúc ${formatDate(savedDraftAt, true)})` : ""}.</span>
            <div className="view-actions">
              <Button size="small" variant="primary" onClick={restoreSavedDraft}>Khôi phục</Button>
              <Button size="small" onClick={discardSavedDraft}>Bỏ</Button>
            </div>
          </div>
        ) : null}

        {publishIssues.length ? (
          <div className="publish-errors" id="publish-errors" role="alert" tabIndex={-1}>
            <h2>Chưa thể xuất bản</h2>
            <ul id="publish-errors-list">
              {publishIssues.map((issue, index) => <li key={index}>{formatPublishIssue(issue)}</li>)}
            </ul>
          </div>
        ) : null}

        <form
          className="form content-form"
          id="content-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          onInput={() => touch()}
        >
          <div className="grid3">
            <label><strong>Slug</strong><input value={slug} disabled={protectedSlug} onChange={(event) => { setSlug(event.target.value); touch(); }} required /></label>
            <label><strong>Thứ tự</strong><input type="number" value={sortOrder} onChange={(event) => { setSortOrder(Number(event.target.value)); touch(); }} /></label>
            <label><strong>Media bìa (ID)</strong>
              <div className="inline-row">
                <input value={coverMediaId} onChange={(event) => { setCoverMediaId(event.target.value); touch(); }} placeholder="media-uuid" />
                {lastMediaId ? <Button size="small" type="button" onClick={() => { setCoverMediaId(lastMediaId); touch(); status("Đã chọn media làm ảnh bìa. Hãy lưu bản nháp."); }}>Dùng media mới</Button> : null}
              </div>
            </label>
          </div>

          <div className="grid3" data-project-meta hidden={contentType !== "project"}>
            <label><strong>Live URL</strong><input name="metaLiveUrl" value={metaLiveUrl} onChange={(event) => { setMetaLiveUrl(event.target.value); touch(); }} placeholder="https://…" /></label>
            <label><strong>Trạng thái dự án</strong><input name="metaStatus" value={metaStatus} onChange={(event) => { setMetaStatus(event.target.value); touch(); }} placeholder="Đang vận hành" /></label>
            <label><strong>Biến thể</strong>
              <select name="metaVariant" value={metaVariant} onChange={(event) => { setMetaVariant(event.target.value); touch(); }}>
                <option value="">—</option>
                <option value="logivn">LogiVN</option>
                <option value="fball">Fball</option>
                <option value="payment">Payment</option>
                {metaVariant && !["logivn", "fball", "payment"].includes(metaVariant) ? <option value={metaVariant}>Tuỳ biến: {metaVariant}</option> : null}
              </select>
            </label>
            <label className="check"><input type="checkbox" name="metaResearch" checked={metaResearch} onChange={(event) => { setMetaResearch(event.target.checked); touch(); }} /><span><strong>Nghiên cứu đã công bố</strong></span></label>
          </div>

          <label><strong>Metadata JSON</strong><textarea className="mono" rows={6} spellCheck={false} value={metaJson} onInput={(event) => { setMetaJson(event.currentTarget.value); setMetaTouched(true); touch(); }} /></label>

          <Tabs
            label="Ngôn ngữ nội dung"
            active={activeLocale}
            onChange={setActiveLocale}
            items={locales.map((locale) => {
              const readiness = localeReadiness(localizations[locale] || {});
              return { key: locale, label: <span className="locale-tab-inner"><span>{localeLabel[locale]}</span><span className="locale-readiness">{readiness.ready ? "Sẵn sàng" : `Thiếu ${readiness.missing.length}`}</span></span> };
            })}
          />
          {locales.map((locale) => (
            <details
              key={locale}
              className="locale"
              open={locale === activeLocale}
              onToggle={(event) => {
                if ((event.target as HTMLDetailsElement).open) setActiveLocale(locale);
              }}
            >
              <summary><span>{localeLabel[locale]} <span className="badge">{locale}</span></span></summary>
              <div className="locale-body">
                <div className="grid2">
                  <label><strong>Tiêu đề chính</strong><input value={localizations[locale]?.title || ""} onChange={(event) => updateLocale(locale, { title: event.target.value })} /></label>
                  <label><strong>Nhãn dẫn</strong><input value={localizations[locale]?.eyebrow || ""} onChange={(event) => updateLocale(locale, { eyebrow: event.target.value })} /></label>
                </div>
                <label><strong>Mô tả ngắn</strong><textarea rows={2} value={localizations[locale]?.excerpt || ""} onChange={(event) => updateLocale(locale, { excerpt: event.target.value })} /></label>
                <div className="grid2">
                  <label><strong>SEO title</strong><input value={localizations[locale]?.seoTitle || ""} onChange={(event) => updateLocale(locale, { seoTitle: event.target.value })} /></label>
                  <label><strong>SEO description</strong><textarea rows={2} value={localizations[locale]?.seoDescription || ""} onChange={(event) => updateLocale(locale, { seoDescription: event.target.value })} /></label>
                </div>
                <BlockEditor locale={locale} blocks={localizations[locale]?.body || []} onChange={(blocks) => updateLocale(locale, { body: blocks })} />
              </div>
            </details>
          ))}

          <div className="sticky-actions">
            <span className="dirty-indicator" id="editor-dirty" hidden={!isDirty("content")}>● Chưa lưu</span>
            <button type="submit" className="button primary">Lưu bản nháp</button>
            <Button id="publish" disabled={!item.draftRevisionId || Boolean(item.deletedAt)} onClick={() => void mutate("publish")}>Xuất bản</Button>
            <Button id="unpublish" disabled={item.status !== "published" || Boolean(item.deletedAt)} onClick={() => void mutate("unpublish")}>Gỡ xuất bản</Button>
            <Button id="delete" variant="danger" disabled={!item.id || Boolean(item.deletedAt)} onClick={() => void mutate("delete")}>Thùng rác</Button>
            <Button id="restore" disabled={!item.deletedAt} onClick={() => void mutate("restore")}>Khôi phục</Button>
            <Button id="revisions" onClick={() => void loadRevisions()}>Phiên bản</Button>
          </div>
        </form>

        {revisionsOpen ? (
          <Dialog title="Lịch sử phiên bản" eyebrow="Content" onClose={() => setRevisionsOpen(false)}>
            <div id="revision-list" className="revision-list">
              {revisions.length ? revisions.map((revision) => (
                <article key={revision.id}>
                  <div className="section-heading">
                    <div>
                      <strong>v{revision.version || revision.id}</strong>
                      <p>{statusLabel[revision.status] || revision.status || "Revision"} · {formatDate(revision.createdAt, true)}</p>
                    </div>
                    <Button size="small" onClick={() => void restoreRevision(revision.id)}>Khôi phục thành nháp</Button>
                  </div>
                </article>
              )) : <p className="help">Chưa có revision khác.</p>}
            </div>
          </Dialog>
        ) : null}
      </section>
    );
  }

  return (
    <section id="content-view">
      <header className="view-heading">
        <div>
          <p className="eyebrow">Nội dung</p>
          <h1 tabIndex={-1} id="view-title">{typeLabel[contentType] || contentType}</h1>
          <p className="help" id="view-subtitle">{scope === "deleted" ? "Nội dung đã xóa mềm có thể được mở và khôi phục." : "Quản lý bản nháp, bản đã xuất bản và nội dung đã chuyển vào thùng rác."}</p>
        </div>
        <div className="view-actions">
          <select
            id="content-type-select"
            value={contentType}
            onChange={async (event) => {
              if (!(await guardUnsaved("content"))) return;
              setContentType(event.target.value);
            }}
          >
            <option value="site_section">Trang</option>
            <option value="project">Dự án</option>
            <option value="post">Bài viết</option>
          </select>
          <select
            id="content-scope"
            value={scope}
            onChange={async (event) => {
              if (!(await guardUnsaved("content"))) return;
              setScope(event.target.value);
            }}
          >
            <option value="active">Đang dùng</option>
            <option value="deleted">Thùng rác</option>
            <option value="all">Tất cả</option>
          </select>
          <Button onClick={() => void loadList()} busy={loadingList} busyLabel="Đang tải…">Làm mới</Button>
          <Button variant="primary" id="new-item" onClick={async () => {
            if (await guardUnsaved("content")) {
              applyItem({
                id: null, slug: "new-item", sortOrder: 0, coverMediaId: null, status: "draft", version: 0, meta: {},
                draft: { localizations: {} }, draftRevisionId: null, publishedRevisionId: null, deletedAt: null, updatedAt: new Date().toISOString(),
              });
              markDirty("content", true);
            }
          }}>+ Mới</Button>
        </div>
      </header>
      <div className="filter-bar">
        <label><strong>Tìm kiếm</strong><input id="content-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="slug hoặc trạng thái" /></label>
        <span className="help" id="content-result-count">{filtered.length} mục</span>
      </div>
      <div id="items" className="item-list" aria-busy={loadingList || undefined}>
        {filtered.length ? filtered.map((entry, index) => (
          <article className="item" key={entry.id} style={{ animationDelay: `${Math.min(index * 28, 220)}ms` }}>
            <span className="item-index">{String(index + 1).padStart(2, "0")}</span>
            <button
              className="item-open"
              type="button"
              onClick={() => void (async () => {
                if (!(await guardUnsaved("content"))) return;
                await openItem(String(entry.id));
              })()}
            >
              <strong>{entry.slug}</strong>
              <span>v{entry.version} · {statusLabel[entry.status] || entry.status} · {formatDate(entry.updatedAt)}</span>
            </button>
            <span className={`badge ${entry.deletedAt ? "danger" : entry.status === "published" ? "ready" : ""}`}>
              {entry.deletedAt ? "Thùng rác" : statusLabel[entry.status] || entry.status}
            </span>
          </article>
        )) : <div className="empty">Không có nội dung phù hợp với bộ lọc hiện tại.</div>}
      </div>
    </section>
  );
}
