import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAdmin } from "../AdminApp";
import { Button } from "../ui/primitives";
import { useStatus } from "../ui/Toast";

const quickContactBooleanKeys = ["quickContactEnabled", "quickContactMessengerEnabled", "quickContactZaloEnabled", "quickContactTelegramEnabled"];
const quickChannelLabelKeys = ["quickContactMessengerLabelVi", "quickContactMessengerLabelEn", "quickContactMessengerLabelJa", "quickContactMessengerLabelZh"];
const quickTitleKeys = ["quickContactTitleVi", "quickContactTitleEn", "quickContactTitleJa", "quickContactTitleZh"];
const quickChannels: Array<[string, string, string[]]> = [
  ["Messenger", "m.me/…", quickChannelLabelKeys],
  ["Zalo", "zalo.me/…", ["quickContactZaloLabelVi", "quickContactZaloLabelEn", "quickContactZaloLabelJa", "quickContactZaloLabelZh"]],
  ["Telegram", "t.me/…", ["quickContactTelegramLabelVi", "quickContactTelegramLabelEn", "quickContactTelegramLabelJa", "quickContactTelegramLabelZh"]],
];
const localeSuffix = ["Vi", "En", "Ja", "Zh"];

export function SettingsView() {
  const { markDirty, isDirty } = useAdmin();
  const status = useStatus();
  const [version, setVersion] = useState(1);
  const [versionLabel, setVersionLabel] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [config, setConfig] = useState("{}");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const fill = useCallback((value: Record<string, unknown>, nextVersion: number, updatedAt: string) => {
    setVersion(nextVersion);
    setVersionLabel(`version=${nextVersion} · updated=${updatedAt || "—"}`);
    setContactEmail(typeof value.contactEmail === "string" ? value.contactEmail : "");
    setConfig(JSON.stringify(value, null, 2));
    setFlags(Object.fromEntries(quickContactBooleanKeys.map((key) => [key, value[key] !== false])));
    setTexts(Object.fromEntries(
      [...quickTitleKeys, ...quickChannels.flatMap(([, , keys]) => keys), "quickContactMessengerUrl", "quickContactZaloUrl", "quickContactTelegramUrl"]
        .map((key) => [key, typeof value[key] === "string" ? String(value[key]) : ""]),
    ));
    markDirty("settings", false);
  }, [markDirty]);

  const load = useCallback(async () => {
    try {
      const data = await api<{ settings?: { config?: Record<string, unknown>; version?: number; updatedAt?: string } }>("settings");
      fill(data.settings?.config || {}, data.settings?.version || 1, data.settings?.updatedAt || "");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không tải được thiết lập.", true);
    }
  }, [fill, status]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(config || "{}");
      } catch {
        throw new Error("Config JSON không hợp lệ");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Config phải là một JSON object");
      const email = contactEmail.trim();
      if (email) parsed.contactEmail = email;
      else delete parsed.contactEmail;
      for (const key of quickContactBooleanKeys) parsed[key] = Boolean(flags[key]);
      for (const [key, value] of Object.entries(texts)) {
        if (value.trim()) parsed[key] = value.trim();
        else delete parsed[key];
      }
      const data = await api<{ settings?: { config?: Record<string, unknown>; version?: number; updatedAt?: string } }>("settings", {
        method: "PUT",
        body: JSON.stringify({ config: parsed, expectedVersion: version }),
      });
      fill(data.settings?.config || {}, data.settings?.version || version + 1, data.settings?.updatedAt || "");
      status("Đã lưu thiết lập site.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Không lưu được thiết lập.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="settings-view">
      <header className="view-heading">
        <div>
          <p className="eyebrow">Vận hành</p>
          <h1 tabIndex={-1}>Thiết lập site</h1>
          <p className="help" id="settings-version">{versionLabel}</p>
        </div>
      </header>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        void save();
      }} onInput={() => markDirty("settings")}>
        <section className="section-card">
          <div className="section-heading"><div><h2>Liên hệ chung</h2><p>Email hiển thị trên trang liên hệ.</p></div></div>
          <label><strong>Email liên hệ</strong><input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="hello@tung.codes" /></label>
        </section>

        <section className="section-card">
          <div className="section-heading"><div><h2>Kênh quick-contact</h2><p>Messenger / Zalo / Telegram hiện ở đầu trang liên hệ.</p></div></div>
          <div className="check-grid">
            {quickContactBooleanKeys.map((key) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(flags[key])}
                  onChange={(event) => setFlags({ ...flags, [key]: event.target.checked })}
                />
                <span>{key === "quickContactEnabled" ? "Bật quick-contact" : key.replace("quickContact", "").replace("Enabled", "")}</span>
              </label>
            ))}
          </div>
          <div className="grid2">
            {quickTitleKeys.map((key, index) => (
              <label key={key}><strong>Tiêu đề ({["VI", "EN", "JA", "ZH"][index]})</strong>
                <input value={texts[key] || ""} onChange={(event) => setTexts({ ...texts, [key]: event.target.value })} />
              </label>
            ))}
          </div>
          {quickChannels.map(([channel, placeholder, labelKeys]) => (
            <fieldset key={channel} className="settings-channel">
              <legend>{channel}</legend>
              <label><strong>{channel} URL</strong>
                <input
                  value={texts[`quickContact${channel}Url`] || ""}
                  placeholder={placeholder}
                  onChange={(event) => setTexts({ ...texts, [`quickContact${channel}Url`]: event.target.value })}
                />
              </label>
              <div className="grid2">
                {labelKeys.map((key, index) => (
                  <label key={key}><strong>Nhãn {localeSuffix[index]}</strong>
                    <input value={texts[key] || ""} onChange={(event) => setTexts({ ...texts, [key]: event.target.value })} />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>

        <section className="section-card">
          <div className="section-heading"><div><h2>Config nâng cao</h2><p>JSON gốc; mọi trường vẫn phải vượt kiểm dịch phía Worker.</p></div></div>
          <label><strong>Config JSON</strong><textarea className="mono" rows={10} spellCheck={false} value={config} onInput={(event) => setConfig(event.currentTarget.value)} /></label>
        </section>

        <div className="sticky-actions">
          <span className="dirty-indicator" id="settings-dirty" hidden={!isDirty("settings")}>● Chưa lưu</span>
          <button type="submit" className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu thiết lập"}</button>
        </div>
      </form>
    </section>
  );
}
