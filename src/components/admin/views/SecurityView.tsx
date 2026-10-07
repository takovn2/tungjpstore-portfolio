import { useState } from "react";
import { securityRequest } from "../api/client";
import { createPasswordSalt, passwordCredential, validateClientAdminPassword } from "../lib/crypto";
import { formatDate } from "../lib/format";
import { Button } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { useAdmin } from "../AdminApp";

export function SecurityView({ sessionExpiresAt }: { sessionExpiresAt: string | null }) {
  const { security, setSecurity, lockToGate } = useAdmin();
  const status = useStatus();
  const [busy, setBusy] = useState("");

  const refreshStatus = async () => {
    setBusy("refresh");
    try {
      const data = await securityRequest<{ security?: Record<string, unknown> }>("security/status");
      const value = (data.security || data) as Record<string, unknown>;
      setSecurity({
        passwordSalt: typeof value.passwordSalt === "string" ? value.passwordSalt : security.passwordSalt,
        passwordIterations: Number.isInteger(value.passwordIterations) ? Number(value.passwordIterations) : security.passwordIterations,
        passwordScheme: typeof value.passwordScheme === "string" ? value.passwordScheme : security.passwordScheme,
        sessionExpiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
      });
      status("Trạng thái bảo mật đã được cập nhật.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không thể kiểm tra bảo mật.", true);
    } finally {
      setBusy("");
    }
  };

  const logout = async () => {
    setBusy("logout");
    try {
      await securityRequest("security/logout", { method: "POST", body: JSON.stringify({}) });
      lockToGate();
      status("Đã đăng xuất phiên quản trị.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không thể đăng xuất.", true);
    } finally {
      setBusy("");
    }
  };

  const changePassword = async (form: HTMLFormElement) => {
    const current = (form.elements.namedItem("currentPassword") as HTMLInputElement).value;
    const next = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    const confirmValue = (form.elements.namedItem("newPasswordConfirm") as HTMLInputElement).value;
    if (next !== confirmValue) throw new Error("Mật khẩu mới chưa trùng nhau.");
    if (!validateClientAdminPassword(next)) throw new Error("Mật khẩu mới chưa đạt chính sách tối thiểu 14 ký tự và cần ít nhất 2 nhóm ký tự.");
    if (!security.passwordSalt) throw new Error("Thiếu thông tin dẫn xuất. Hãy tải lại trang quản trị.");
    const currentCredential = await passwordCredential(current, security.passwordSalt, security.passwordIterations);
    const newSalt = createPasswordSalt();
    const newCredential = await passwordCredential(next, newSalt);
    await securityRequest("security/change", { method: "POST", body: JSON.stringify({ currentPassword: currentCredential, newPassword: newCredential }) });
    form.reset();
    setSecurity({ passwordSalt: newSalt, passwordIterations: newCredential.iterations, passwordScheme: newCredential.scheme });
    status("Mật khẩu đã được đổi; mọi phiên bị thu hồi.");
    lockToGate("Mật khẩu đã được đổi và mọi phiên quản trị đã bị thu hồi. Vui lòng đăng nhập lại.");
    return true;
  };

  return (
    <section id="security-view">
      <header className="view-heading">
        <div>
          <p className="eyebrow">Vận hành</p>
          <h1 tabIndex={-1}>Bảo mật</h1>
          <p className="help">Hai lớp: Cloudflare Access xác thực danh tính, mật khẩu quản trị mở khóa dữ liệu.</p>
        </div>
      </header>
      <div className="grid2">
        <section className="section-card">
          <div className="section-heading">
            <div><h2>Phiên truy cập</h2><p id="security-session-info">{sessionExpiresAt ? `Phiên hết hạn: ${formatDate(sessionExpiresAt, true)}` : "Session: chưa có hoặc đã hết hạn"}</p></div>
          </div>
          <dl className="kv-list">
            <div><dt>Danh tính</dt><dd>{security.accessEmail || "—"}</dd></div>
            <div><dt>Scheme</dt><dd>{security.passwordScheme}</dd></div>
            <div><dt>KDF</dt><dd>PBKDF2-SHA256 · {security.passwordIterations.toLocaleString("vi-VN")} vòng</dd></div>
          </dl>
          <div className="view-actions">
            <Button busy={busy === "refresh"} busyLabel="Đang kiểm tra…" onClick={() => void refreshStatus()}>Kiểm tra trạng thái</Button>
            <Button variant="danger" busy={busy === "logout"} busyLabel="Đang đăng xuất…" onClick={() => void logout()}>Đăng xuất</Button>
          </div>
        </section>
        <section className="section-card">
          <div className="section-heading">
            <div><h2>Đổi mật khẩu</h2><p>Đổi mật khẩu thu hồi toàn bộ phiên và yêu cầu đăng nhập lại.</p></div>
          </div>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const button = form.querySelector('[type="submit"]') as HTMLButtonElement | null;
              button?.setAttribute("data-busy", "true");
              void changePassword(form)
                .catch((error: unknown) => status(error instanceof Error ? error.message : "Không đổi được mật khẩu.", true))
                .finally(() => button?.removeAttribute("data-busy"));
            }}
          >
            <label><strong>Mật khẩu hiện tại</strong><input name="currentPassword" type="password" autoComplete="current-password" minLength={14} maxLength={128} required /></label>
            <label><strong>Mật khẩu mới</strong><input name="newPassword" type="password" autoComplete="new-password" minLength={14} maxLength={128} required /></label>
            <label><strong>Nhập lại mật khẩu mới</strong><input name="newPasswordConfirm" type="password" autoComplete="new-password" minLength={14} maxLength={128} required /></label>
            <button type="submit" className="button primary">Đổi mật khẩu</button>
          </form>
        </section>
      </div>
    </section>
  );
}
