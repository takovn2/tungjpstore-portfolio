import { useMemo, useState } from "react";
import { shopApi } from "../api/client";
import { Dialog } from "../ui/Dialog";
import { Button, StatusBadge, Tabs } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { parseInventorySource, shopMaskKey, type InventorySourceRow } from "../lib/format";
import { sha256Base64Url } from "../lib/crypto";
import { useShop } from "./useShop";

/**
 * Two-step key import: server-side preview (dedupe + validation), then
 * chunked commits of 25 keys per batch. Keys never render in clear text.
 */
export function InventoryImportDialog({ variantId, onClose }: { variantId: string; onClose: () => void }) {
  const { inventory, inventoryCryptoReady, loadInventory, loadOverview } = useShop();
  const status = useStatus();
  const cryptoReady = inventoryCryptoReady === true;
  const [variant, setVariant] = useState(variantId || "");
  const [source, setSource] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("pasted.txt");
  const [fileText, setFileText] = useState("");
  const [rows, setRows] = useState<InventorySourceRow[]>([]);
  const [preview, setPreview] = useState<{ batchId: string; variantId: string } | null>(null);
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importable = useMemo(() => inventory.filter((row) => row.inventoryImportEligible !== false), [inventory]);
  const quickKeys = typeof window !== "undefined" ? (window as unknown as { __shopQuickKeys?: string }).__shopQuickKeys : undefined;
  const effectiveText = quickKeys && !text ? quickKeys : text;

  const raw = source === "file" ? fileText : effectiveText;
  const parsedFormat = source === "file" && fileName.toLowerCase().endsWith(".csv") ? "csv" : "txt";

  const runPreview = async () => {
    setError(null);
    if (!cryptoReady) throw new Error("Chưa cấu hình khóa mã hóa Worker. Hãy cấu hình lại trước khi dán hoặc tải file chứa key.");
    const selectedVariant = variant.trim();
    if (!selectedVariant) throw new Error("Cần chọn biến thể đích.");
    if (!raw) throw new Error("Hãy dán key hoặc chọn file trước.");
    const pending = parseInventorySource(raw, parsedFormat);
    if (!pending.length) throw new Error("Nguồn nhập không có dòng key nào.");
    const sourceHash = await sha256Base64Url(raw);
    const response = await shopApi<{ preview?: { batchId?: string; rows?: Array<Record<string, unknown>>; duplicateInFileCount?: number; duplicateInStockCount?: number; invalidCount?: number } }>("inventory/preview", {
      method: "POST",
      body: JSON.stringify({
        variantId: selectedVariant,
        rows: pending.map((row) => row.key),
        sourceFormat: parsedFormat,
        sourceName: source === "file" ? fileName : "pasted.txt",
        sourceHash,
        idempotencyKey: `inventory-preview:${crypto.randomUUID()}`,
      }),
    });
    const remoteRows = response.preview?.rows || [];
    if (remoteRows.length !== pending.length) throw new Error("Preview kho trả về số dòng không khớp nguồn nhập.");
    const merged = pending.map((row, index) => ({ ...row, ...(remoteRows[index] as Record<string, unknown>) }));
    setRows(merged);
    setPreview({ batchId: String(response.preview?.batchId || ""), variantId: selectedVariant });
    const ready = merged.filter((row) => row.status === "valid");
    status(ready.length ? `Đã kiểm tra: ${ready.length} key có thể nhập.` : "Không có key hợp lệ để nhập.");
    return true;
  };

  const commit = async () => {
    if (!preview) return;
    const readyRows = rows.filter((row) => row.status === "valid");
    if (!readyRows.length) return;
    if (preview.variantId !== variant) throw new Error("Biến thể hoặc nguồn nhập đã thay đổi. Hãy kiểm tra lại dữ liệu.");
    const chunks = new Map<number, InventorySourceRow[]>();
    for (const row of readyRows) {
      const chunkIndex = Number((row as { chunkIndex?: number }).chunkIndex);
      if (!Number.isInteger(chunkIndex)) throw new Error("Preview thiếu chỉ số lô nhập.");
      const group = chunks.get(chunkIndex) || [];
      group.push(row);
      chunks.set(chunkIndex, group);
    }
    const ordered = [...chunks.entries()].sort(([left], [right]) => left - right);
    setProgress({ label: `Đang nhập ${readyRows.length} key theo ${ordered.length} lô…`, percent: 0 });
    let importedCount = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const [chunkIndex, chunkRows] = ordered[index];
      const response = await shopApi<{ inventory?: { batchImportedCount?: number } }>("inventory/commit", {
        method: "POST",
        body: JSON.stringify({ batchId: preview.batchId, chunkIndex, rows: chunkRows.map((row) => ({ lineNumber: row.lineNumber, key: row.key })) }),
      });
      importedCount = Number(response.inventory?.batchImportedCount ?? importedCount + chunkRows.length);
      setProgress({ label: `Đã xử lý ${index + 1}/${ordered.length} lô · ${importedCount} key trong kho`, percent: Math.round(((index + 1) / ordered.length) * 100) });
    }
    (window as unknown as { __shopQuickKeys?: string }).__shopQuickKeys = undefined;
    status(`Đã nhập ${importedCount} key theo ${ordered.length} lô và mã hóa trong kho.`);
    await loadInventory();
    await loadOverview().catch(() => undefined);
  };

  const submit = async () => {
    try {
      if (!preview) {
        await runPreview();
        return true;
      }
      await commit();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không nhập được key.");
      throw err;
    }
  };

  const readyCount = rows.filter((row) => row.status === "valid").length;

  return (
    <Dialog
      title="Nhập kho key theo lô"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={preview ? (readyCount ? `Nhập ${readyCount} key` : "Đóng") : "Kiểm tra dữ liệu"}
      busyLabel="Đang xử lý…"
      wide
    >
      <div className={`shop-crypto-readiness${cryptoReady ? "" : " blocked"}`} role={cryptoReady ? "status" : "alert"} data-state={cryptoReady ? "ready" : "blocked"}>
        <div>
          <strong>{cryptoReady ? "Kho mã hóa đã sẵn sàng" : "Kho mã hóa chưa sẵn sàng"}</strong>
          <p>{cryptoReady ? "Mã hóa sẵn sàng — có thể nạp key." : "Chưa cấu hình khóa mã hóa Worker. Hãy cấu hình lại trước khi dán hoặc tải file chứa key."}</p>
        </div>
      </div>
      {error ? <div className="publish-errors" role="alert"><h2>Chưa thể nhập key</h2><ul><li>{error}</li></ul></div> : null}
      <div className="shop-import-layout">
        <div className="shop-import-main">
          <label><strong>Chọn gói / SKU</strong>
            <select value={variant} onChange={(event) => { setVariant(event.target.value); setPreview(null); }} disabled={!cryptoReady} required>
              <option value="">Chọn…</option>
              {importable.map((row) => (
                <option key={String(row.variantId)} value={String(row.variantId)}>
                  {String(row.productTitle || row.sku || row.variantId)} · {String(row.variantTitle || row.sku || "variant")} · còn {Number(row.availableCount || 0)}
                </option>
              ))}
            </select>
          </label>
          <Tabs
            label="Nguồn nhập"
            active={source}
            onChange={(key) => { setSource(key as "paste" | "file"); setPreview(null); }}
            items={[{ key: "paste", label: "Dán" }, { key: "file", label: "File" }]}
          />
          {source === "paste" ? (
            <label><strong>Danh sách key</strong><textarea rows={10} placeholder="email|pass|2fa — mỗi dòng một key" value={effectiveText} onChange={(event) => { setText(event.target.value); setPreview(null); }} disabled={!cryptoReady} /></label>
          ) : (
            <div>
              <label className="shop-import-dropzone">
                <strong>Thả CSV/TXT</strong>
                <small>Tối đa 500 dòng</small>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  disabled={!cryptoReady}
                  onChange={async (event) => {
                    setPreview(null);
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!/\.(?:csv|txt)$/i.test(file.name)) {
                      setError("Chỉ chấp nhận file .csv hoặc .txt.");
                      return;
                    }
                    if (file.size > 512 * 1024) {
                      setError("File vượt quá giới hạn 512 KB.");
                      return;
                    }
                    setFileName(file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "inventory.txt");
                    setFileText(await file.text());
                    setError(null);
                  }}
                />
              </label>
              <p className="help">{fileName} · {fileText.length.toLocaleString("vi-VN")} bytes</p>
            </div>
          )}
          {rows.length ? (
            <div className="shop-import-preview">
              <div className="shop-import-stats">
                <span><b>{readyCount}</b><small>Hợp lệ</small></span>
                <span><b>{rows.filter((row) => row.status === "duplicate_in_file" || row.status === "already_in_stock").length}</b><small>Trùng</small></span>
                <span><b>{rows.filter((row) => row.status === "invalid").length}</b><small>Lỗi</small></span>
              </div>
              <div className="table-shell">
                <table>
                  <thead><tr><th>Dòng</th><th>Key đã che</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.lineNumber}>
                        <td>{row.lineNumber}</td>
                        <td className="mono">{row.maskedKey || shopMaskKey(row.key)}</td>
                        <td><StatusBadge status={row.status === "valid" || row.status === "ready" ? "healthy" : row.status === "invalid" ? "failed" : "warning"} label={String(row.status)} /></td>
                        <td>{String((row as { reason?: string; errorCode?: string }).reason || (row as { errorCode?: string }).errorCode || "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <div className="empty">Chưa preview.</div>}
          {progress ? (
            <div className="shop-import-progress">
              <strong>{progress.label}</strong>
              <progress max={100} value={progress.percent} />
            </div>
          ) : null}
        </div>
        <aside className="shop-import-side">
          <section className="shop-readiness">
            <h3>Ghi chú</h3>
            <ul className="shop-readiness-list">
              <li>1 dòng = 1 key</li>
              <li>Nhập theo lô 25</li>
              <li>Mã hóa tại Worker</li>
            </ul>
          </section>
        </aside>
      </div>
    </Dialog>
  );
}
