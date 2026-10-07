import { useRef } from "react";
import { api } from "../api/client";
import { useStatus } from "./Toast";

const COVER_PRESETS = ["chatgpt-plus", "gemini-pro", "canva", "capcut-pro", "super-grok", "netflix", "cursor-pro", "microsoft", "elevenlab", "ytb-premium", "veo3-anti", "xbox", "adobe"];

export type CoverValue = { url: string; alt: string; mediaId: string; rowId: string };

/**
 * Shared cover picker (presets + R2 upload + preview) used by the product
 * editor and quick-create; previously duplicated between the two flows.
 */
export function CoverPicker({ value, onChange, titleFallback }: { value: CoverValue; onChange: (value: CoverValue) => void; titleFallback?: string }) {
  const status = useStatus();
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("alt", titleFallback || file.name);
      const data = await api<{ media: { id: string; alt?: string; publicUrl?: string; adminPreviewUrl?: string } }>("media", { method: "POST", body });
      const url = data.media?.publicUrl || data.media?.adminPreviewUrl;
      if (!url) throw new Error("Upload OK nhưng thiếu URL công khai. Dùng preset local nếu MEDIA_PUBLIC_BASE_URL chưa bật.");
      onChange({ url, alt: data.media?.alt || file.name, mediaId: data.media?.id || "", rowId: "" });
      status("Đã tải ảnh bìa lên R2.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không thể tải ảnh.", true);
    }
  };
  return (
    <div className="shop-cover-picker">
      <div className="shop-cover-picker__row">
        <div className="shop-cover-picker__preview">
          {value.url ? <img src={value.url} alt={value.alt || ""} /> : <span>Chưa có ảnh</span>}
        </div>
        <div className="shop-cover-picker__controls">
          <label className="button secondary small">
            Tải ảnh
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="button secondary small" onClick={() => onChange({ url: "", alt: "", mediaId: "", rowId: "" })}>Gỡ</button>
        </div>
      </div>
      <div className="shop-cover-presets">
        {COVER_PRESETS.map((slug) => (
          <button
            key={slug}
            type="button"
            className="shop-cover-preset"
            onClick={() => onChange({ url: `/images/shop/${slug}.webp?v=20260805-teal`, alt: `Ảnh bìa ${slug}`, mediaId: "", rowId: "" })}
          >
            <img src={`/images/shop/${slug}.webp?v=20260805-teal`} alt="" loading="lazy" width={120} height={90} />
          </button>
        ))}
      </div>
    </div>
  );
}
