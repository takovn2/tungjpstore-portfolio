import { useEffect, useState } from "react";
import { shopApi } from "../api/client";
import { useShop } from "./useShop";
import { Button, EmptyState, StatusBadge } from "../ui/primitives";
import { useConfirm } from "../ui/Dialog";
import { useStatus } from "../ui/Toast";
import { shopMoney } from "../lib/format";
import { ProductDialog } from "./ProductDialog";
import { QuickCreateDialog } from "./QuickCreateDialog";
import { CategoryDialog } from "./CategoryDialog";
import { InventoryImportDialog } from "./InventoryImportDialog";

export function CatalogTab() {
  const {
    products, productsPage, categories, inventory, selectedProducts, setSelectedProducts,
    loadProducts, loadCategories, loadOverview,
  } = useShop();
  const status = useStatus();
  const confirm = useConfirm();
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ kind: "product" | "quick" | "category" | "import"; id?: string; variantId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadProducts().catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được sản phẩm.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = products.filter((product) => {
    if (statusFilter && product.status !== statusFilter) return false;
    if (query.trim()) {
      const haystack = `${product.slug} ${String(product.publicProduct?.title || "")} ${String(product.productType || "")}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const bulkAction = async (action: "archive" | "activate") => {
    const selected = [...selectedProducts];
    if (!selected.length) return;
    if (!(await confirm(
      action === "archive" ? "Lưu trữ sản phẩm đã chọn?" : "Mở bán sản phẩm đã chọn?",
      `${selected.length} sản phẩm sẽ được cập nhật.`,
      { danger: action === "archive" },
    ))) return;
    setBusy(true);
    try {
      const items = selected.map((id) => {
        const product = products.find((item) => item.id === id);
        return { id, expectedVersion: product?.version ?? 0 };
      }).filter((item) => item.expectedVersion >= 1);
      const result = await shopApi<{ results?: Array<{ id: string; ok: boolean; code?: string }> }>("products/bulk", {
        method: "POST",
        body: JSON.stringify({ action, items }),
      });
      const failures = (result.results || []).filter((item) => !item.ok);
      setSelectedProducts(new Set());
      status(failures.length
        ? `Đã xử lý ${selected.length - failures.length}/${selected.length}; ${failures.length} lỗi (${failures[0]?.code ?? "—"}).`
        : action === "archive" ? "Đã lưu trữ các sản phẩm đã chọn." : "Đã mở bán các sản phẩm đủ điều kiện.");
      await loadProducts(productsPage.page);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không xử lý được hàng loạt.", true);
    } finally {
      setBusy(false);
    }
  };

  const archiveProduct = async (id: string) => {
    const product = products.find((item) => item.id === id);
    if (!product || !(await confirm("Lưu trữ sản phẩm?", "Sản phẩm sẽ không còn xuất hiện trên storefront."))) return;
    try {
      await shopApi(`products/${encodeURIComponent(id)}/archive`, { method: "POST", body: JSON.stringify({ expectedVersion: product.version }) });
      status("Đã lưu trữ sản phẩm.");
      await loadProducts(productsPage.page);
    } catch (error) {
      status(error instanceof Error ? error.message : "Không lưu trữ được.", true);
    }
  };

  const importVariantFor = (product: (typeof products)[number]) => {
    const variants = Array.isArray(product.publicProduct?.variants) ? product.publicProduct?.variants as Array<Record<string, unknown>> : [];
    const inventoryRow = inventory.find((row) => row.productId === product.id || row.productSlug === product.slug || (row.sku && variants.some((variant) => variant.sku === row.sku)));
    return String(inventoryRow?.variantId || variants[0]?.id || "");
  };

  return (
    <div className="shop-panel" data-shop-panel="catalog">
      <div className="filter-bar">
        <label><strong>Tìm</strong><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="slug hoặc tên" /></label>
        <label><strong>Trạng thái</strong>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="draft">Bản nháp</option>
            <option value="active">Đang bán</option>
            <option value="archived">Lưu trữ</option>
          </select>
        </label>
        <span className="help">{productsPage.total} sản phẩm · trang {productsPage.page}/{productsPage.totalPages}</span>
        <div className="view-actions">
          <Button variant="primary" onClick={() => setDialog({ kind: "product" })}>+ Sản phẩm</Button>
          <Button onClick={() => setDialog({ kind: "quick" })}>Tạo nhanh</Button>
          <Button onClick={() => setDialog({ kind: "category" })}>+ Danh mục</Button>
        </div>
      </div>

      {selectedProducts.size > 0 ? (
        <div className="bulk-bar" data-shop-bulk="products">
          <span>{selectedProducts.size} đã chọn</span>
          <Button size="small" busy={busy} busyLabel="Đang lưu trữ…" onClick={() => void bulkAction("archive")}>Lưu trữ hàng loạt</Button>
          <Button size="small" variant="primary" busy={busy} busyLabel="Đang mở bán…" onClick={() => void bulkAction("activate")}>Mở bán hàng loạt</Button>
          <Button size="small" onClick={() => setSelectedProducts(new Set())}>Bỏ chọn</Button>
        </div>
      ) : null}

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th className="check-cell">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả"
                  checked={filtered.length > 0 && filtered.every((product) => selectedProducts.has(product.id))}
                  onChange={(event) => {
                    setSelectedProducts(event.target.checked ? new Set(filtered.map((product) => product.id)) : new Set());
                  }}
                />
              </th>
              <th>Sản phẩm</th><th>Trạng thái</th><th>Gói</th><th>Tồn</th><th className="numeric">Giá</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody data-shop-list="products">
            {filtered.map((product) => {
              const variants = Array.isArray(product.publicProduct?.variants) ? product.publicProduct?.variants as Array<Record<string, unknown>> : [];
              const minPrice = (product.publicProduct?.minPriceMinor as number | undefined) ?? (variants[0]?.priceMinor as number | undefined);
              const stock = variants.reduce((sum, item) => sum + Number(item.availableQuantity || 0), 0);
              const canImportKeys = (product.productType || "digital_key") === "digital_key";
              return (
                <tr key={product.id} data-shop-id={product.id}>
                  <td className="check-cell">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${product.slug}`}
                      checked={selectedProducts.has(product.id)}
                      onChange={(event) => {
                        const next = new Set(selectedProducts);
                        if (event.target.checked) next.add(product.id);
                        else next.delete(product.id);
                        setSelectedProducts(next);
                      }}
                    />
                  </td>
                  <td>
                    <button className="row-action" type="button" onClick={() => setDialog({ kind: "product", id: product.id })}>
                      <span className="cell-title">{String(product.publicProduct?.title || product.slug)}</span>
                      <span className="cell-meta">{product.slug} · {String(product.productType || "digital_key")}{product.publicProduct?.category ? ` · ${String(product.publicProduct.category)}` : ""}</span>
                    </button>
                  </td>
                  <td><StatusBadge status={product.status} /></td>
                  <td>{variants.length || "—"}</td>
                  <td>{variants.length ? stock : "—"}</td>
                  <td className="numeric">{shopMoney(minPrice, String((product.publicProduct?.currency as string) || variants[0]?.currency || "VND"))}</td>
                  <td>
                    <div className="shop-product-actions">
                      <Button size="small" onClick={() => setDialog({ kind: "product", id: product.id })}>Sửa</Button>
                      {canImportKeys ? (
                        <Button size="small" variant="primary" onClick={() => setDialog({ kind: "import", variantId: importVariantFor(product) })}>+ Key</Button>
                      ) : null}
                      <Button size="small" disabled={product.status === "archived"} onClick={() => void archiveProduct(product.id)}>Lưu trữ</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? <EmptyState title="Chưa có sản phẩm phù hợp." hint="Tạo nhanh một digital key để bắt đầu bán." /> : null}

      <div className="pagination" data-shop-pagination="products">
        <Button size="small" disabled={productsPage.page <= 1} onClick={() => void loadProducts(productsPage.page - 1)}>← Trước</Button>
        <span data-shop-page-label="products">Trang {productsPage.page} / {productsPage.totalPages}</span>
        <Button size="small" disabled={productsPage.page >= productsPage.totalPages} onClick={() => void loadProducts(productsPage.page + 1)}>Sau →</Button>
      </div>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Store taxonomy</p><h3>Danh mục chuẩn</h3></div>
          <Button size="small" onClick={() => setDialog({ kind: "category" })}>+ Tạo danh mục</Button>
        </div>
        <div className="shop-category-list" data-shop-list="categories">
          {categories.length ? categories.map((category) => {
            const title = category.localizations?.vi?.title || category.slug;
            const archived = category.status === "archived";
            const inUse = Number(category.usageCount || 0) > 0;
            return (
              <article className="shop-category-chip" data-state={archived ? "archived" : "active"} key={category.id}>
                <span>
                  <strong>{title}</strong>
                  <small>{category.slug} · {Number(category.usageCount || 0)} sản phẩm · {archived ? "đã lưu trữ" : "đang dùng"}</small>
                </span>
                <Button size="small" aria-label={`Sửa ${title}`} onClick={() => setDialog({ kind: "category", id: category.id })}>✎</Button>
                {archived ? null : (
                  <Button
                    size="small"
                    aria-label={inUse ? "Không thể lưu trữ danh mục đang được dùng" : `Lưu trữ ${title}`}
                    disabled={inUse}
                    onClick={async () => {
                      if (!(await confirm("Lưu trữ danh mục?", `Danh mục ${title} sẽ không còn xuất hiện trong bộ lọc mới.`))) return;
                      try {
                        await shopApi(`categories/${encodeURIComponent(category.id)}/archive`, { method: "POST", body: JSON.stringify({ expectedVersion: category.version }) });
                        status("Đã lưu trữ danh mục.");
                        await loadProducts(productsPage.page);
                      } catch (error) {
                        status(error instanceof Error ? error.message : "Không lưu trữ được danh mục.", true);
                      }
                    }}
                  >×</Button>
                )}
              </article>
            );
          }) : <span className="shop-category-empty">Chưa có danh mục chuẩn. Tạo danh mục trước khi gán sản phẩm để storefront không sinh bộ lọc trùng.</span>}
        </div>
      </section>

      {dialog?.kind === "product" ? (
        <ProductDialog
          productId={dialog.id ?? null}
          categories={categories}
          pricing={null}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await loadCategories();
            await loadOverview().catch(() => undefined);
          }}
        />
      ) : null}
      {dialog?.kind === "quick" ? (
        <QuickCreateDialog
          categories={categories}
          products={products}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await loadProducts(productsPage.page);
          }}
        />
      ) : null}
      {dialog?.kind === "category" ? (
        <CategoryDialog
          categoryId={dialog.id ?? null}
          categories={categories}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await loadCategories();
            await loadProducts(productsPage.page);
          }}
        />
      ) : null}
      {dialog?.kind === "import" ? (
        <InventoryImportDialog variantId={dialog.variantId || ""} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
