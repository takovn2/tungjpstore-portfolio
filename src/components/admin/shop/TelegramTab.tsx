import { useEffect, useMemo, useState } from "react";
import { securityRequest, shopApi, getAccessIdentity } from "../api/client";
import { useAdmin } from "../AdminApp";
import { Dialog } from "../ui/Dialog";
import { Button, EmptyState, StatusBadge, SystemDot } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { formatDate } from "../lib/format";
import { loginChallengeProof, passwordCredential } from "../lib/crypto";
import { shopStateText, telegramBotStatusLabels, telegramEventLabels } from "../lib/labels";
import { useShop, type TelegramBot } from "./useShop";

const telegramBotUsername = (bot: Record<string, any>) => {
  const value = typeof bot?.username === "string" ? bot.username : typeof bot?.botUsername === "string" ? bot.botUsername : "";
  return value ? `@${value.replace(/^@/, "")}` : "Chưa xác định username";
};

const telegramBotFingerprint = (bot: Record<string, any>) => {
  const value = typeof bot?.fingerprint === "string" ? bot.fingerprint : typeof bot?.tokenFingerprint === "string" ? bot.tokenFingerprint : "";
  return value ? `Fingerprint ${value.slice(0, 12)}` : "Token đã mã hóa";
};

const telegramBotInitials = (bot: Record<string, any>) => {
  const value = String(bot?.label || bot?.firstName || bot?.botName || bot?.username || "TG").replace(/^@/, "").trim();
  return value.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join("").toUpperCase().slice(0, 2) || "TG";
};

/** Step-up confirmation: username echo + one-time password proof (never raw). */
function TelegramConfirmDialog({ bot, action, kind, onResolved }: {
  bot: Record<string, any>;
  action: string;
  kind: "activate" | "rollback" | "revoke" | "standby";
  onResolved: (ok: boolean) => void;
}) {
  const { security } = useAdmin();
  const [confirmUsername, setConfirmUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const expected = String(bot?.username || bot?.botUsername || "").replace(/^@/, "").trim().toLowerCase();

  const impact = kind === "revoke"
    ? { title: "Không thể hoàn tác", copy: `Credential mã hóa của @${expected} sẽ bị xóa. Muốn dùng lại bot này, bạn phải lấy token mới từ BotFather và đăng ký lại.`, tone: "danger" }
    : kind === "rollback"
      ? { title: `Khôi phục @${expected}`, copy: "Webhook, menu và Mini App sẽ quay lại bot trước. Catalog, khách hàng, đơn hàng và key không thay đổi.", tone: "safe" }
      : kind === "standby"
        ? { title: `Lưu credential của @${expected}`, copy: "Token sẽ được mã hóa trong Worker và bot vẫn ở trạng thái chờ; chưa thay đổi bot đang nhận khách.", tone: "safe" }
        : { title: `Chuyển khách sang @${expected}`, copy: "Server sẽ kiểm tra Bot API, cấu hình menu/Mini App và chỉ đổi bot active sau khi webhook mới sẵn sàng.", tone: "safe" };

  const submit = async () => {
    try {
      if (confirmUsername.trim().replace(/^@/, "").toLowerCase() !== expected) throw new Error(`Cần nhập đúng @${expected} để tiếp tục.`);
      if (!password || !security.passwordSalt) throw new Error("Cần xác minh lại mật khẩu quản trị.");
      const credential = await passwordCredential(password, security.passwordSalt, security.passwordIterations);
      const issued = await securityRequest<{ challenge: Parameters<typeof loginChallengeProof>[1] }>("security/challenge", { method: "POST", body: JSON.stringify({ action: "login" }) });
      const proof = await loginChallengeProof(credential, issued.challenge, getAccessIdentity());
      const authenticated = await securityRequest<{ authenticated?: boolean; ok?: boolean }>("security/login", { method: "POST", body: JSON.stringify({ challenge: proof }) });
      if (!authenticated.authenticated && authenticated.ok !== true) throw new Error("Không thể xác minh lại mật khẩu quản trị.");
      onResolved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xác minh thao tác.");
      throw err;
    } finally {
      setPassword("");
    }
  };

  return (
    <Dialog
      title={`${action} bot Telegram`}
      onClose={() => onResolved(false)}
      onSubmit={submit}
      submitLabel={action}
      busyLabel="Đang xác nhận…"
      submitVariant={kind === "revoke" ? "danger" : "primary"}
      eyebrow="Step-up"
    >
      <div className="telegram-confirm-impact" data-tone={impact.tone}>
        <strong>{impact.title}</strong>
        <p>{impact.copy}</p>
      </div>
      <label><strong>Nhập lại username để xác nhận</strong><input autoComplete="off" spellCheck={false} value={confirmUsername} placeholder={expected} onChange={(event) => setConfirmUsername(event.target.value)} /></label>
      <label><strong>Xác minh lại mật khẩu quản trị</strong><input type="password" autoComplete="current-password" minLength={14} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="dialog-feedback" data-state="error" role="alert">{error}</p> : null}
      <p className="help">Thao tác nhạy cảm yêu cầu phiên mật khẩu mới trong 30 phút gần nhất. Mật khẩu chỉ dùng để tạo proof cục bộ và không được gửi nguyên văn.</p>
    </Dialog>
  );
}

export function TelegramTab() {
  const { telegram, telegramBots, telegramEvents, telegramEncryptionConfigured, telegramRegistryManaged, loadTelegramBots } = useShop();
  const status = useStatus();
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("legacy");
  const [formStatus, setFormStatus] = useState<{ message: string; state: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [confirmation, setConfirmation] = useState<{ bot: Record<string, any>; action: string; kind: "activate" | "rollback" | "revoke" | "standby"; run: () => Promise<void>; onCancel?: () => void } | null>(null);

  useEffect(() => {
    void loadTelegramBots().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(
    () => telegramBots.find((bot) => String(bot.status).toLowerCase() === "active") || telegram,
    [telegramBots, telegram],
  );
  const webhookReady = Boolean((active as Record<string, any>)?.webhookConfigured || (active as Record<string, any>)?.webhookRegistered || (active as Record<string, any>)?.lastConfiguredAt);

  const previousCandidate = (botScope: string) => telegramBots.find((bot) => {
    if (String(bot?.status || "").toLowerCase() !== "previous") return false;
    if (botScope && bot?.scope !== botScope) return false;
    const expiresAt = bot?.previousExpiresAt ? new Date(String(bot.previousExpiresAt)).valueOf() : 0;
    return !expiresAt || expiresAt > Date.now();
  }) || null;

  const runWithStepUp = (bot: Record<string, any>, action: string, kind: "activate" | "rollback" | "revoke" | "standby", run: () => Promise<void>, onCancel?: () => void) => {
    setConfirmation({ bot, action, kind, run, onCancel });
  };

  /** Await a step-up confirmation; resolves false when the dialog is dismissed. */
  const requestStepUp = (bot: Record<string, any>, action: string, kind: "activate" | "rollback" | "revoke" | "standby") =>
    new Promise<boolean>((resolve) => {
      runWithStepUp(bot, action, kind, async () => resolve(true), () => resolve(false));
    });

  const executeBotAction = async (botId: string, mode: "activate" | "rollback" | "test" | "revoke") => {
    const bot = telegramBots.find((item) => String(item.id) === String(botId));
    if (!bot) {
      status("Không tìm thấy bot trong registry. Hãy làm mới danh sách.", true);
      return;
    }
    const actionLabel = mode === "rollback" ? "Rollback" : mode === "revoke" ? "Thu hồi" : "Kích hoạt";
    if (mode === "test") {
      setBusy(`test-${botId}`);
      try {
        const data = await shopApi<{ test?: { webhookMatches?: boolean } }>(`telegram/bots/${encodeURIComponent(botId)}/test`, { method: "POST", body: JSON.stringify({}) });
        status(data.test?.webhookMatches
          ? `${telegramBotUsername(bot)} đang kết nối đúng webhook.`
          : `${telegramBotUsername(bot)} truy cập được nhưng webhook chưa trùng cấu hình hiện tại.`);
        await loadTelegramBots();
      } catch (error) {
        status(error instanceof Error ? error.message : "Không kiểm tra được bot.", true);
      } finally {
        setBusy("");
      }
      return;
    }
    const confirmationBot = mode === "rollback" ? previousCandidate(String(bot.scope || "legacy")) : bot;
    if (!confirmationBot) {
      status("Bot trước không còn trong thời gian rollback. Hãy làm mới registry.", true);
      return;
    }
    runWithStepUp(confirmationBot, actionLabel, mode, async () => {
      const expectedVersion = Number(bot.version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        status("Phiên bản cấu hình bot không hợp lệ. Hãy làm mới danh sách.", true);
        return;
      }
      try {
        await shopApi(`telegram/bots/${encodeURIComponent(botId)}/${mode}`, { method: "POST", body: JSON.stringify({ expectedVersion }) });
        status(`${actionLabel} ${telegramBotUsername(confirmationBot)} thành công. Webhook mới đang nhận update.`);
      } catch (error) {
        await loadTelegramBots().catch(() => undefined);
        throw error;
      }
      await loadTelegramBots();
    });
  };

  const validateToken = async () => {
    if (!token.trim()) throw new Error("Cần nhập token BotFather để kiểm tra.");
    const value = token.trim();
    setToken("");
    setFormStatus({ message: "Đang kiểm tra token với Telegram Bot API…", state: "pending" });
    try {
      const data = await shopApi<{ identity?: Record<string, any>; bot?: Record<string, any> }>("telegram/bots/validate", { method: "POST", body: JSON.stringify({ token: value }) });
      const identity = data.bot || data.identity || data;
      setFormStatus({ message: `${telegramBotUsername(identity)} hợp lệ. Token đã bị xóa khỏi trình duyệt; hãy dán lại nếu muốn lưu bot.`, state: "success" });
      status(`Đã kiểm tra ${telegramBotUsername(identity)}. Chưa có credential nào được lưu.`);
    } catch (error) {
      setFormStatus({ message: error instanceof Error ? error.message : "Token không hợp lệ hoặc Telegram tạm thời không phản hồi.", state: "error" });
      throw error;
    }
  };

  const saveBot = async (activate: boolean) => {
    if (!token.trim()) throw new Error("Cần nhập token BotFather để lưu bot.");
    const value = token.trim();
    setFormStatus({ message: activate ? "Đang kiểm tra token và chuẩn bị chuyển bot…" : "Đang kiểm tra token và chuẩn bị lưu dạng chờ…", state: "pending" });
    try {
      const validated = await shopApi<{ identity?: Record<string, any>; bot?: Record<string, any> }>("telegram/bots/validate", { method: "POST", body: JSON.stringify({ token: value }) });
      const identity = validated.identity || validated.bot || validated;
      const confirmed = await requestStepUp(identity, activate ? "Lưu & kích hoạt" : "Lưu dạng chờ", activate ? "activate" : "standby");
      if (!confirmed) throw new Error("Đã hủy thao tác đổi bot.");
      const result = await shopApi<{ bot?: { id?: string; version?: number } }>("telegram/bots", {
        method: "POST",
        body: JSON.stringify({ token: value, scope, ...(label.trim() ? { label: label.trim() } : {}) }),
      });
      setToken("");
      setLabel("");
      await loadTelegramBots();
      if (activate && result.bot?.id) {
        const expectedVersion = Number(result.bot.version);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("Phiên bản bot mới không hợp lệ.");
        await shopApi(`telegram/bots/${encodeURIComponent(result.bot.id)}/activate`, { method: "POST", body: JSON.stringify({ expectedVersion }) });
        await loadTelegramBots();
      }
      setFormStatus({ message: activate ? "Đã lưu, cấu hình webhook/menu và kích hoạt bot mới thành công." : "Đã lưu bot dạng chờ; chưa nhận update cho đến khi kích hoạt.", state: "success" });
    } catch (error) {
      await loadTelegramBots().catch(() => undefined);
      setFormStatus({ message: error instanceof Error ? error.message : "Không thể lưu bot.", state: "error" });
      throw error;
    }
  };

  const disabled = !telegramEncryptionConfigured;

  return (
    <div className="shop-panel" data-shop-panel="telegram">
      <div className="telegram-summary">
        <div className="telegram-summary-card">
          <p className="eyebrow">Bot đang nhận khách</p>
          <strong data-shop-telegram-summary="active">{active ? telegramBotUsername(active as Record<string, any>) : "Chưa có bot"}</strong>
          <span className="help">{active ? "Webhook nhận update trực tiếp" : "Thêm bot để bắt đầu"}</span>
        </div>
        <div className="telegram-summary-card">
          <p className="eyebrow">Webhook</p>
          <strong data-shop-telegram-summary="webhook">{webhookReady ? "Sẵn sàng" : active ? "Cần kiểm tra" : "Chưa có bot"}</strong>
          <span className="help">Endpoint Worker + allowed updates</span>
        </div>
        <div className="telegram-summary-card">
          <p className="eyebrow">Registry</p>
          <strong>{telegramBots.length} bot{telegramRegistryManaged ? " · managed" : ""}</strong>
          <span className="help" data-shop-telegram-summary="checked">{telegramEncryptionConfigured ? "Kho credential sẵn sàng" : "Chưa xác minh mã hóa"}</span>
        </div>
      </div>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Bot fleet</p><h3>Danh sách bot</h3></div>
          <Button busy={busy.startsWith("test-")} busyLabel="Đang làm mới…" onClick={() => void loadTelegramBots()}>Làm mới registry</Button>
        </div>
        <div className="telegram-registry-status" data-state={telegramEncryptionConfigured ? "ready" : "blocked"}>
          <SystemDot state={telegramEncryptionConfigured ? "healthy" : "error"} />
          <div>
            <strong>{telegramEncryptionConfigured ? "Kho credential đã sẵn sàng" : "Chưa thể thêm bot mới"}</strong>
            <p>{telegramEncryptionConfigured
              ? "Token được mã hóa phía server; danh sách chỉ hiển thị username, fingerprint rút gọn và revision."
              : "Thiếu TELEGRAM_TOKEN_ENCRYPTION_SECRET trên Worker. Không nhập token cho đến khi owner cấu hình secret."}</p>
          </div>
        </div>
        <div className="telegram-bot-list" data-shop-list="telegram-bots">
          {telegramBots.length ? telegramBots.map((bot) => {
            const status = String(bot.status || "standby").toLowerCase();
            const isActive = status === "active";
            const hasPrevious = Boolean(previousCandidate(String(bot.scope || "legacy")));
            const registryReady = telegramEncryptionConfigured;
            return (
              <article className="telegram-bot-card" key={bot.id} data-shop-id={bot.id} data-status={status} data-active={String(isActive)}>
                <span className="telegram-bot-card__mark" aria-hidden="true">{telegramBotInitials(bot)}</span>
                <div className="telegram-bot-card__main">
                  <strong>{String(bot.label || bot.firstName || bot.botName || telegramBotUsername(bot))}</strong>
                  <span>{telegramBotUsername(bot)} · {telegramBotFingerprint(bot)}</span>
                  <div className="telegram-bot-card__meta">
                    <span>{bot.scope === "glb" ? "GLB Store · Global" : "Legacy · Việt Nam"}</span>
                    <span>{isActive && bot.lastConfiguredAt ? "Webhook đang nhận update" : status === "previous" ? `Rollback đến ${bot.previousExpiresAt ? formatDate(bot.previousExpiresAt, true) : "khi có bot mới"}` : status === "error" ? "Cần kiểm tra lại webhook" : status === "revoked" ? "Credential đã xóa" : "Chưa nhận update"}</span>
                    {bot.version ? <span>Revision {String(bot.version)}</span> : null}
                    {bot.lastValidatedAt ? <span>Kiểm tra {formatDate(bot.lastValidatedAt, true)}</span> : null}
                  </div>
                </div>
                <div className="telegram-bot-card__side">
                  <StatusBadge status={status === "active" ? "healthy" : status === "error" ? "failed" : status} label={telegramBotStatusLabels[status] || shopStateText(status)} />
                  <div className="telegram-bot-card__actions">
                    {!["activating", "retiring", "revoked"].includes(status) ? <Button size="small" disabled={!registryReady} onClick={() => void executeBotAction(bot.id, "test")}>Kiểm tra kết nối</Button> : null}
                    {["standby", "error"].includes(status) ? <Button size="small" variant="primary" disabled={!registryReady} onClick={() => void executeBotAction(bot.id, "activate")}>Kích hoạt bot</Button> : null}
                    {status === "active" && hasPrevious ? <Button size="small" disabled={!registryReady} onClick={() => void executeBotAction(bot.id, "rollback")}>Rollback về bot trước</Button> : null}
                    {["standby", "previous", "error"].includes(status) ? <Button size="small" variant="danger" disabled={!registryReady} onClick={() => void executeBotAction(bot.id, "revoke")}>Thu hồi token</Button> : null}
                  </div>
                </div>
              </article>
            );
          }) : <EmptyState title="Chưa có bot được quản lý." hint="Token không được hiển thị lại sau khi lưu." />}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading"><div><p className="eyebrow">Add bot</p><h3>Thêm / đổi bot</h3></div></div>
        <form className="form telegram-form" data-shop-telegram-form data-ready={String(telegramEncryptionConfigured)} onSubmit={(event) => {
          event.preventDefault();
        }}>
          <div className="grid2">
            <label><strong>Token BotFather</strong><input name="token" type="password" autoComplete="off" value={token} disabled={disabled} onChange={(event) => setToken(event.target.value)} placeholder="123456:ABC-DEF…" /></label>
            <label><strong>Nhãn (tuỳ chọn)</strong><input name="label" value={label} disabled={disabled} onChange={(event) => setLabel(event.target.value)} placeholder="TUNG Shop VN" /></label>
          </div>
          <label><strong>Phạm vi</strong>
            <select name="scope" value={scope} disabled={disabled} onChange={(event) => setScope(event.target.value)}>
              <option value="legacy">Legacy · Việt Nam (tung.codes)</option>
              <option value="glb">GLB Store · Global</option>
            </select>
          </label>
          {formStatus ? <p className="dialog-feedback" data-state={formStatus.state} role="status">{formStatus.message}</p> : null}
          <div className="actions">
            <Button disabled={disabled} onClick={() => {
              void validateToken().catch(() => undefined);
            }}>Kiểm tra token</Button>
            <Button variant="secondary" disabled={disabled} onClick={() => {
              void saveBot(false).catch(() => undefined);
            }}>Lưu dạng chờ</Button>
            <Button variant="primary" disabled={disabled} onClick={() => {
              void saveBot(true).catch(() => undefined);
            }}>Lưu & kích hoạt</Button>
          </div>
          <p className="help">Token bị xoá khỏi input ngay khi tạo yêu cầu và không bao giờ hiển thị lại.</p>
        </form>
      </section>

      <section className="section-card">
        <div className="section-heading"><div><p className="eyebrow">Audit</p><h3>Sự kiện registry</h3></div></div>
        <ul className="timeline telegram-events" data-shop-list="telegram-events">
          {telegramEvents.length ? telegramEvents.slice(0, 20).map((event, index) => {
            const rawAction = String(event.action || event.eventType || event.type || "updated");
            const actionLabel = telegramEventLabels[rawAction.toLowerCase()] || rawAction.replaceAll("_", " ");
            const stateValue = String(event.status || event.outcome || "completed");
            return (
              <li key={index}>
                <time>{formatDate(event.createdAt || event.occurredAt, true)}</time>
                <div>
                  <strong>{actionLabel}</strong>
                  <span>{String(event.botUsername || event.label || event.botId || "Bot Telegram")}{event.revision ? ` · Rev ${String(event.revision)}` : ""}{event.actor ? ` · ${String(event.actor)}` : ""}</span>
                </div>
                <StatusBadge status={stateValue === "failed" || stateValue === "error" ? "failed" : stateValue === "pending" ? "pending" : "healthy"} label={stateValue} />
              </li>
            );
          }) : <li className="shop-empty compact"><strong>Chưa có sự kiện.</strong><span>Lịch sử activate, rollback và kiểm tra sẽ hiển thị tại đây.</span></li>}
        </ul>
      </section>

      {confirmation ? (
        <TelegramConfirmDialog
          bot={confirmation.bot}
          action={confirmation.action}
          kind={confirmation.kind}
          onResolved={(ok) => {
            const current = confirmation;
            setConfirmation(null);
            if (ok) void current.run().catch((error: unknown) => status(error instanceof Error ? error.message : "Thao tác thất bại.", true));
            else current.onCancel?.();
          }}
        />
      ) : null}
    </div>
  );
}
