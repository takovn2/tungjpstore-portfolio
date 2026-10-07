import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAdmin } from "../AdminApp";
import { Button } from "../ui/primitives";
import { useStatus } from "../ui/Toast";

type MediaItem = {
  id: string; objectKey: string; filename: string; mimeType: string; byteSize: number;
  alt: string; publicUrl?: string; url?: string;
};

export function MediaView() {
  const { lastMediaId, setLastMediaId, currentView } = useAdmin();
  const status = useStatus();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const loadLibrary = useCallback(async (search: string) => {
    setBusy(true);
    try {
      const data = await api<{ items?: MediaItem[] }>(`media?limit=24${search ? `&q=${encodeURIComponent(search)}` : ""}`);
      setItems(data.items || []);
    } catch (error) {
      setItems([]);
      status(error instanceof Error ? error.message : "Thư viện chưa khả dụng.", true);
    } finally {
      setBusy(false);
    }
  }, [status]);

  useEffect(() => {
    if (currentView === "media") void loadLibrary("");
  }, [currentView, loadLibrary]);

  const upload = async (form: HTMLFormElement) => {
    const button = form.querySelector('[type="submit"]') as HTMLButtonElement | null;
    button?.setAttribute("data-busy", "true");
    try {
      const data = await api<{ media: { id: string; publicUrl?: string } }>("media", { method: "POST", body: new FormData(form) });
      setLastMediaId(data.media.id);
      setResult(`Đã tải: ${data.media.id}${data.media.publicUrl ? ` · ${data.media.publicUrl}` : " · cần cấu hình MEDIA_PUBLIC_BASE_URL"}`);
      form.reset();
      status("Tải media lên R2 thành công.");
      await loadLibrary(query);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không tải được media.", true);
    } finally {
      button?.removeAttribute("data-busy");
    }
  };

  return (
    <section id="media-view">
      <header className="view-heading">
        <div>
          <p className="eyebrow">Vận hành</p>
          <h1 tabIndex={-1}>Media</h1>
          <p className="help">Ảnh bìa và nội dung hình ảnh lưu trên R2, URL công khai qua media.tung.codes.</p>
        </div>
        <div className="view-actions">
          <Button busy={busy} busyLabel="Đang tải…" onClick={() => void loadLibrary(query)}>Làm mới</Button>
        </div>
      </header>
      <form ref={formRef} className="form section-card" id="media-form" onSubmit={(event) => {
        event.preventDefault();
        void upload(event.currentTarget);
      }}>
        <div className="grid2">
          <label><strong>File ảnh (jpg/png/gif/webp/avif, tối đa 8MB)</strong><input type="file" name="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" required /></label>
          <label><strong>Alt text (khuyến nghị)</strong><input name="alt" maxLength={300} placeholder="Mô tả nội dung ảnh" /></label>
        </div>
        <div className="actions">
          <button type="submit" className="button primary">Tải lên R2</button>
        </div>
        {result ? <p className="help" id="media-result">{result}</p> : null}
      </form>
      <div className="filter-bar">
        <label><strong>Tìm trong thư viện</strong>
          <div className="inline-row">
            <input
              id="media-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadLibrary(query);
              }}
              placeholder="tên file hoặc alt"
            />
            <Button size="small" onClick={() => void loadLibrary(query)}>Tìm</Button>
          </div>
        </label>
        <span className="help" id="media-library-status">{busy ? "Đang tải…" : `${items.length} ảnh`}</span>
      </div>
      <div className="media-library" id="media-library" aria-busy={busy || undefined}>
        {items.length ? items.map((media) => (
          <article className="media-card" key={media.id}>
            <img src={media.publicUrl || media.url || ""} alt={media.alt || media.filename || "Media"} loading="lazy" />
            <strong title={media.filename || media.objectKey || media.id}>{media.filename || media.objectKey || media.id}</strong>
            <span className="help">{media.alt || "Chưa có alt text"}</span>
            <Button
              size="small"
              onClick={() => {
                setLastMediaId(media.id);
                status(lastMediaId === media.id
                  ? "Đã chọn media làm ảnh bìa. Mở nội dung và bấm 'Dùng media mới nhất' cạnh trường Media bìa."
                  : "Đã ghi nhớ media. Mở một nội dung rồi bấm 'Dùng media mới nhất' cạnh trường Media bìa.");
              }}
            >
              Dùng làm ảnh bìa
            </Button>
          </article>
        )) : <div className="empty">Chưa có media phù hợp.</div>}
      </div>
    </section>
  );
}
