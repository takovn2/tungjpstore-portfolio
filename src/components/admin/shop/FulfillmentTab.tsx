import { useEffect, useState } from "react";
import { shopApi } from "../api/client";
import { useShop } from "./useShop";
import { Button, EmptyState, StatusBadge, SystemDot } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { formatDate } from "../lib/format";

export function FulfillmentTab() {
  const { fulfillment, outbox, loadFulfillment } = useShop();
  const status = useStatus();
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void loadFulfillment().catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được giao hàng.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSweep = async () => {
    setBusy("sweep");
    try {
      const data = await shopApi<{ sweep?: unknown }>("maintenance", { method: "POST", body: JSON.stringify({}) });
      status(`Đã chạy sweep bảo trì: ${JSON.stringify(data.sweep || {})}`);
      await loadFulfillment();
    } catch (error) {
      status(error instanceof Error ? error.message : "Không chạy được sweep.", true);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="shop-panel" data-shop-panel="fulfillment">
      <div className="filter-bar">
        <span className="help">{outbox.filter((item) => ["pending", "failed"].includes(String(item.status))).length} outbox chờ/lỗi · {fulfillment.length} sự kiện giao hàng</span>
        <div className="view-actions">
          <Button busy={busy === "sweep"} busyLabel="Đang sweep…" onClick={() => void runSweep()}>Chạy bảo trì (retry)</Button>
          <Button
            busy={busy === "reload"}
            busyLabel="Đang tải…"
            onClick={() => {
              setBusy("reload");
              void loadFulfillment().catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được giao hàng.", true)).finally(() => setBusy(""));
            }}
          >
            Làm mới
          </Button>
        </div>
      </div>
      <div className="grid2">
        <section className="section-card">
          <div className="section-heading"><div><p className="eyebrow">Fulfillment</p><h3>Sự kiện giao key</h3></div></div>
          <div className="table-shell">
            <table>
              <thead><tr><th>Đơn</th><th>Sự kiện</th><th>Kênh</th><th>Ngày</th><th>Trạng thái</th></tr></thead>
              <tbody data-shop-list="fulfillment-jobs">
                {fulfillment.map((event, index) => (
                  <tr key={index} data-shop-id={String(event.orderId || event.id)}>
                    <td><span className="cell-title">{String(event.orderId || "—")}</span><span className="cell-meta">{String(event.orderItemId || "—")}</span></td>
                    <td>{String(event.eventType || "—")}</td>
                    <td>{String(event.channel || "—")}</td>
                    <td>{formatDate(event.createdAt, true)}</td>
                    <td><StatusBadge status={event.errorCode ? "failed" : String(event.eventType) === "delivered" ? "fulfilled" : "processing"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fulfillment.length === 0 ? <EmptyState title="Chưa có sự kiện giao hàng." /> : null}
        </section>
        <section className="section-card">
          <div className="section-heading"><div><p className="eyebrow">Outbox</p><h3>Thông báo đang chờ</h3></div><span className="badge">{outbox.length}</span></div>
          <div className="outbox-list" data-shop-list="outbox">
            {outbox.length ? outbox.map((item, index) => (
              <article className="outbox-item" key={index}>
                <SystemDot state={String(item.status) === "pending" ? "warning" : String(item.status) === "failed" ? "error" : "healthy"} />
                <div>
                  <strong>{String(item.topic || "Thông báo")}</strong>
                  <span className="cell-meta">{String(item.destination || "—")} · {String(item.aggregateId || "—")}</span>
                </div>
                <StatusBadge status={String(item.status)} />
              </article>
            )) : <EmptyState title="Không có thông báo chờ." hint="Email và Telegram dùng chung outbox để retry độc lập." />}
          </div>
        </section>
      </div>
    </div>
  );
}
