import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { message: string; error: boolean; id: number };
type StatusFn = (message: string, error?: boolean) => void;

const ToastContext = createContext<StatusFn>(() => {});

/** Single toast channel replacing status()/telegramFormStatus()/per-dialog feedback races. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(0);
  const status = useCallback<StatusFn>((message, error = false) => {
    window.clearTimeout(timer.current);
    setToast({ message, error, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), error ? 9000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={status}>
      {children}
      <div aria-live="polite" className="sr-only" id="announce" />
      {toast ? (
        <div className={`toast visible${toast.error ? " error" : ""}`} role="status" key={toast.id}>
          {toast.message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useStatus() {
  return useContext(ToastContext);
}
