import { useState } from "react";
import { shopApi } from "../api/client";
import { Dialog, useConfirm } from "../ui/Dialog";
import { CoverPicker, type CoverValue } from "../ui/CoverPicker";
import { useStatus } from "../ui/Toast";
import { slugify } from "../lib/format";
import { useShop, type CategoryRow, type ProductRow } from "./useShop";
import { InventoryImportDialog } from "./InventoryImportDialog";

/** Fast lane for digital-key products: title + price + optional pasted keys. */
export function QuickCreateDialog({ categories, products, onClose, onSaved }: {
  categories: CategoryRow[];
  products: ProductRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const status = useStatus();
  const confirm = useConfirm();
  const { loadOverview } = useShop();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("40000");
  const [sku, setSku] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [activate, setActivate] = useState(false);
  const [keys, setKeys] = useState("");
  const [cover, setCover] = useState<CoverValue>({ url: "", alt: "", mediaId: "", rowId: "" });
  const [error, setError] = useState<string | null>(null);
  const [importVariantId, setImportVariantId] = useState<string | null>(null);

  const submit = async () => {
    const trimmedTitle = title.trim();
    const priceValue = Number(price);
    if (!trimmedTitle || !Number.isSafeInteger(priceValue) || priceValue < 0) throw new Error("Cần tên sản phẩm và giá VND hợp lệ.");
    const slugBase = slugify(trimmedTitle) || "product";
    let finalSlug = slugBase;
    let n = 2;
    while (products.some((product) => product.slug === finalSlug)) {
      finalSlug = `${slugBase}-${n++}`;
    }
    const finalSku = (sku.trim() || `${slugBase.replace(/-/g, "").toUpperCase().slice(0, 16)}-1M`).toUpperCase().replace(/[^A-Z0-9-]/g, "-");
    const category = categories.find((item) => item.slug === categorySlug);
    const metadata: Record<string, unknown> = {};
    if (category) {
      metadata.category = category.localizations?.vi?.title || categorySlug;
      metadata.categorySlug = categorySlug;
    }
    const localization = {
      title: trimmedTitle, eyebrow: "Digital key",
      shortDescription: `${trimmedTitle} · gói 1 tháng`,
      description: `${trimmedTitle}. Gói digital key 1 tháng, bàn giao sau khi thanh toán được xác minh.`,
      seoTitle: `${trimmedTitle} — TUNG Shop`,
      seoDescription: `Mua ${trimmedTitle} digital key 1 tháng tại TUNG Shop.`,
    };
    const payload = {
      slug: finalSlug,
      status: activate ? "active" : "draft",
      productType: "digital_key",
      featured: false,
      sortOrder: 0,
      defaultLocale: "vi",
      coverMediaId: null,
      metadata,
      localizations: activate
        ? {
          vi: localization,
          en: { ...localization, shortDescription: `${trimmedTitle} · 1-month package`, description: `${trimmedTitle}. One-month digital key package delivered after verified payment.`, seoTitle: `${trimmedTitle} — TUNG Shop`, seoDescription: `Buy ${trimmedTitle} 1-month digital key at TUNG Shop.` },
          ja: { ...localization, eyebrow: "デジタルキー", shortDescription: `${trimmedTitle} · 1か月`, description: `${trimmedTitle}。支払い確認後に届く1か月デジタルキー。`, seoTitle: `${trimmedTitle} — TUNG Shop`, seoDescription: `${trimmedTitle} の1か月デジタルキー。` },
          zh: { ...localization, eyebrow: "数字密钥", shortDescription: `${trimmedTitle} · 一个月`, description: `${trimmedTitle}。支付验证后交付的一个月数字密钥套餐。`, seoTitle: `${trimmedTitle} — TUNG Shop`, seoDescription: `在 TUNG Shop 购买 ${trimmedTitle} 一个月数字密钥。` },
        }
        : { vi: localization },
      variants: [{
        sku: finalSku,
        status: activate ? "active" : "draft",
        fulfillmentType: "license_key",
        deliveryMode: "automatic",
        inventoryPolicy: "tracked",
        priceMinor: priceValue,
        compareAtMinor: null,
        currency: "VND",
        lowStockThreshold: 3,
        maxPerOrder: 10,
        optionValues: {},
        metadata: {},
        localizations: {
          vi: { title: "Gói 1 tháng", optionSummary: "1 tháng" },
          ...(activate ? { en: { title: "1-month package", optionSummary: "1 month" }, ja: { title: "1か月パッケージ", optionSummary: "1か月" }, zh: { title: "一个月套餐", optionSummary: "一个月" } } : {}),
        },
      }],
      media: cover.url ? [{ type: "image", url: cover.url, alt: cover.alt || `Ảnh bìa ${trimmedTitle}`, sortOrder: 0 }] : [],
    };
    try {
      const created = await shopApi<{ product?: { variants?: Array<{ id?: string }> } }>("products", { method: "POST", body: JSON.stringify(payload) });
      const variantId = created.product?.variants?.[0]?.id || "";
      status(activate ? `Đã tạo và mở bán "${trimmedTitle}".` : `Đã tạo bản nháp "${trimmedTitle}".`);
      await onSaved();
      await loadOverview().catch(() => undefined);
      if (keys.trim() && variantId) {
        setImportVariantId(variantId);
        setError(null);
        // Hand the pasted keys straight to the import dialog.
        (window as unknown as { __shopQuickKeys?: string }).__shopQuickKeys = keys;
        return true;
      }
      if (variantId) {
        const goImport = await confirm("Nhập key ngay?", "Sản phẩm digital key cần kho trước khi bán. Mở nhập key?", { danger: false });
        if (goImport) {
          setImportVariantId(variantId);
          return true;
        }
      }
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được sản phẩm.");
      throw err;
    }
  };

  if (importVariantId !== null) {
    return <InventoryImportDialog variantId={importVariantId} onClose={onClose} />;
  }

  return (
    <Dialog title="Tạo sản phẩm nhanh" onClose={onClose} onSubmit={submit} submitLabel="Tạo sản phẩm" busyLabel="Đang tạo…" eyebrow="Digital key">
      {error ? <div className="publish-errors" role="alert"><h2>Chưa thể tạo</h2><ul><li>{error}</li></ul></div> : null}
      <div className="grid2">
        <label><strong>Tên *</strong><input maxLength={120} placeholder="ChatGPT Plus" value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label><strong>Giá VND *</strong><input type="number" min={1000} step={1000} value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
      </div>
      <div className="grid2">
        <label><strong>SKU</strong><input maxLength={80} placeholder="Tự tạo nếu trống" value={sku} onChange={(event) => setSku(event.target.value)} /></label>
        <label><strong>Danh mục</strong>
          <select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>
            <option value="">—</option>
            {categories.filter((category) => category.status === "active").map((category) => (
              <option key={category.id} value={category.slug}>{category.localizations?.vi?.title || category.slug}</option>
            ))}
          </select>
        </label>
      </div>
      <label><strong>Ảnh bìa</strong>
        <CoverPicker value={cover} onChange={setCover} titleFallback={title} />
      </label>
      <label><strong>Key (dán ngay, tuỳ chọn)</strong><textarea rows={8} placeholder="email|pass|2fa — mỗi dòng một key" value={keys} onChange={(event) => setKeys(event.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} /><span><strong>Mở bán ngay</strong></span></label>
    </Dialog>
  );
}
