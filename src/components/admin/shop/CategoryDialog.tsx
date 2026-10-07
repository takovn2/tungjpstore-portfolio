import { useEffect, useState } from "react";
import { shopApi } from "../api/client";
import { Dialog } from "../ui/Dialog";
import { useStatus } from "../ui/Toast";
import { localeLabel, locales } from "../lib/labels";
import type { CategoryRow } from "./useShop";

export function CategoryDialog({ categoryId, categories, onClose, onSaved }: {
  categoryId: string | null;
  categories: CategoryRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const status = useStatus();
  const existing = categoryId ? categories.find((category) => category.id === categoryId) || null : null;
  const [values, setValues] = useState<Record<string, { title: string; description: string }>>({});
  const [slug, setSlug] = useState("");
  const [categoryStatus, setCategoryStatus] = useState("active");
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const localizations = existing?.localizations || {};
    setValues(Object.fromEntries(locales.map((locale) => [
      locale,
      {
        title: localizations[locale]?.title || "",
        description: localizations[locale]?.description || "",
      },
    ])));
    setSlug(existing?.slug || "");
    setCategoryStatus(existing?.status || "active");
    setSortOrder(Number(existing?.sortOrder ?? 0));
  }, [existing]);

  const submit = async () => {
    try {
      const localizations: Record<string, { title: string; description: string }> = {};
      for (const locale of locales) {
        const entry = values[locale] || { title: "", description: "" };
        if (entry.title || entry.description) localizations[locale] = entry;
      }
      const payload = {
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
        status: categoryStatus,
        sortOrder: Number(sortOrder) || 0,
        defaultLocale: "vi",
        localizations,
      };
      if (!payload.slug || !localizations.vi?.title) throw new Error("Cần nhập mã danh mục và tên tiếng Việt.");
      if (existing) await shopApi(`categories/${encodeURIComponent(existing.id)}`, { method: "PUT", body: JSON.stringify({ ...payload, expectedVersion: existing.version }) });
      else await shopApi("categories", { method: "POST", body: JSON.stringify(payload) });
      status(existing ? "Đã cập nhật danh mục." : "Đã tạo danh mục.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được danh mục.");
      throw err;
    }
  };

  const categoryInUse = Number(existing?.usageCount || 0) > 0;

  return (
    <Dialog
      title={existing ? "Chỉnh sửa danh mục" : "Tạo danh mục"}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={existing ? "Lưu danh mục" : "Tạo danh mục"}
      busyLabel="Đang lưu…"
      eyebrow="Store taxonomy"
    >
      {error ? <div className="publish-errors" role="alert"><h2>Chưa thể lưu</h2><ul><li>{error}</li></ul></div> : null}
      <div className="grid2">
        <label><strong>Tên danh mục *</strong><input maxLength={120} value={values.vi?.title || ""} onChange={(event) => setValues({ ...values, vi: { ...(values.vi || { description: "" }), title: event.target.value } })} placeholder="Ví dụ: Microsoft 365" /></label>
        <label><strong>Mã danh mục *</strong><input pattern="[a-z0-9][a-z0-9-]*" maxLength={80} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="microsoft-365" /><small className="help">Mã ổn định cho bộ lọc; không đổi khi đang có sản phẩm.</small></label>
      </div>
      <label><strong>Mô tả ngắn</strong><textarea rows={2} maxLength={500} value={values.vi?.description || ""} onChange={(event) => setValues({ ...values, vi: { ...(values.vi || { title: "" }), description: event.target.value } })} placeholder="Giúp người quản trị hiểu phạm vi danh mục." /></label>
      <div className="grid2">
        <label><strong>Trạng thái</strong>
          <select value={categoryStatus} onChange={(event) => setCategoryStatus(event.target.value)}>
            <option value="active">Đang hiển thị</option>
            <option value="archived" disabled={categoryInUse}>Lưu trữ{categoryInUse ? " (đang có sản phẩm)" : ""}</option>
          </select>
        </label>
        <label><strong>Thứ tự hiển thị</strong><input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /><small className="help">Số nhỏ xuất hiện trước.</small></label>
      </div>
      <details className="shop-advanced-disclosure">
        <summary><span><strong>Bản dịch storefront</strong><small>English, 日本語, 简体中文</small></span><span aria-hidden="true">＋</span></summary>
        <div className="shop-advanced-disclosure__body">
          <div className="grid2">
            {locales.filter((locale) => locale !== "vi").map((locale) => (
              <label key={locale}><strong>{localeLabel[locale]} · tên</strong><input maxLength={120} value={values[locale]?.title || ""} onChange={(event) => setValues({ ...values, [locale]: { ...(values[locale] || { description: "" }), title: event.target.value } })} /></label>
            ))}
          </div>
          <div className="grid2">
            {locales.filter((locale) => locale !== "vi").map((locale) => (
              <label key={locale}><strong>{localeLabel[locale]} · mô tả</strong><textarea rows={2} maxLength={500} value={values[locale]?.description || ""} onChange={(event) => setValues({ ...values, [locale]: { ...(values[locale] || { title: "" }), description: event.target.value } })} /></label>
            ))}
          </div>
        </div>
      </details>
    </Dialog>
  );
}
