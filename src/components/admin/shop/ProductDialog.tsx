import { useEffect, useMemo, useState } from "react";
import { shopApi } from "../api/client";
import { Dialog } from "../ui/Dialog";
import { Button, StatusBadge, Tabs } from "../ui/primitives";
import { CoverPicker, type CoverValue } from "../ui/CoverPicker";
import { useStatus } from "../ui/Toast";
import { localeLabel, locales } from "../lib/labels";
import { useShop, type CategoryRow } from "./useShop";

type VariantDraft = {
  id?: string;
  sku: string;
  status: string;
  priceMinor: string;
  compareAtMinor: string;
  lowStockThreshold: number;
  maxPerOrder: number;
  removed?: boolean;
  localizations: Record<string, { title: string; optionSummary: string }>;
  optionValues: Record<string, string>;
  metadata: Record<string, unknown>;
};

type ProductDetail = {
  id?: string; slug?: string; status?: string; productType?: string; featured?: boolean; sortOrder?: number;
  coverMediaId?: string | null; metadata?: Record<string, unknown>; version?: number;
  media?: Array<{ id?: string; url?: string; alt?: string; mediaId?: string }>;
  localizations?: Record<string, Record<string, string>>;
  variants?: Array<Record<string, unknown>>;
};

export function productTypeDefaults(type: string) {
  return type === "digital_download"
    ? { fulfillmentType: "download", deliveryMode: "manual", inventoryPolicy: "unlimited" }
    : type === "service"
      ? { fulfillmentType: "manual", deliveryMode: "manual", inventoryPolicy: "unlimited" }
      : { fulfillmentType: "license_key", deliveryMode: "automatic", inventoryPolicy: "tracked" };
}

const emptyVariant = (index: number): VariantDraft => ({
  sku: `TUNG-KEY-${String(index + 1).padStart(3, "0")}`,
  status: "draft",
  priceMinor: "0",
  compareAtMinor: "",
  lowStockThreshold: 3,
  maxPerOrder: 10,
  localizations: { vi: { title: "", optionSummary: "" }, en: { title: "", optionSummary: "" }, ja: { title: "", optionSummary: "" }, zh: { title: "", optionSummary: "" } },
  optionValues: {},
  metadata: {},
});

export function ProductDialog({ productId, categories, pricing, onClose, onSaved }: {
  productId: string | null;
  categories: CategoryRow[];
  pricing: Record<string, any> | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const status = useStatus();
  const { loadProducts } = useShop();
  const [existing, setExisting] = useState<ProductDetail | null | undefined>(productId ? undefined : null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [productType, setProductType] = useState("digital_key");
  const [productStatus, setProductStatus] = useState("draft");
  const [sortOrder, setSortOrder] = useState(0);
  const [featured, setFeatured] = useState(false);
  const [categorySlug, setCategorySlug] = useState("");
  const [cover, setCover] = useState<CoverValue>({ url: "", alt: "", mediaId: "", rowId: "" });
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant(0)]);
  const [localizations, setLocalizations] = useState<Record<string, Record<string, string>>>({});
  const [activeLocale, setActiveLocale] = useState("vi");
  const [error, setError] = useState<{ message: string; issues?: string[] } | null>(null);

  useEffect(() => {
    if (!productId) {
      setExisting(null);
      return;
    }
    void shopApi<{ product: ProductDetail }>(`products/${encodeURIComponent(productId)}`)
      .then((data) => setExisting(data.product))
      .catch((err: unknown) => {
        setError({ message: err instanceof Error ? err.message : "Không tải được sản phẩm." });
        setExisting(null);
      });
  }, [productId]);

  useEffect(() => {
    if (productId && existing === undefined) return;
    if (existing) {
      setTitle(existing.localizations?.vi?.title || existing.slug || "");
      setSlug(existing.slug || "");
      setSlugTouched(true);
      setProductType(existing.productType || "digital_key");
      setProductStatus(existing.status || "draft");
      setSortOrder(existing.sortOrder ?? 0);
      setFeatured(Boolean(existing.featured));
      setCategorySlug(String(existing.metadata?.categorySlug || ""));
      const firstMedia = existing.media?.[0];
      setCover({
        url: firstMedia?.url || "",
        alt: firstMedia?.alt || "",
        mediaId: existing.coverMediaId || "",
        rowId: firstMedia?.id || "",
      });
      setVariants((existing.variants || []).map((variant, index) => ({
        id: typeof variant.id === "string" ? variant.id : undefined,
        sku: String(variant.sku || `TUNG-KEY-${index + 1}`),
        status: String(variant.status || "draft"),
        priceMinor: String(variant.priceMinor ?? 0),
        compareAtMinor: variant.compareAtMinor == null ? "" : String(variant.compareAtMinor),
        lowStockThreshold: Number(variant.lowStockThreshold ?? 3),
        maxPerOrder: Number(variant.maxPerOrder ?? 10),
        localizations: Object.fromEntries(locales.map((locale) => [
          locale,
          {
            title: String(((variant.localizations as Record<string, Record<string, string>>)?.[locale] || {}).title || ""),
            optionSummary: String(((variant.localizations as Record<string, Record<string, string>>)?.[locale] || {}).optionSummary || ""),
          },
        ])),
        optionValues: (variant.optionValues as Record<string, string>) || {},
        metadata: (variant.metadata as Record<string, unknown>) || {},
      })));
      setLocalizations(Object.fromEntries(locales.map((locale) => [locale, existing.localizations?.[locale] || {}])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const usdVndRate = Number(pricing?.usdVndRateScaled || 25_500_000_000) / 1_000_000;

  const pricePreview = (value: string) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return "—";
    try {
      const vndLabel = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
      const usdCents = Math.round((amount * 100) / usdVndRate);
      const usdLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(usdCents / 100);
      return `${vndLabel} · ≈ ${usdLabel} USD`;
    } catch {
      return "—";
    }
  };

  const syncTitle = (value: string, source: "primary" | "locale") => {
    setTitle(value);
    if (source === "primary") setLocalizations((current) => ({ ...current, vi: { ...(current.vi || {}), title: value } }));
    else setTitle(value);
    if (!slugTouched && !productId) {
      setSlug(value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  const readiness = useMemo(() => {
    const checks: Array<{ text: string; state: string }> = [];
    const viTitle = localizations.vi?.title || title;
    checks.push({ text: viTitle ? "Tên sản phẩm đã có" : "Thiếu tên sản phẩm", state: viTitle ? "ok" : "error" });
    checks.push({ text: /^[a-z0-9][a-z0-9-]*$/.test(slug || "") ? "Slug hợp lệ" : "Slug cần chữ thường và dấu gạch ngang", state: /^[a-z0-9][a-z0-9-]*$/.test(slug || "") ? "ok" : "error" });
    checks.push({ text: cover.url ? "Đã có ảnh bìa" : "Chưa có ảnh bìa (nên thêm trước khi mở bán)", state: cover.url ? "ok" : "warning" });
    checks.push({ text: categorySlug ? `Danh mục: ${categorySlug}` : "Chưa chọn danh mục storefront", state: categorySlug ? "ok" : "warning" });
    const kept = variants.filter((variant) => !variant.removed);
    const skus = kept.map((variant) => variant.sku.trim().toUpperCase()).filter(Boolean);
    const duplicateSku = skus.some((sku, index) => skus.indexOf(sku) !== index);
    checks.push({ text: `${kept.length} biến thể đang được giữ lại`, state: kept.length ? "ok" : "error" });
    checks.push({ text: duplicateSku ? "SKU đang bị trùng" : "SKU không trùng trong biểu mẫu", state: duplicateSku ? "error" : "ok" });
    const invalidPrice = kept.some((variant) => !Number.isSafeInteger(Number(variant.priceMinor)) || Number(variant.priceMinor) < 0);
    checks.push({ text: invalidPrice ? "Có giá không hợp lệ" : "Giá dùng minor unit hợp lệ", state: invalidPrice ? "error" : "ok" });
    checks.push({ text: "Tiền tệ nhất quán (VND)", state: "ok" });
    const activeCards = kept.filter((variant) => variant.status === "active");
    checks.push({
      text: productStatus === "active" && !activeCards.length ? "Sản phẩm active nhưng chưa có biến thể đang bán" : `${activeCards.length} biến thể đang bán`,
      state: productStatus === "active" && !activeCards.length ? "error" : "ok",
    });
    const missingLocales = locales.filter((locale) => ["title", "shortDescription", "description", "seoTitle", "seoDescription"].some((field) => !(localizations[locale]?.[field] || "").trim()));
    checks.push({
      text: productStatus === "active" && missingLocales.length ? `Active còn thiếu: ${missingLocales.map((locale) => localeLabel[locale]).join(", ")}` : productStatus === "active" ? "Đủ nội dung cho bốn locale" : "Draft cho phép hoàn thiện dần",
      state: productStatus === "active" && missingLocales.length ? "warning" : "ok",
    });
    return checks;
  }, [variants, slug, cover.url, categorySlug, localizations, productStatus, title]);

  const buildPayload = () => {
    const kept = variants.filter((variant) => !variant.removed);
    const defaults = productTypeDefaults(productType);
    const productLocalizations: Record<string, Record<string, string>> = {};
    for (const locale of locales) {
      const item = localizations[locale] || {};
      const localeTitle = (item.title || "").trim() || (locale === "vi" ? title.trim() : "");
      const entry = {
        title: localeTitle,
        eyebrow: (item.eyebrow || "").trim(),
        shortDescription: (item.shortDescription || "").trim() || (locale === "vi" ? localeTitle : ""),
        description: (item.description || "").trim() || (locale === "vi" ? localeTitle : ""),
        seoTitle: (item.seoTitle || "").trim() || (locale === "vi" ? localeTitle : ""),
        seoDescription: (item.seoDescription || "").trim() || (locale === "vi" ? localeTitle : ""),
      };
      if (locale === "vi" || Object.values(entry).some(Boolean)) productLocalizations[locale] = entry;
    }
    const payloadVariants = kept.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      sku: variant.sku.trim().toUpperCase(),
      status: variant.status,
      ...defaults,
      priceMinor: Number.isSafeInteger(Number(variant.priceMinor)) ? Number(variant.priceMinor) : 0,
      compareAtMinor: variant.compareAtMinor ? Number(variant.compareAtMinor) : null,
      currency: "VND",
      lowStockThreshold: variant.lowStockThreshold,
      maxPerOrder: variant.maxPerOrder,
      optionValues: variant.optionValues || {},
      metadata: variant.metadata || {},
      localizations: Object.fromEntries(locales
        .map((locale): [string, { title: string; optionSummary: string }] => [locale, variant.localizations[locale]])
        .filter(([, value]) => Boolean(value && (value.title || value.optionSummary)))),
    }));
    if (!payloadVariants.length) throw new Error("Sản phẩm cần ít nhất một biến thể.");
    const normalizedSlug = slug.trim().toLowerCase();
    if (!productLocalizations.vi?.title || !normalizedSlug) throw new Error("Cần nhập tên và slug sản phẩm.");
    const metadata: Record<string, unknown> = { ...(existing?.metadata || {}) };
    const selectedCategory = categories.find((category) => category.slug === categorySlug);
    if (selectedCategory) {
      metadata.category = selectedCategory.localizations?.vi?.title || categorySlug;
      metadata.categorySlug = categorySlug;
    } else {
      delete metadata.category;
      delete metadata.categorySlug;
    }
    const media = cover.url
      ? [{ ...(cover.rowId ? { id: cover.rowId } : {}), type: "image", url: cover.url, alt: cover.alt || productLocalizations.vi.title || normalizedSlug, sortOrder: 0, ...(cover.mediaId ? { mediaId: cover.mediaId } : {}) }]
      : [];
    return {
      slug: normalizedSlug,
      status: productStatus,
      productType,
      featured,
      sortOrder: Number(sortOrder) || 0,
      defaultLocale: existing && "defaultLocale" in existing ? String((existing as { defaultLocale?: string }).defaultLocale || "vi") : "vi",
      coverMediaId: cover.mediaId || null,
      metadata,
      localizations: productLocalizations,
      variants: payloadVariants,
      media,
    };
  };

  const submit = async () => {
    try {
      const payload = buildPayload();
      if (productId) {
        await shopApi(`products/${encodeURIComponent(productId)}`, { method: "PUT", body: JSON.stringify({ ...payload, expectedVersion: existing?.version }) });
        status("Đã cập nhật sản phẩm và bảo toàn các biến thể.");
      } else {
        await shopApi("products", { method: "POST", body: JSON.stringify(payload) });
        status(`Đã tạo sản phẩm (${payload.status === "active" ? "đang bán" : "bản nháp"}).`);
      }
      await loadProducts();
      await onSaved();
    } catch (err) {
      const typed = err as { message?: string; issues?: Array<{ path?: string; code?: string } | string> };
      setError({
        message: typed.message || "Không lưu được sản phẩm.",
        issues: (typed.issues || []).map((issue) => (typeof issue === "string" ? issue : `${issue.path || ""}: ${issue.code || "invalid"}`)),
      });
      throw err;
    }
  };

  if (productId && existing === undefined) {
    return (
      <Dialog title="Đang tải sản phẩm…" onClose={onClose}>
        <p className="help">Đang tải dữ liệu sản phẩm.</p>
      </Dialog>
    );
  }

  const updateVariant = (index: number, patch: Partial<VariantDraft>) => {
    setVariants((current) => current.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)));
  };
  const updateVariantLocale = (index: number, locale: string, patch: Partial<{ title: string; optionSummary: string }>) => {
    setVariants((current) => current.map((variant, i) => (i === index ? { ...variant, localizations: { ...variant.localizations, [locale]: { ...variant.localizations[locale], ...patch } } } : variant)));
  };

  return (
    <Dialog
      title={productId ? "Chỉnh sửa sản phẩm" : "Tạo sản phẩm"}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={productId ? "Lưu thay đổi" : "Tạo sản phẩm"}
      busyLabel="Đang lưu…"
      wide
    >
      <div className="shop-editor-shell">
        <div className="shop-editor-main">
          {error ? (
            <div className="publish-errors" role="alert">
              <h2>Chưa thể lưu</h2>
              <ul>{[error.message, ...(error.issues || [])].map((issue, index) => <li key={index}>{issue}</li>)}</ul>
            </div>
          ) : null}
          <section className="shop-editor-card">
            <div className="section-heading">
              <div><p className="eyebrow">01 · Cơ bản</p><h3>Sản phẩm</h3></div>
              <StatusBadge status={productStatus === "active" ? "healthy" : productStatus} label={productStatus} />
            </div>
            <div className="grid2">
              <label><strong>Tên sản phẩm</strong><input value={title} onChange={(event) => syncTitle(event.target.value, "primary")} required /></label>
              <label><strong>Slug</strong><input value={slug} pattern="[a-z0-9][a-z0-9-]*" onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }} required /></label>
            </div>
            <div className="grid3">
              <label><strong>Loại</strong>
                <select value={productType} onChange={(event) => setProductType(event.target.value)}>
                  <option value="digital_key">Digital key</option>
                  <option value="digital_download">Download</option>
                  <option value="service">Service</option>
                </select>
              </label>
              <label><strong>Trạng thái</strong>
                <select value={productStatus} onChange={(event) => setProductStatus(event.target.value)}>
                  <option value="draft">Bản nháp</option>
                  <option value="active">Đang bán</option>
                  <option value="archived">Lưu trữ</option>
                </select>
              </label>
              <label><strong>Thứ tự</strong><input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></label>
            </div>
            <CoverPicker value={cover} onChange={setCover} titleFallback={title} />
            <label><strong>Danh mục storefront</strong>
              <select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>
                <option value="">Chưa phân loại</option>
                {categories.filter((category) => category.status === "active" || category.slug === categorySlug).map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.localizations?.vi?.title || category.slug}{category.status === "archived" ? " · đã lưu trữ" : ""}
                  </option>
                ))}
              </select>
              <small className="help">Chỉ danh mục đang hoạt động mới nhận sản phẩm mới.</small>
            </label>
            <label className="check"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /><span><strong>Nổi bật</strong></span></label>
          </section>

          <section className="shop-editor-card">
            <div className="section-heading">
              <div><p className="eyebrow">02 · Giá</p><h3>Biến thể / gói</h3></div>
              <Button variant="primary" size="small" onClick={() => setVariants([...variants, emptyVariant(variants.length)])}>+ Thêm gói</Button>
            </div>
            <div className="shop-variant-list">
              {variants.map((variant, index) => (
                <article className={`shop-variant-card${variant.removed ? " variant-removed" : ""}`} key={variant.id || `new-${index}`}>
                  <div className="variant-head">
                    <strong>Biến thể {index + 1}{variant.removed ? " · sẽ bị ẩn" : ""}</strong>
                    <div className="shop-variant-tools">
                      <Button size="small" onClick={() => setVariants([...variants.slice(0, index + 1), { ...variant, id: undefined, sku: `${variant.sku}-COPY` }, ...variants.slice(index + 1)])}>Nhân bản</Button>
                      {variant.id ? (
                        <Button size="small" onClick={() => updateVariant(index, { removed: !variant.removed })}>{variant.removed ? "Khôi phục" : "Ẩn"}</Button>
                      ) : (
                        <Button size="small" onClick={() => setVariants(variants.filter((_, i) => i !== index))}>Xoá</Button>
                      )}
                    </div>
                  </div>
                  <div className="variant-primary">
                    <label><strong>SKU *</strong><input value={variant.sku} required onChange={(event) => updateVariant(index, { sku: event.target.value })} /><small className="help">Mã kho duy nhất, viết HOA không dấu.</small></label>
                    <label><strong>Giá gốc VND *</strong>
                      <input type="number" min={0} required value={variant.priceMinor} onChange={(event) => updateVariant(index, { priceMinor: event.target.value })} />
                      <output className="price-preview" aria-live="polite">{pricePreview(variant.priceMinor)}</output>
                      <small className="help">Nhập số nguyên VND · tỷ giá 1 USD = {usdVndRate.toLocaleString("en-US")} VND</small>
                    </label>
                    <label><strong>Trạng thái bán</strong>
                      <select value={variant.status} onChange={(event) => updateVariant(index, { status: event.target.value })}>
                        <option value="draft">Bản nháp</option>
                        <option value="active">Đang bán</option>
                        <option value="archived">Lưu trữ</option>
                      </select>
                    </label>
                  </div>
                  <label><strong>Tên hiển thị (VI) *</strong><input value={variant.localizations.vi.title} onChange={(event) => updateVariantLocale(index, "vi", { title: event.target.value })} /><small className="help">Khách thấy tên này trên storefront / giỏ hàng.</small></label>
                  <details className="shop-advanced-disclosure">
                    <summary><span><strong>Cấu hình kho & giao hàng</strong><small>{productTypeDefaults(productType).fulfillmentType} · {productTypeDefaults(productType).deliveryMode} · {productTypeDefaults(productType).inventoryPolicy} (theo loại sản phẩm)</small></span><span aria-hidden="true">＋</span></summary>
                    <div className="shop-advanced-disclosure__body">
                      <div className="grid3">
                        <label><strong>Ngưỡng cảnh báo hết</strong><input type="number" min={0} value={variant.lowStockThreshold} onChange={(event) => updateVariant(index, { lowStockThreshold: Number(event.target.value) })} /></label>
                        <label><strong>Tối đa mỗi đơn</strong><input type="number" min={1} value={variant.maxPerOrder} onChange={(event) => updateVariant(index, { maxPerOrder: Number(event.target.value) })} /></label>
                        <label><strong>Giá gạch (tuỳ chọn)</strong><input type="number" min={0} value={variant.compareAtMinor} placeholder="Để trống nếu không giảm" onChange={(event) => updateVariant(index, { compareAtMinor: event.target.value })} /></label>
                      </div>
                    </div>
                  </details>
                  <details className="shop-advanced-disclosure">
                    <summary><span><strong>Nhãn đa ngôn ngữ (EN / JA / ZH)</strong><small>Tuỳ chọn khi còn draft</small></span><span aria-hidden="true">＋</span></summary>
                    <div className="shop-advanced-disclosure__body">
                      <div className="grid2">
                        {locales.filter((locale) => locale !== "vi").map((locale) => (
                          <label key={locale}><strong>{localeLabel[locale]} · tên</strong><input value={variant.localizations[locale].title} onChange={(event) => updateVariantLocale(index, locale, { title: event.target.value })} /></label>
                        ))}
                      </div>
                      <div className="grid2">
                        {locales.map((locale) => (
                          <label key={locale}><strong>{localeLabel[locale]} · mô tả lựa chọn</strong><input value={variant.localizations[locale].optionSummary} onChange={(event) => updateVariantLocale(index, locale, { optionSummary: event.target.value })} /></label>
                        ))}
                      </div>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          </section>

          <section className="shop-editor-card">
            <div className="section-heading">
              <div><p className="eyebrow">03 · Nội dung</p><h3>Storefront</h3><p className="shop-card-hint">Draft: chỉ VI. Đang bán: đủ 4 locale.</p></div>
            </div>
            <Tabs
              label="Ngôn ngữ sản phẩm"
              active={activeLocale}
              onChange={setActiveLocale}
              items={locales.map((locale) => ({ key: locale, label: localeLabel[locale] }))}
            />
            {locales.map((locale) => (
              <div key={locale} className="shop-locale-panel" role="tabpanel" hidden={locale !== activeLocale}>
                <div className="grid2">
                  <label><strong>Tiêu đề</strong><input value={localizations[locale]?.title || (locale === "vi" ? title : "")} onChange={(event) => setLocalizations({ ...localizations, [locale]: { ...(localizations[locale] || {}), title: event.target.value } })} /></label>
                  <label><strong>Eyebrow</strong><input value={localizations[locale]?.eyebrow || ""} onChange={(event) => setLocalizations({ ...localizations, [locale]: { ...(localizations[locale] || {}), eyebrow: event.target.value } })} /></label>
                </div>
                <label><strong>Mô tả ngắn</strong><textarea rows={2} value={localizations[locale]?.shortDescription || ""} onChange={(event) => setLocalizations({ ...localizations, [locale]: { ...(localizations[locale] || {}), shortDescription: event.target.value } })} /></label>
                <label><strong>Mô tả chi tiết</strong><textarea rows={3} value={localizations[locale]?.description || ""} onChange={(event) => setLocalizations({ ...localizations, [locale]: { ...(localizations[locale] || {}), description: event.target.value } })} /></label>
                <div className="grid2">
                  <label><strong>SEO title</strong><input value={localizations[locale]?.seoTitle || ""} onChange={(event) => setLocalizations({ ...localizations, [locale]: { ...(localizations[locale] || {}), seoTitle: event.target.value } })} /></label>
                  <label><strong>SEO description</strong><textarea rows={2} value={localizations[locale]?.seoDescription || ""} onChange={(event) => setLocalizations({ ...localizations, [locale]: { ...(localizations[locale] || {}), seoDescription: event.target.value } })} /></label>
                </div>
              </div>
            ))}
          </section>
        </div>
        <aside className="shop-editor-side">
          <section className="shop-readiness">
            <h3>Checklist</h3>
            <ul className="shop-readiness-list">
              {readiness.map((item, index) => <li key={index} data-state={item.state}>{item.text}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </Dialog>
  );
}
