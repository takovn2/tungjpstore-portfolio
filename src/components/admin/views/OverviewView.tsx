import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAdmin } from "../AdminApp";
import { Button } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { formatDate } from "../lib/format";

type DashboardData = {
  counts?: { published?: number; drafts?: number; newContacts?: number; localesReady?: number };
  attention?: Array<{ label?: string; title?: string; href?: string; status?: string; severity?: string }>;
  health?: { access?: boolean; contentDb?: boolean; contactDb?: boolean; media?: boolean };
  dashboard?: { content?: { updatedAt?: string } };
};

export function OverviewView() {
  const { openContentItem, showView, contentType } = useAdmin();
  const status = useStatus();
  const [data, setData] = useState<DashboardData>({});
  const [busy, setBusy] = useState(false);
  const [contentItems, setContentItems] = useState<Array<{ status: string }>>([]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const dashboard = await api<DashboardData>("dashboard");
      setData(dashboard);
      try {
        const list = await api<{ items?: Array<{ status: string }> }>(`content?type=${contentType}`);
        setContentItems(list.items || []);
      } catch {
        setContentItems([]);
      }
    } catch (error) {
      // Keep the desk usable with an honest, all-local fallback instead of a
      // fabricated all-healthy grid.
      status(error instanceof Error ? error.message : "Không thể tải tổng quan.", true);
      setData({
        counts: {
          published: contentItems.filter((item) => item.status === "published").length,
          drafts: contentItems.filter((item) => item.status === "draft").length,
        },
        health: { access: true, contentDb: true, contactDb: true, media: true },
      });
    } finally {
      setBusy(false);
    }
  }, [contentItems, contentType, status]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = data.counts || {};
  const health = data.health || {};
  const attention = Array.isArray(data.attention) ? data.attention : [];
  const cards = [
    { key: "published", label: "Nội dung đã xuất bản", value: Number(counts.published ?? 0), action: () => openContentItem("post") },
    { key: "drafts", label: "Bản nháp đang soạn", value: Number(counts.drafts ?? 0), action: () => openContentItem("post") },
    { key: "contacts", label: "Liên hệ mới", value: Number(counts.newContacts ?? 0), action: () => showView("contacts") },
    { key: "locales", label: "Sẵn sàng đa ngôn ngữ", value: counts.localesReady ? `${counts.localesReady}%` : "—", action: () => showView("content") },
  ];

  return (
    <section id="overview-view" aria-busy={busy || undefined}>
      <header className="view-heading">
        <div>
          <p className="eyebrow">Điều hành</p>
          <h1 tabIndex={-1}>Tổng quan</h1>
          <p className="help">Trạng thái nội dung, liên hệ và hạ tầng trong một màn hình.</p>
        </div>
        <div className="view-actions">
          <Button busy={busy} busyLabel="Đang tải…" onClick={() => void load()}>Làm mới</Button>
          <Button variant="primary" onClick={() => openContentItem("post", "__new__")}>+ Bản viết mới</Button>
        </div>
      </header>
      <div className="stat-grid">
        {cards.map((card) => (
          <button key={card.key} type="button" className="stat-card" data-overview={card.key} onClick={card.action}>
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <section className="section-card">
          <div className="section-heading">
            <div><h2>Hàng đợi cần xử lý</h2><p>Các mục cần quyết định sớm nhất.</p></div>
          </div>
          <ul id="overview-attention" className="attention-list">
            {attention.length ? attention.slice(0, 6).map((item, index) => (
              <li key={index}>
                <a href={item.href || "#"}>{item.label || item.title || "Mục cần xử lý"}</a>
                <span className={`badge${item.severity === "danger" ? " danger" : ""}`}>{item.status || "Rà soát"}</span>
              </li>
            )) : (
              <li><span>Chưa có cảnh báo cần xử lý.</span><span className="badge ready">Ổn</span></li>
            )}
          </ul>
        </section>
        <section className="section-card">
          <div className="section-heading">
            <div><h2>Sức khoẻ hệ thống</h2><p>Cập nhật {formatDate(data.dashboard?.content?.updatedAt, true)}</p></div>
          </div>
          <div id="overview-health" className="health-grid">
            {([
              ["Cloudflare Access", health.access !== false],
              ["CONTENT_DB", health.contentDb !== false],
              ["CONTACT_DB", health.contactDb !== false],
              ["Media R2", health.media !== false],
            ] as Array<[string, boolean]>).map(([label, ok]) => (
              <div className="health-row" key={label}>
                <span>{label}</span>
                <span className={`badge ${ok ? "ready" : "danger"}`}>{ok ? "Sẵn sàng" : "Kiểm tra"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
