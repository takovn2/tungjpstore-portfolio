import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { shopStateText } from "../lib/labels";

/** One button system for the whole admin: variants replace .shop-button/.button duplication. */
export function Button({
  variant = "secondary",
  size,
  busy,
  busyLabel = "Đang xử lý…",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; size?: "small"; busy?: boolean; busyLabel?: string }) {
  return (
    <button
      type="button"
      className={`button ${variant}${size ? ` ${size}` : ""}`}
      disabled={busy || rest.disabled}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

export function StatusBadge({ status, label, fallback = "—" }: { status?: string | null; label?: string; fallback?: string }) {
  const value = String(status || "neutral");
  return <span className="status-badge" data-status={value}>{label ?? shopStateText(status || fallback)}</span>;
}

export function MaskedKey({ value }: { value: string | null | undefined }) {
  return <span className="masked-key">{value || "—"}</span>;
}

export function SystemDot({ state }: { state: string }) {
  return <span className="system-dot" data-state={state} aria-hidden="true" />;
}

/** Accessible tabs with roving tabindex and arrow-key navigation. */
export function Tabs({ items, active, onChange, label }: {
  items: Array<{ key: string; label: ReactNode }>;
  active: string;
  onChange: (key: string) => void;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next].key);
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.key}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="tab"
          className="tab"
          aria-selected={item.key === active}
          tabIndex={item.key === active ? 0 : -1}
          onClick={() => onChange(item.key)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Compact 7-day bar chart for the shop sales pulse. */
export function MiniChart({ series }: { series: Array<{ date: string; orders: number; paidOrders: number; revenueMinor: number }> }) {
  const max = Math.max(1, ...series.map((point) => point.orders));
  return (
    <div className="mini-chart" role="img" aria-label="Nhịp bán hàng 7 ngày qua">
      {series.map((point) => {
        const height = Math.round((point.orders / max) * 100);
        return (
          <div key={point.date} className="mini-chart__bar" data-empty={point.orders === 0 || undefined}>
            <span className="mini-chart__fill" style={{ height: `${Math.max(height, 4)}%` }} />
            <span className="mini-chart__value">{point.orders}</span>
            <span className="mini-chart__day">{point.date.slice(8, 10)}/{point.date.slice(5, 7)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="shop-empty compact">
      <strong>{title}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}
