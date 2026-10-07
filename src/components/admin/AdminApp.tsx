import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, getAccessIdentity, securityRequest, setAccessIdentity, setAuthenticated, setCsrfToken } from "./api/client";
import { createPasswordSalt, loginChallengeProof, passwordCredential, validateClientAdminPassword } from "./lib/crypto";
import { ConfirmProvider, useConfirm } from "./ui/Dialog";
import { ToastProvider, useStatus } from "./ui/Toast";
import { OverviewView } from "./views/OverviewView";
import { ContentView } from "./views/ContentView";
import { ContactsView } from "./views/ContactsView";
import { MediaView } from "./views/MediaView";
import { SettingsView } from "./views/SettingsView";
import { SecurityView } from "./views/SecurityView";
import { ShopWorkspace } from "./shop/ShopWorkspace";

export type SecurityState = {
  configured: boolean;
  authenticated: boolean;
  passwordSalt: string;
  passwordIterations: number;
  passwordScheme: string;
  accessEmail: string;
  sessionExpiresAt: string | null;
};

type AdminContextValue = {
  security: SecurityState;
  setSecurity: (patch: Partial<SecurityState>) => void;
  lockToGate: (message?: string) => void;
  showView: (view: string) => void;
  currentView: string;
  contentType: string;
  setContentType: (type: string) => void;
  markDirty: (scope: string, dirty?: boolean) => void;
  isDirty: (scope: string) => boolean;
  guardUnsaved: (scope?: string | null) => Promise<boolean>;
  openContentItem: (type: string, id?: string) => void;
  lastMediaId: string;
  setLastMediaId: (id: string) => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminApp");
  return value;
}

const VIEWS = ["overview", "content", "contacts", "media", "shop", "settings", "security"] as const;
type ViewName = (typeof VIEWS)[number];

const NAV_GROUPS: Array<{ group: string; items: Array<{ view: string; label: string; type?: string }> }> = [
  { group: "Điều hành", items: [{ view: "overview", label: "Tổng quan" }] },
  {
    group: "Nội dung",
    items: [
      { view: "content", label: "Trang", type: "site_section" },
      { view: "content", label: "Dự án", type: "project" },
      { view: "content", label: "Bài viết", type: "post" },
    ],
  },
  {
    group: "Vận hành",
    items: [
      { view: "contacts", label: "Contacts" },
      { view: "media", label: "Media" },
      { view: "shop", label: "Shop" },
      { view: "settings", label: "Thiết lập" },
      { view: "security", label: "Bảo mật" },
    ],
  },
];

function AdminShell() {
  const [boot, setBoot] = useState<"loading" | "setup" | "login" | "ready" | "error">("loading");
  const [gateError, setGateError] = useState("");
  const [gateIntro, setGateIntro] = useState("");
  const [security, setSecurityState] = useState<SecurityState>({
    configured: false,
    authenticated: false,
    passwordSalt: "",
    passwordIterations: 600000,
    passwordScheme: "pbkdf2-sha256-v3",
    accessEmail: "",
    sessionExpiresAt: null,
  });
  const [currentView, setCurrentView] = useState<ViewName>("overview");
  const [contentType, setContentTypeState] = useState("post");
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [lastMediaId, setLastMediaId] = useState("");
  const [contentTarget, setContentTarget] = useState<{ type: string; id?: string } | null>(null);
  const status = useStatus();
  const confirm = useConfirm();
  const booted = useRef(false);

  const setSecurity = useCallback((patch: Partial<SecurityState>) => {
    setSecurityState((current) => ({ ...current, ...patch }));
  }, []);

  const setContentType = useCallback((type: string) => {
    setContentTypeState(type);
  }, []);

  const markDirty = useCallback((scope: string, isDirty = true) => {
    setDirty((current) => {
      const next = new Set(current);
      if (isDirty) next.add(scope);
      else next.delete(scope);
      return next;
    });
  }, []);

  const isDirty = useCallback((scope: string) => dirty.has(scope), [dirty]);

  const guardUnsaved = useCallback(async (scope: string | null = null) => {
    const targets = scope ? [scope].filter((item) => dirty.has(item)) : [...dirty];
    if (targets.length === 0) return true;
    const ok = await confirm("Bỏ thay đổi chưa lưu?", "Những chỉnh sửa hiện tại chưa được lưu và sẽ không thể khôi phục.");
    if (ok) targets.forEach((item) => markDirty(item, false));
    return ok;
  }, [confirm, dirty, markDirty]);

  const lockToGate = useCallback((message = "") => {
    setSecurity({ authenticated: false });
    setAuthenticated(false);
    setGateIntro("Cloudflare Access đã xác thực danh tính. Nhập mật khẩu quản trị để tạo khóa dẫn xuất và mở dữ liệu.");
    setGateError(message);
    setBoot("login");
  }, [setSecurity]);

  const showView = useCallback((view: string) => {
    setCurrentView((VIEWS as readonly string[]).includes(view) ? view as ViewName : "overview");
  }, []);

  const openContentItem = useCallback((type: string, id?: string) => {
    setContentTypeState(type);
    // Only an explicit "__new__" opens the editor with a fresh item; stat
    // cards pass no id and should land on the content list.
    setContentTarget(id ? { type, id } : null);
    setCurrentView("content");
  }, []);

  const bootSecurity = useCallback(async () => {
    const session = await api<{ csrfToken?: string; user?: { sub?: string; email?: string } }>("session");
    setCsrfToken(session.csrfToken || "");
    const sub = typeof session.user?.sub === "string" ? session.user.sub : "";
    const email = typeof session.user?.email === "string" ? session.user.email.toLowerCase() : "";
    setAccessIdentity(sub, email);
    setSecurity({ accessEmail: email });
    const data = await securityRequest<{ security?: Record<string, unknown> }>("security/status");
    const value = (data.security || data) as Record<string, unknown>;
    const configured = Boolean(value.passwordConfigured ?? value.configured ?? value.hasPassword ?? !value.setupRequired);
    const authenticated = Boolean(value.authenticated ?? value.passwordAuthenticated ?? false);
    setAuthenticated(authenticated);
    setSecurity({
      configured,
      authenticated,
      passwordSalt: typeof value.passwordSalt === "string" ? value.passwordSalt : "",
      passwordIterations: Number.isInteger(value.passwordIterations) ? Number(value.passwordIterations) : 600000,
      passwordScheme: typeof value.passwordScheme === "string" ? value.passwordScheme : "pbkdf2-sha256-v3",
      sessionExpiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
    });
    if (!configured) {
      setGateIntro("Đây là lần đầu thiết lập. Khóa dẫn xuất được tạo ngay trên trình duyệt; mật khẩu gốc không được gửi tới Worker.");
      setGateError("");
      setBoot("setup");
      return false;
    }
    if (!authenticated) {
      setGateIntro("Cloudflare Access đã xác thực danh tính. Nhập mật khẩu quản trị để tạo khóa dẫn xuất và mở dữ liệu.");
      setGateError("");
      setBoot("login");
      return false;
    }
    setBoot("ready");
    return true;
  }, [setSecurity]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    // The island replaces the static boot placeholder; without this the
    // "Đang khởi tạo control desk…" block stays rendered next to the app.
    document.getElementById("admin-root")?.remove();
    void bootSecurity().catch((error: unknown) => {
      setGateIntro("Cloudflare Access đã xác thực danh tính. Nhập mật khẩu quản trị để tạo khóa dẫn xuất và mở dữ liệu.");
      setGateError(`Không thể khởi tạo lớp bảo mật: ${error instanceof Error ? error.message : "lỗi không rõ"}`);
      setBoot("login");
    });
  }, [bootSecurity]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.size === 0) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const context = useMemo<AdminContextValue>(() => ({
    security,
    setSecurity,
    lockToGate,
    showView,
    currentView,
    contentType,
    setContentType,
    markDirty,
    isDirty,
    guardUnsaved,
    openContentItem,
    lastMediaId,
    setLastMediaId,
  }), [security, setSecurity, lockToGate, showView, currentView, contentType, setContentType, markDirty, isDirty, guardUnsaved, openContentItem, lastMediaId]);

  const handleSetup = async (form: HTMLFormElement) => {
    const password = (form.elements.namedItem("adminPassword") as HTMLInputElement).value;
    const confirmPass = (form.elements.namedItem("adminPasswordConfirm") as HTMLInputElement).value;
    if (password !== confirmPass) throw new Error("Hai mật khẩu chưa trùng nhau.");
    if (!validateClientAdminPassword(password)) throw new Error("Mật khẩu chưa đạt chính sách tối thiểu 14 ký tự và cần ít nhất 2 nhóm ký tự.");
    const salt = createPasswordSalt();
    const credential = await passwordCredential(password, salt);
    const data = await securityRequest<{ authenticated?: boolean }>("security/setup", { method: "POST", body: JSON.stringify({ password: credential }) });
    form.reset();
    setSecurity({ configured: true, authenticated: Boolean(data.authenticated), passwordSalt: salt, passwordIterations: credential.iterations, passwordScheme: credential.scheme });
    setAuthenticated(Boolean(data.authenticated));
    if (!data.authenticated) {
      setGateIntro("Cloudflare Access đã xác thực danh tính. Nhập mật khẩu quản trị để tạo khóa dẫn xuất và mở dữ liệu.");
      setBoot("login");
      return true;
    }
    setBoot("ready");
    status("Đã thiết lập lớp mật khẩu quản trị.");
    return true;
  };

  const handleLogin = async (form: HTMLFormElement) => {
    const password = (form.elements.namedItem("adminPassword") as HTMLInputElement).value;
    if (!validateClientAdminPassword(password)) throw new Error("Mật khẩu quản trị chưa đúng.");
    if (!security.passwordSalt) throw new Error("Thiếu thông tin dẫn xuất. Hãy tải lại trang quản trị.");
    const credential = await passwordCredential(password, security.passwordSalt, security.passwordIterations);
    const issued = await securityRequest<{ challenge: Parameters<typeof loginChallengeProof>[1] }>("security/challenge", { method: "POST", body: JSON.stringify({ action: "login" }) });
    const proof = await loginChallengeProof(credential, issued.challenge, getAccessIdentity());
    const data = await securityRequest<{ authenticated?: boolean; ok?: boolean }>("security/login", { method: "POST", body: JSON.stringify({ challenge: proof }) });
    if (!data.authenticated && data.ok !== true) throw new Error("Mật khẩu chưa đúng hoặc phiên đã bị khóa.");
    form.reset();
    setSecurity({ authenticated: true });
    setAuthenticated(true);
    setBoot("ready");
    status("Đã mở control desk.");
    return true;
  };

  if (boot === "loading") {
    return <div className="admin-boot"><p className="eyebrow">TUNG Admin</p><p>Đang xác minh Cloudflare Access…</p></div>;
  }

  if (boot === "setup" || boot === "login") {
    return (
      <AdminContext.Provider value={context}>
        <main className="admin-gate" aria-labelledby="gate-title">
          <div className="gate-card">
            <p className="eyebrow">TUNG Admin · Cloudflare Access</p>
            <h1 id="gate-title">{boot === "setup" ? "Thiết lập mật khẩu quản trị" : "Mở khóa control desk"}</h1>
            <p className="help">{gateIntro}</p>
            <form className="form" onSubmit={(event) => {
              event.preventDefault();
              const handler = boot === "setup" ? handleSetup : handleLogin;
              void handler(event.currentTarget).catch((error: unknown) => setGateError(error instanceof Error ? error.message : "Thao tác thất bại."));
            }}>
              {boot === "setup" ? (
                <>
                  <label><strong>Mật khẩu quản trị</strong><input name="adminPassword" type="password" autoComplete="new-password" minLength={14} maxLength={128} required /></label>
                  <label><strong>Nhập lại mật khẩu</strong><input name="adminPasswordConfirm" type="password" autoComplete="new-password" minLength={14} maxLength={128} required /></label>
                </>
              ) : (
                <label><strong>Mật khẩu quản trị</strong><input name="adminPassword" type="password" autoComplete="current-password" minLength={14} maxLength={128} required /></label>
              )}
              {gateError ? <p className="gate-error" role="alert">{gateError}</p> : null}
              <button type="submit" className="button primary">{boot === "setup" ? "Tạo khóa dẫn xuất" : "Xác minh và mở"}</button>
            </form>
            <p className="help">Mật khẩu gốc không bao giờ được gửi tới Worker; trình duyệt tạo khóa PBKDF2-SHA256 (600.000 vòng) và ký challenge một lần.</p>
          </div>
        </main>
      </AdminContext.Provider>
    );
  }

  return (
    <AdminContext.Provider value={context}>
      <div className="admin-shell">
        <nav className="admin-rail" aria-label="Khu vực quản trị">
          <div className="rail-brand"><span>TUNG</span><span>Admin</span></div>
          {NAV_GROUPS.map((group) => (
            <div className="rail-group" key={group.group}>
              <p className="rail-group-label">{group.group}</p>
              {group.items.map((item) => {
                const active = currentView === item.view && (!item.type || item.type === contentType);
                return (
                  <button
                    key={`${item.view}-${item.type ?? ""}`}
                    type="button"
                    className="rail-link"
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      void (async () => {
                        const preservesContent = item.view === "media" || (item.view === "content" && (!item.type || item.type === contentType));
                        const dirtyScope = dirty.has("content") && !preservesContent ? "content"
                          : currentView === "contacts" && dirty.has("contact") ? "contact"
                            : currentView === "settings" && dirty.has("settings") ? "settings" : null;
                        if (dirtyScope && !(await guardUnsaved(dirtyScope))) return;
                        if (item.view === "content") {
                          if (item.type && item.type !== contentType) {
                            setContentType(item.type);
                            setContentTarget(null);
                          }
                          showView("content");
                          return;
                        }
                        showView(item.view);
                      })();
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="rail-footer">
            <p id="session-user">{`${security.accessEmail || "Owner"}\nProtected by Cloudflare Access`}</p>
            <a href="/" target="_blank" rel="noreferrer">Xem site ↗</a>
          </div>
        </nav>
        <main className="admin-main">
          <div className="admin-topbar">
            <p className="eyebrow">Control desk</p>
            <span className="badge ready">Session hoạt động</span>
          </div>
          {currentView === "overview" ? <OverviewView /> : null}
          {currentView === "content" ? <ContentView target={contentTarget} onTargetConsumed={() => setContentTarget(null)} /> : null}
          {currentView === "contacts" ? <ContactsView /> : null}
          {currentView === "media" ? <MediaView /> : null}
          {currentView === "shop" ? <ShopWorkspace /> : null}
          {currentView === "settings" ? <SettingsView /> : null}
          {currentView === "security" ? <SecurityView sessionExpiresAt={security.sessionExpiresAt} /> : null}
        </main>
      </div>
    </AdminContext.Provider>
  );
}

export default function AdminApp() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminShell />
      </ConfirmProvider>
    </ToastProvider>
  );
}
