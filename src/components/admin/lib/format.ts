/** Shared formatting helpers for the admin React app. */

export function formatDate(value: unknown, withTime = false) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(String(value)));
  } catch {
    return String(value);
  }
}

export function toLocalDateTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function shopMoney(minor: unknown, currency = "VND") {
  const amount = Number(minor);
  if (!Number.isFinite(amount)) return "—";
  const normalizedCurrency = String(currency || "VND").toUpperCase();
  try {
    const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: normalizedCurrency });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / (10 ** fractionDigits));
  } catch {
    return `${amount} ${normalizedCurrency}`;
  }
}

export function shopMaskKey(value: unknown) {
  const parsed = String(value || "");
  return parsed.length <= 8 ? `${parsed.slice(0, 2)}•••${parsed.slice(-2)}` : `${parsed.slice(0, 4)}••••${parsed.slice(-4)}`;
}

/** Deterministic Vietnamese-safe slug generator used by quick-create. */
export function slugify(value: string, max = 60) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max);
}

export function downloadCsv(filename: string, header: string[], rows: Array<Array<unknown>>) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [header.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Parse pasted or uploaded key sources with a 500-row cap. */
export type InventorySourceRow = { lineNumber: number; key: string; maskedKey: string; status: string; reason: string };

export function parseInventorySource(raw: string, format = "txt"): InventorySourceRow[] {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const rows: Array<{ lineNumber: number; key: string }> = [];
  if (format === "txt") {
    text.split(/\r?\n/).forEach((value, index) => {
      if (value.trim()) rows.push({ lineNumber: index + 1, key: value.trim() });
    });
  } else {
    const matrix: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index <= text.length; index += 1) {
      const char = text[index] || "\n";
      if (char === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = !quoted;
      } else if (!quoted && (char === "," || char === ";" || char === "\t" || char === "\n")) {
        row.push(cell);
        cell = "";
        if (char === "\n") {
          if (row.some((item) => item.trim())) matrix.push(row);
          row = [];
        }
      } else if (char !== "\r") cell += char;
    }
    const header = matrix[0]?.map((item) => item.trim().toLowerCase()) || [];
    const keyIndex = header.findIndex((item) => ["key", "license_key", "license", "code", "product_key"].includes(item));
    const start = keyIndex >= 0 ? 1 : 0;
    for (let index = start; index < matrix.length; index += 1) {
      const value = matrix[index][keyIndex >= 0 ? keyIndex : 0] || "";
      if (value.trim()) rows.push({ lineNumber: index + 1, key: value.trim() });
    }
  }
  if (rows.length > 500) throw new Error("Một lần kiểm tra tối đa 500 dòng key.");
  const seen = new Set<string>();
  return rows.map((row) => {
    const invalid = row.key.length > 4096 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(row.key);
    const duplicate = seen.has(row.key);
    seen.add(row.key);
    return {
      ...row,
      maskedKey: shopMaskKey(row.key),
      status: invalid ? "invalid" : duplicate ? "duplicate_in_file" : "ready",
      reason: invalid ? "Ký tự điều khiển hoặc độ dài không hợp lệ" : duplicate ? "Trùng trong file" : "Sẵn sàng",
    };
  });
}
