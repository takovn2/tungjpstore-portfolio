import { useEffect } from "react";
import { useShop } from "./useShop";
import { Button, EmptyState, MiniChart, StatusBadge } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { formatDate, shopMoney } from "../lib/format";
import { shopStateText } from "../lib/labels";

export function OverviewTab() {
  const { overview, orders, setTab, loadOverview } = useShop();
  const status = useStatus();

  useEffect(() => {
    void loadOverview().catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được tổng quan shop.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = overview?.counts || {};
  const ops = overview?.ops;
  const metrics = [
    { label: "Doanh thu 30 ngày", value: counts.revenue30d ?? "—" },
    { label: "Đơn đang mở", value: counts.openOrders ?? 0 },
    { label: "Key khả dụng", value: counts.availableKeys ?? 0 },
    { label: "Sắp hết hàng", value: counts.lowStockVariants ?? 0 },
    { label: "Cần đối soát", value: counts.paymentAttention ?? 0 },
    { label: "Hàng đợi giao", value: counts.fulfillmentQueue ?? 0 },
    { label: "AOV", value: counts.averageOrderValue ?? "—" },
    { label: "Tự động hoá", value: counts.autoFulfillmentRate ?? "—" },
  ];
  const attention: Array<{ title: string; detail: string; view: string }> = [];
  if (Number(counts.paymentAttention || 0) > 0) attention.push({ title: "Có giao dịch thanh toán cần đối soát", detail: `${counts.paymentAttention} sự kiện cần rà soát`, view: "payments" });
  if (Number(counts.fulfillmentQueue || 0) > 0) attention.push({ title: "Hàng đợi giao key cần theo dõi", detail: `${counts.fulfillmentQueue} outbox đang chờ hoặc lỗi`, view: "fulfillment" });
  if (Number(counts.criticalStockVariants || 0) > 0) attention.push({ title: "Có variant hết key", detail: `${counts.criticalStockVariants} SKU về 0`, view: "inventory" });

  return (
    <div className="shop-panel" data-shop-panel="overview">
      <div className="metric-strip">
        {metrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <span className="metric-value">{String(metric.value)}</span>
            <span className="metric-label">{metric.label}</span>
          </div>
        ))}
      </div>

      <div className="grid2">
        <section className="section-card" data-shop-ops-cockpit>
          <div className="section-heading">
            <div><p className="eyebrow">F9 Ops Cockpit</p><h3>Tình trạng vận hành</h3></div>
            <span className={`badge ${ops?.health === "healthy" ? "ready" : ops?.health === "critical" ? "danger" : ""}`} data-shop-ops-score data-health={ops?.health || "attention"}>
              <b data-shop-ops-score-value>{ops?.score ?? "—"}</b> · {ops?.health === "healthy" ? "Hệ thống ổn định" : ops?.health === "critical" ? "Cần xử lý khẩn" : "Cần chú ý"}
            </span>
          </div>
          {ops?.generatedAt ? <p className="help" data-shop-ops-generated>Cập nhật {formatDate(ops.generatedAt, true)}</p> : null}
          <ul className="ops-signals" data-shop-ops-signals>
            {(ops?.signals || []).map((signal: { level?: string; message?: string; code?: string }, index: number) => (
              <li key={index} data-level={signal.level || "info"}>{signal.message || signal.code || ""}</li>
            ))}
          </ul>
          <ul className="inventory-alerts" data-shop-inventory-alerts>
            {(overview?.inventoryAlerts || []).length
              ? (overview?.inventoryAlerts || []).map((alert: { severity?: string; title?: string; sku?: string; message?: string }, index: number) => (
                <li key={index} data-level={alert.severity === "critical" ? "error" : alert.severity === "low" ? "warn" : "info"}>
                  <strong>{alert.title || alert.sku || ""}</strong> · {alert.message || ""}
                </li>
              ))
              : <li data-level="info">Không có SKU sắp hết / hết hàng.</li>}
          </ul>
        </section>

        <section className="section-card">
          <div className="section-heading">
            <div><p className="eyebrow">Nhịp bán hàng</p><h3>7 ngày qua</h3></div>
            <Button size="small" onClick={() => void loadOverview()}>Làm mới</Button>
          </div>
          <MiniChart series={overview?.ordersSeries || []} />
          <p className="help">Số đơn tạo mới theo ngày (giờ Việt Nam). Doanh thu đã thanh toán 30 ngày: {counts.revenue30d ?? "—"}.</p>
        </section>
      </div>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Work queue</p><h3>Cần quyết định</h3></div>
        </div>
        <div className="attention-queue" data-shop-list="attention">
          {attention.length ? attention.map((item, index) => (
            <button key={item.view} type="button" className="queue-item" onClick={() => setTab(item.view)}>
              <span className="queue-item-index">0{index + 1}</span>
              <span><strong>{item.title}</strong><span>{item.detail}</span></span>
              <StatusBadge status="warning" label="Mở" />
            </button>
          )) : <EmptyState title="Chưa có hàng đợi." hint="Các cảnh báo tồn kho, đơn lỗi và đồng bộ sẽ xuất hiện tại đây." />}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Đơn gần đây</p><h3>Mới nhất</h3></div>
          <Button size="small" onClick={() => setTab("orders")}>Xem tất cả</Button>
        </div>
        <div className="table-shell">
          <table>
            <thead><tr><th>Đơn</th><th>Khách</th><th>Tham chiếu</th><th>Thanh toán</th><th>Giao</th><th className="numeric">Tổng</th></tr></thead>
            <tbody data-shop-list="recent-orders">
              {orders.slice(0, 6).map((order) => (
                <tr key={order.id} data-shop-id={order.id}>
                  <td><span className="cell-title">{String(order.orderNumber || order.orderReference || order.id)}</span><span className="cell-meta">{String(order.sourceChannel || "web")}</span></td>
                  <td><span className="cell-title">{String(order.customerEmail || "Ẩn email")}</span></td>
                  <td><span className="cell-meta">{String(order.orderReference || "—")}</span></td>
                  <td><StatusBadge status={String(order.paymentStatus)} /></td>
                  <td><StatusBadge status={String(order.fulfillmentStatus)} /></td>
                  <td className="numeric">{shopMoney(order.totalMinor, String(order.currency || "VND"))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 ? <EmptyState title="Chưa có đơn hàng." /> : null}
        <p className="help">Trạng thái mới nhất: {shopStateText(orders[0]?.paymentStatus ?? "—")}</p>
      </section>
    </div>
  );
}
