import { useCallback, useEffect, useRef, useState } from "react";
import { useShop, type OrderRow } from "./useShop";
import { Button, EmptyState, StatusBadge } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { downloadCsv, formatDate, shopMoney } from "../lib/format";
import { OrderDialog } from "./OrderDialog";

const AUTO_REFRESH_MS = 60_000;

/** Orders table with server-side pagination, search and background auto-refresh. */
export function OrdersTab() {
  const { orders, ordersPage, ordersQuery, loadOrders, loadOverview } = useShop();
  const status = useStatus();
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(query);

  useEffect(() => {
    void loadOrders(1, "").catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được đơn hàng.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySearch = useCallback(async (nextQuery: string, page = 1) => {
    setBusy(true);
    try {
      await loadOrders(page, nextQuery);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không tải được đơn hàng.", true);
    } finally {
      setBusy(false);
    }
  }, [loadOrders, status]);

  // Gentle auto-refresh: only while the tab is visible, no dialogs open, and
  // the user asked for it. Manual refresh is always one click away.
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || openOrderId) return;
      void loadOrders(ordersPage.page, searchRef.current).then(() => {
        return loadOverview().catch(() => undefined);
      }).catch(() => undefined);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadOrders, loadOverview, openOrderId, ordersPage.page]);

  const filtered = orders.filter((order) => {
    if (quickFilter === "open" && !["pending_payment", "processing"].includes(order.status)) return false;
    if (quickFilter === "payment_review" && !["pending", "failed"].includes(String(order.paymentStatus))) return false;
    if (quickFilter === "failed" && String(order.fulfillmentStatus) !== "failed") return false;
    return true;
  });

  return (
    <div className="shop-panel" data-shop-panel="orders">
      <div className="filter-bar">
        <label><strong>Tìm đơn</strong>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                searchRef.current = query;
                void applySearch(query);
              }
            }}
            placeholder="mã đơn hoặc email"
          />
        </label>
        <label><strong>Lọc nhanh</strong>
          <select value={quickFilter} onChange={(event) => setQuickFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="open">Đang mở</option>
            <option value="payment_review">Cần duyệt TT</option>
            <option value="failed">Giao lỗi</option>
          </select>
        </label>
        <span className="help">{ordersPage.total} đơn · trang {ordersPage.page}/{ordersPage.totalPages}{ordersQuery ? ` · tìm "${ordersQuery}"` : ""}</span>
        <div className="view-actions">
          <Button busy={busy} busyLabel="Đang tải…" onClick={() => void applySearch(query)}>Tìm</Button>
          <Button onClick={() => downloadCsv(
            `tung-orders-${new Date().toISOString().slice(0, 10)}.csv`,
            ["orderNumber", "customerEmail", "status", "paymentStatus", "fulfillmentStatus", "totalMinor", "currency", "createdAt"],
            orders.map((row: OrderRow) => [row.orderNumber, row.customerEmail, row.status, row.paymentStatus, row.fulfillmentStatus, row.totalMinor, row.currency, row.createdAt]),
          )}>Xuất CSV</Button>
          <Button variant={autoRefresh ? "primary" : "secondary"} onClick={() => setAutoRefresh(!autoRefresh)} aria-pressed={autoRefresh}>
            {autoRefresh ? "Tự động bật" : "Tự động tắt"}
          </Button>
        </div>
      </div>
      <div className="table-shell">
        <table>
          <thead><tr><th>Đơn</th><th>Khách</th><th>Ngày</th><th>Thanh toán</th><th>Giao</th><th>Rà soát</th><th className="numeric">Tổng</th><th>Thao tác</th></tr></thead>
          <tbody data-shop-list="orders">
            {filtered.map((order) => {
              const unpaid = ["unpaid", "pending"].includes(String(order.paymentStatus));
              return (
                <tr key={order.id} data-shop-id={order.id}>
                  <td>
                    <button className="row-action" type="button" onClick={() => setOpenOrderId(order.id)}>
                      <span className="cell-title">{String(order.orderNumber || order.orderReference || order.id)}</span>
                      <span className="cell-meta">{String(order.orderReference || "—")}</span>
                    </button>
                  </td>
                  <td><span className="cell-title">{String(order.customerEmail || "Ẩn email")}</span><span className="cell-meta">{String(order.sourceChannel || "web")}</span></td>
                  <td>{formatDate(order.createdAt, true)}</td>
                  <td><StatusBadge status={String(order.paymentStatus)} /></td>
                  <td><StatusBadge status={String(order.fulfillmentStatus)} /></td>
                  <td>{order.paymentStatus === "paid" ? <StatusBadge status="healthy" label="Thấp" /> : <StatusBadge status="warning" label="Rà soát" />}</td>
                  <td className="numeric">{shopMoney(order.totalMinor, String(order.currency || "VND"))}</td>
                  <td>
                    <div className="shop-product-actions">
                      <Button size="small" onClick={() => setOpenOrderId(order.id)}>Mở</Button>
                      {unpaid ? <Button size="small" variant="primary" onClick={() => setOpenOrderId(order.id)}>Duyệt TT</Button> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? <EmptyState title="Chưa có đơn hàng phù hợp." /> : null}
      <div className="pagination" data-shop-pagination="orders">
        <Button size="small" disabled={ordersPage.page <= 1} onClick={() => void applySearch(searchRef.current, ordersPage.page - 1)}>← Trước</Button>
        <span data-shop-page-label="orders">Trang {ordersPage.page} / {ordersPage.totalPages}</span>
        <Button size="small" disabled={ordersPage.page >= ordersPage.totalPages} onClick={() => void applySearch(searchRef.current, ordersPage.page + 1)}>Sau →</Button>
      </div>
      {openOrderId ? (
        <OrderDialog
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
          onSaved={async () => {
            await applySearch(searchRef.current, ordersPage.page);
            await loadOverview().catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}
