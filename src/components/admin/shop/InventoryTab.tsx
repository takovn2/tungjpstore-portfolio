import { useEffect, useState } from "react";
import { useShop } from "./useShop";
import { Button, EmptyState, MaskedKey, StatusBadge } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { downloadCsv, formatDate } from "../lib/format";
import { InventoryImportDialog } from "./InventoryImportDialog";

export function InventoryTab() {
  const { inventory, inventoryCryptoReady, loadInventory } = useShop();
  const status = useStatus();
  const [statusFilter, setStatusFilter] = useState("");
  const [importVariantId, setImportVariantId] = useState<string | null>(null);

  useEffect(() => {
    void loadInventory().catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được kho.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = inventory.filter((row) => {
    const available = Number(row.availableCount || 0);
    const threshold = Number(row.lowStockThreshold ?? 3);
    if (row.inventoryPolicy === "unlimited") return statusFilter !== "low" && statusFilter !== "empty";
    if (statusFilter === "healthy") return available > threshold;
    if (statusFilter === "low") return available > 0 && available <= threshold;
    if (statusFilter === "empty") return available <= 0;
    return true;
  });

  const thresholds = inventory.map((row) => Number(row.lowStockThreshold ?? 3));
  const totals = inventory.reduce((acc, row) => ({
    available: acc.available + Number(row.availableCount || 0),
    reserved: acc.reserved + Number(row.reservedCount || 0),
    delivered: acc.delivered + Number(row.fulfilledCount || 0),
    revoked: acc.revoked + Number(row.blockedCount || 0),
  }), { available: 0, reserved: 0, delivered: 0, revoked: 0 });
  const latestImport = inventory
    .filter((row) => row.lastImportedAt)
    .sort((left, right) => String(right.lastImportedAt).localeCompare(String(left.lastImportedAt)))[0];

  return (
    <div className="shop-panel" data-shop-panel="inventory">
      <div className="filter-bar">
        <label><strong>Trạng thái kho</strong>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="healthy">Đủ hàng</option>
            <option value="low">Sắp hết</option>
            <option value="empty">Hết hàng</option>
          </select>
        </label>
        <span className="help">
          Ngưỡng {thresholds.length ? `${Math.min(...thresholds)}–${Math.max(...thresholds)}` : "Theo từng biến thể"}
          {" · "}Nhập cuối: {latestImport ? `${formatDate(latestImport.lastImportedAt, true)} · ${Number(latestImport.lastImportCount || 0)} key` : "Chưa có dữ liệu"}
        </span>
        <div className="view-actions">
          <Button variant="primary" onClick={() => setImportVariantId("")}>+ Nhập key</Button>
          <Button onClick={() => downloadCsv(`tung-inventory-${new Date().toISOString().slice(0, 10)}.csv`, ["variantId", "sku", "availableCount", "reservedCount", "fulfilledCount", "blockedCount"], inventory.map((row) => [row.variantId, row.sku, row.availableCount, row.reservedCount, row.fulfilledCount, row.blockedCount]))}>Xuất CSV</Button>
        </div>
      </div>
      <div className={`shop-crypto-readiness${inventoryCryptoReady ? "" : " blocked"}`} data-state={inventoryCryptoReady ? "ready" : "blocked"}>
        <div>
          <strong>{inventoryCryptoReady ? "Kho mã hóa sẵn sàng" : "Kho mã hóa chưa cấu hình"}</strong>
          <p>{totals.available} khả dụng · {totals.reserved} giữ chỗ · {totals.delivered} đã giao · {totals.revoked} đã khoá.</p>
        </div>
      </div>
      <div className="table-shell">
        <table>
          <thead><tr><th>Biến thể</th><th>SKU</th><th>Tồn</th><th>Giữ chỗ</th><th>Đã giao</th><th>Ngưỡng</th><th>Nhập cuối</th><th></th></tr></thead>
          <tbody data-shop-list="inventory">
            {filtered.map((row) => {
              const available = Number(row.availableCount || 0);
              const threshold = Number(row.lowStockThreshold ?? 3);
              const stateName = row.inventoryPolicy === "unlimited" ? "healthy" : available <= 0 ? "empty" : available <= threshold ? "low" : "healthy";
              const eligible = row.inventoryImportEligible !== false;
              return (
                <tr key={String(row.variantId)} data-shop-id={String(row.variantId)}>
                  <td><span className="cell-title">{String(row.productTitle || row.variantTitle || row.sku || row.variantId)}</span><span className="cell-meta">{String(row.variantTitle || row.sku || row.variantId)}</span></td>
                  <td><MaskedKey value={String(row.sku || "—")} /></td>
                  <td>
                    <StatusBadge status={stateName} label={row.inventoryPolicy === "unlimited" ? "Không giới hạn" : String(available)} />
                    <span className="cell-meta">{row.inventoryPolicy === "unlimited" ? "Không giới hạn" : available}</span>
                  </td>
                  <td>{String(row.reservedCount ?? 0)}</td>
                  <td>{String(row.fulfilledCount ?? 0)}</td>
                  <td>{String(threshold)}</td>
                  <td>
                    {formatDate(row.lastImportedAt, true)}
                    {row.lastImportBatchId ? <span className="cell-meta">{String(row.lastImportBatchId)}{row.lastImportCount ? ` · ${Number(row.lastImportCount)} key` : ""}</span> : null}
                  </td>
                  <td>
                    <button
                      className="row-action"
                      type="button"
                      disabled={!eligible}
                      title={eligible ? undefined : "Chỉ variant license key tracked mới nhận nhập kho"}
                      onClick={() => setImportVariantId(String(row.variantId))}
                    >
                      {eligible ? "Nhập key" : "Không nhận key"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? <EmptyState title="Chưa có biến thể tracked nào." hint="Chỉ sản phẩm digital key có biến thể nhận kho." /> : null}
      {importVariantId !== null ? <InventoryImportDialog variantId={importVariantId} onClose={() => setImportVariantId(null)} /> : null}
    </div>
  );
}
