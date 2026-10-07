import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./primitives";

/**
 * One dialog system for the whole admin. Wraps the submit handler with busy
 * state, blocks closing while busy, and exposes a promise-based confirm()
 * that replaces the three overlapping dialog implementations.
 */

export function Dialog({
  title,
  eyebrow = "Shop",
  onClose,
  onSubmit,
  submitLabel = "Xác nhận",
  busyLabel = "Đang xử lý…",
  submitVariant = "primary",
  children,
  wide,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  onSubmit?: (form: HTMLFormElement) => Promise<boolean | void>;
  submitLabel?: string;
  busyLabel?: string;
  submitVariant?: "primary" | "danger" | "secondary";
  children: ReactNode;
  wide?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; state: string } | null>(null);
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, close]);
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !onSubmit) return;
    setBusy(true);
    setFeedback(null);
    try {
      const keepOpen = await onSubmit(event.currentTarget);
      if (keepOpen !== true) close();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Thao tác thất bại.", state: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <div className={`dialog-panel${wide ? " dialog-panel--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-body">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h2>{title}</h2>
            </div>
            <Button onClick={close} disabled={busy}>Đóng</Button>
          </div>
          <form className="form" ref={formRef} onSubmit={handleSubmit}>
            {children}
            {feedback ? <p className="dialog-feedback" data-state={feedback.state} role="status" aria-live="polite">{feedback.message}</p> : null}
            <div className="dialog-actions">
              <Button onClick={close} disabled={busy}>Huỷ</Button>
              {onSubmit ? (
                <button type="submit" className={`button ${submitVariant}`} disabled={busy} aria-busy={busy || undefined}>
                  {busy ? busyLabel : submitLabel}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

type ConfirmOptions = { danger?: boolean };

const ConfirmContext = createContext<(title: string, message: string, options?: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ title: string; message: string; danger: boolean; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback((title: string, message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ title, message, danger: options?.danger !== false, resolve });
    });
  }, []);
  const finish = (ok: boolean) => {
    if (pending) pending.resolve(ok);
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="dialog-overlay">
          <div className="dialog-panel dialog-panel--compact" role="alertdialog" aria-modal="true" aria-label={pending.title}>
            <div className="dialog-body">
              <h2>{pending.title}</h2>
              <p>{pending.message}</p>
              <div className="dialog-actions">
                <Button onClick={() => finish(false)}>Huỷ</Button>
                <Button variant={pending.danger ? "danger" : "primary"} onClick={() => finish(true)}>Xác nhận</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
