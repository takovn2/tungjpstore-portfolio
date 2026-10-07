import { useEffect, useState } from "react";
import { shopApi } from "../api/client";
import { useShop } from "./useShop";
import { Button, EmptyState, StatusBadge } from "../ui/primitives";
import { Dialog, useConfirm } from "../ui/Dialog";
import { useStatus } from "../ui/Toast";
import { formatDate, shopMoney } from "../lib/format";

type DiscountDetail = Record<string, any> & { id: string; code?: string; status: string; version?: number };

function DiscountDialog({ discountId, products, onClose, onSaved }: {
  discountId: string | null;
  products: Array<{ id: string; slug: string; publicProduct?: { title?: string } | null }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const status = useStatus();
  const [existing, setExisting] = useState<DiscountDetail | null>(null);
  const [loaded, setLoaded] = useState(!discountId);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    code: "", campaignName: "", type: "percentage", statusValue: "draft",
    percentValue: "10", fixedValue: "10000", minSubtotal: "0", maxDiscount: "",
    maxRedemptions: "", maxPerCustomer: "1", startsAt: "", endsAt: "",
  });
  const [productIds, setProductIds] = useState<string[]>([]);

  useEffect(() => {
    if (!discountId) return;
    void shopApi<{ discount?: DiscountDetail }>(`discounts/${encodeURIComponent(discountId)}`)
      .then((data) => {
        const discount = data.discount || null;
        setExisting(discount);
        if (discount) {
          const type = discount.type === "fixed_amount" ? "fixed_amount" : "percentage";
          setValues({
            code: String(discount.code || ""),
            campaignName: String(discount.metadata?.campaignName || ""),
            type,
            statusValue: String(discount.status || "draft"),
            percentValue: type === "percentage" ? String(Number(discount.value || 1000) / 100) : "10",
            fixedValue: type === "fixed_amount" ? String(Number(discount.value || 10000)) : "10000",
            minSubtotal: String(discount.minimumSubtotalMinor ?? 0),
            maxDiscount: discount.maximumDiscountMinor == null ? "" : String(discount.maximumDiscountMinor),
            maxRedemptions: discount.maximumRedemptions == null ? "" : String(discount.maximumRedemptions),
            maxPerCustomer: String(discount.maximumPerCustomer ?? 1),
            startsAt: discount.startsAt ? String(discount.startsAt).slice(0, 16) : "",
            endsAt: discount.endsAt ? String(discount.endsAt).slice(0, 16) : "",
          });
          setProductIds(Array.isArray(discount.productIds) ? discount.productIds.map(String) : []);
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được khuyến mãi."))
      .finally(() => setLoaded(true));
  }, [discountId]);

  const toIso = (value: string) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };

  const submit = async () => {
    try {
      const type = values.type === "fixed_amount" ? "fixed_amount" : "percentage";
      const value = type === "percentage" ? Math.round(Number(values.percentValue) * 100) : Math.floor(Number(values.fixedValue));
      if (!Number.isSafeInteger(value) || value < 1) throw new Error("Giá trị giảm không hợp lệ.");
      if (type === "percentage" && value > 10_000) throw new Error("Phần trăm tối đa 100%.");
      const payload = {
        code: values.code.trim().toUpperCase(),
        status: values.statusValue,
        type,
        value,
        currency: type === "fixed_amount" ? "USD" : null,
        minimumSubtotalMinor: Number(values.minSubtotal || 0) || 0,
        maximumDiscountMinor: values.maxDiscount === "" ? null : Number(values.maxDiscount),
        maximumRedemptions: values.maxRedemptions === "" ? null : Number(values.maxRedemptions),
        maximumPerCustomer: values.maxPerCustomer === "" ? null : Number(values.maxPerCustomer),
        stackable: false,
        startsAt: toIso(values.startsAt),
        endsAt: toIso(values.endsAt),
        productIds,
        variantIds: [],
        metadata: { campaignName: values.campaignName.trim() || values.code.trim().toUpperCase() },
      };
      if (existing?.id) await shopApi(`discounts/${encodeURIComponent(existing.id)}`, { method: "PUT", body: JSON.stringify(payload) });
      else await shopApi("discounts", { method: "POST", body: JSON.stringify(payload) });
      status(existing ? "Đã cập nhật khuyến mãi." : "Đã tạo khuyến mãi.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được khuyến mãi.");
      throw err;
    }
  };

  if (!loaded) {
    return <Dialog title="Đang tải khuyến mãi…" onClose={onClose}><p className="help">Đang tải dữ liệu.</p></Dialog>;
  }

  return (
    <Dialog title={existing ? "Sửa khuyến mãi" : "Tạo khuyến mãi"} onClose={onClose} onSubmit={submit} submitLabel={existing ? "Lưu khuyến mãi" : "Tạo khuyến mãi"} busyLabel="Đang lưu…" eyebrow="Promotion">
      {error ? <div className="publish-errors" role="alert"><h2>Chưa thể lưu</h2><ul><li>{error}</li></ul></div> : null}
      <div className="grid2">
        <label><strong>Mã giảm *</strong><input maxLength={40} style={{ textTransform: "uppercase" }} value={values.code} onChange={(event) => setValues({ ...values, code: event.target.value })} placeholder="SALE10" /></label>
        <label><strong>Tên chiến dịch</strong><input maxLength={120} value={values.campaignName} onChange={(event) => setValues({ ...values, campaignName: event.target.value })} placeholder="Giảm 10% toàn shop" /></label>
      </div>
      <div className="grid2">
        <label><strong>Loại giảm *</strong>
          <select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value })}>
            <option value="percentage">% phần trăm</option>
            <option value="fixed_amount">Số tiền cố định (VND)</option>
          </select>
        </label>
        <label><strong>Trạng thái</strong>
          <select value={values.statusValue} onChange={(event) => setValues({ ...values, statusValue: event.target.value })}>
            <option value="draft">Nháp</option>
            <option value="active">Đang chạy</option>
            <option value="paused">Tạm dừng</option>
            <option value="archived">Lưu trữ</option>
          </select>
        </label>
      </div>
      <div className="grid2">
        {values.type === "percentage" ? (
          <label><strong>Giá trị % *</strong><input type="number" min={1} max={100} step={0.5} value={values.percentValue} onChange={(event) => setValues({ ...values, percentValue: event.target.value })} /><small className="help">Ví dụ 10 = giảm 10%</small></label>
        ) : (
          <label><strong>Số tiền giảm (VND) *</strong><input type="number" min={1000} step={1000} value={values.fixedValue} onChange={(event) => setValues({ ...values, fixedValue: event.target.value })} /><small className="help">Ví dụ 20000 = 20.000₫</small></label>
        )}
        <label><strong>Đơn tối thiểu (VND)</strong><input type="number" min={0} step={1000} value={values.minSubtotal} onChange={(event) => setValues({ ...values, minSubtotal: event.target.value })} /></label>
      </div>
      <div className="grid2">
        {values.type === "percentage" ? (
          <label><strong>Trần giảm (VND)</strong><input type="number" min={0} step={1000} value={values.maxDiscount} placeholder="Không giới hạn" onChange={(event) => setValues({ ...values, maxDiscount: event.target.value })} /></label>
        ) : null}
        <label><strong>Tổng lượt dùng</strong><input type="number" min={1} value={values.maxRedemptions} placeholder="Không giới hạn" onChange={(event) => setValues({ ...values, maxRedemptions: event.target.value })} /></label>
        <label><strong>Lượt / khách *</strong><input type="number" min={1} max={100} value={values.maxPerCustomer} onChange={(event) => setValues({ ...values, maxPerCustomer: event.target.value })} /><small className="help">Bắt buộc khi kích hoạt.</small></label>
      </div>
      <div className="grid2">
        <label><strong>Bắt đầu</strong><input type="datetime-local" value={values.startsAt} onChange={(event) => setValues({ ...values, startsAt: event.target.value })} /></label>
        <label><strong>Kết thúc</strong><input type="datetime-local" value={values.endsAt} onChange={(event) => setValues({ ...values, endsAt: event.target.value })} /></label>
      </div>
      <label><strong>Áp dụng sản phẩm (tuỳ chọn)</strong>
        <select multiple size={6} value={productIds} onChange={(event) => setProductIds([...event.target.selectedOptions].map((option) => option.value))}>
          {products.length ? products.map((product) => (
            <option key={product.id} value={product.id}>{String(product.publicProduct?.title || product.slug || product.id)}</option>
          )) : <option disabled>Chưa có sản phẩm</option>}
        </select>
        <small className="help">Để trống = toàn shop. Giữ Cmd/Ctrl để chọn nhiều.</small>
      </label>
      <p className="help">Mỗi đơn chỉ được dùng một mã giảm giá. Xếp chồng mã luôn bị tắt để tổng tiền có một nguồn tính duy nhất.</p>
    </Dialog>
  );
}

export function DiscountsTab() {
  const { discounts, affiliates, commissions, products, loadDiscounts, loadAffiliates, loadProducts } = useShop();
  const status = useStatus();
  const confirm = useConfirm();
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogId, setDialogId] = useState<string | null | undefined>(undefined);
  const [affiliateForm, setAffiliateForm] = useState({ code: "", displayName: "", commissionBps: "0" });

  useEffect(() => {
    void loadDiscounts().catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được khuyến mãi.", true));
    void loadAffiliates();
    if (products.length === 0) void loadProducts().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = discounts.filter((row) => {
    const now = Date.now();
    if (statusFilter === "active" && row.status !== "active") return false;
    if (statusFilter === "disabled" && !["paused", "draft", "archived"].includes(row.status)) return false;
    if (statusFilter === "scheduled" && !(row.status === "active" && row.startsAt && Date.parse(String(row.startsAt)) > now)) return false;
    if (statusFilter === "expired" && !(row.endsAt && Date.parse(String(row.endsAt)) < now)) return false;
    return true;
  });

  return (
    <div className="shop-panel" data-shop-panel="discounts">
      <div className="filter-bar">
        <label><strong>Trạng thái</strong>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="active">Đang chạy</option>
            <option value="disabled">Tạm dừng / nháp</option>
            <option value="scheduled">Đã lên lịch</option>
            <option value="expired">Đã hết hạn</option>
          </select>
        </label>
        <div className="view-actions">
          <Button variant="primary" onClick={() => setDialogId(null)}>+ Khuyến mãi</Button>
          <Button onClick={() => void loadAffiliates()}>Làm mới affiliates</Button>
        </div>
      </div>
      <div className="table-shell">
        <table>
          <thead><tr><th>Chiến dịch</th><th>Mã</th><th>Giá trị</th><th>Điều kiện</th><th>Đã dùng</th><th>Cửa sổ</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody data-shop-list="discounts">
            {filtered.map((row) => {
              const valueLabel = row.type === "percentage"
                ? `${(Number(row.value || 0) / 100).toFixed(Number(row.value || 0) % 100 === 0 ? 0 : 1)}%`
                : shopMoney(row.value, String(row.currency || "VND"));
              const conditions = [
                Number(row.minimumSubtotalMinor || 0) > 0 ? `Đơn ≥ ${shopMoney(row.minimumSubtotalMinor, String(row.currency || "VND"))}` : "",
                row.maximumDiscountMinor != null ? `Trần ${shopMoney(row.maximumDiscountMinor, String(row.currency || "VND"))}` : "",
                Number(row.productTargetCount || 0) + Number(row.variantTargetCount || 0) > 0
                  ? `${Number(row.productTargetCount || 0)} SP · ${Number(row.variantTargetCount || 0)} biến thể`
                  : "Toàn shop",
              ].filter(Boolean).join(" · ") || "—";
              const windowLabel = [row.startsAt ? formatDate(row.startsAt, true) : "∞", row.endsAt ? formatDate(row.endsAt, true) : "∞"].join(" → ");
              const used = `${Number(row.redeemedCount || 0)}${row.maximumRedemptions != null ? ` / ${Number(row.maximumRedemptions)}` : ""}`;
              return (
                <tr key={row.id} data-shop-id={row.id}>
                  <td><span className="cell-title">{String((row.metadata as Record<string, any>)?.campaignName || row.code || "—")}</span><span className="cell-meta">{row.type === "percentage" ? "Phần trăm" : "Số tiền cố định"}</span></td>
                  <td><code>{String(row.code || "—")}</code></td>
                  <td>{valueLabel}</td>
                  <td>{conditions}</td>
                  <td>{used}</td>
                  <td className="cell-meta">{windowLabel}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>
                    <div className="shop-product-actions">
                      <Button size="small" onClick={() => setDialogId(row.id)}>Sửa</Button>
                      <Button
                        size="small"
                        disabled={row.status === "archived"}
                        onClick={async () => {
                          if (!(await confirm("Lưu trữ khuyến mãi?", `Mã ${String(row.code)} sẽ ngừng áp dụng.`))) return;
                          try {
                            await shopApi(`discounts/${encodeURIComponent(row.id)}/archive`, { method: "POST", body: JSON.stringify({}) });
                            status("Đã lưu trữ khuyến mãi.");
                            await loadDiscounts();
                          } catch (error) {
                            status(error instanceof Error ? error.message : "Không lưu trữ được.", true);
                          }
                        }}
                      >
                        Lưu trữ
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? <EmptyState title="Chưa có khuyến mãi." /> : null}

      <div className="grid2">
        <section className="section-card">
          <div className="section-heading"><div><p className="eyebrow">Affiliates</p><h3>Đối tác</h3></div></div>
          <form className="form" onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            try {
              await shopApi("affiliates", {
                method: "POST",
                body: JSON.stringify({
                  code: affiliateForm.code,
                  displayName: affiliateForm.displayName,
                  commissionBps: Number(affiliateForm.commissionBps || 0),
                }),
              });
              form.reset();
              setAffiliateForm({ code: "", displayName: "", commissionBps: "0" });
              status("Đã thêm affiliate partner.");
              await loadAffiliates();
            } catch (error) {
              status(error instanceof Error ? error.message : "Không tạo được partner.", true);
            }
          }}>
            <div className="grid3">
              <label><strong>Mã</strong><input required value={affiliateForm.code} onChange={(event) => setAffiliateForm({ ...affiliateForm, code: event.target.value })} /></label>
              <label><strong>Tên hiển thị</strong><input required value={affiliateForm.displayName} onChange={(event) => setAffiliateForm({ ...affiliateForm, displayName: event.target.value })} /></label>
              <label><strong>Hoa hồng (bps)</strong><input type="number" min={0} max={5000} value={affiliateForm.commissionBps} onChange={(event) => setAffiliateForm({ ...affiliateForm, commissionBps: event.target.value })} /></label>
            </div>
            <button type="submit" className="button secondary">Thêm partner</button>
          </form>
          <div className="table-shell">
            <table>
              <thead><tr><th>Mã</th><th>Tên</th><th>Hoa hồng</th><th>Trạng thái</th></tr></thead>
              <tbody data-shop-list="affiliates">
                {affiliates.map((partner, index) => (
                  <tr key={index}>
                    <td><span className="masked-key">{String(partner.code)}</span></td>
                    <td>{String(partner.displayName || "—")}</td>
                    <td>{String(partner.commissionBps ?? 0)} bps</td>
                    <td><StatusBadge status={String(partner.status || "active")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {affiliates.length === 0 ? <EmptyState title="Chưa có affiliate partner." /> : null}
        </section>
        <section className="section-card">
          <div className="section-heading"><div><p className="eyebrow">Commissions</p><h3>Hoa hồng tích lũy</h3></div></div>
          <div className="table-shell">
            <table>
              <thead><tr><th>Ngày</th><th>Mã</th><th className="numeric">Đơn</th><th className="numeric">Hoa hồng</th><th>Trạng thái</th></tr></thead>
              <tbody data-shop-list="commissions">
                {commissions.map((row, index) => (
                  <tr key={index}>
                    <td><span className="cell-meta">{String(row.createdAt || "—")}</span></td>
                    <td><code>{String(row.partnerCode || "—")}</code></td>
                    <td className="numeric">{shopMoney(row.orderTotalMinor, String(row.currency || "VND"))}</td>
                    <td className="numeric">{shopMoney(row.commissionMinor, String(row.currency || "VND"))} <span className="cell-meta">({String(row.commissionBps || 0)}bps)</span></td>
                    <td><StatusBadge status={String(row.status || "accrued")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {commissions.length === 0 ? <EmptyState title="Chưa có hoa hồng." /> : null}
        </section>
      </div>

      {dialogId !== undefined ? (
        <DiscountDialog
          discountId={dialogId}
          products={products}
          onClose={() => setDialogId(undefined)}
          onSaved={loadDiscounts}
        />
      ) : null}
    </div>
  );
}
