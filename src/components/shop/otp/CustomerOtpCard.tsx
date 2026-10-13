import { useEffect, useRef, useState } from "react";
import { getOtpCopy } from "../../../i18n/shop-otp";
import type { Locale } from "../../../i18n/dictionaries";
import "./customer-otp.css";
type State = "idle" | "checking" | "pending" | "found" | "setup_pending" | "reauth_required" | "untrusted" | "ambiguous" | "rate_limited" | "unavailable" | "revoked" | "timedOut";
export default function CustomerOtpCard({ orderId, allocationId, title, locale, grantState }: {
  orderId: string; allocationId: string; title: string; locale: Locale; grantState: string;
}) {
  const labels = getOtpCopy(locale);
  const [state, setState] = useState<State>(grantState === "pending" ? "setup_pending" : grantState === "active" ? "idle" : "revoked");
  const [value, setValue] = useState<{ code: string; receivedAt: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const initialState: State = grantState === "pending" ? "setup_pending" : grantState === "active" ? "idle" : "revoked";
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0), running = useRef(false), deadline = useRef(0);
  const clear = () => {
    generation.current += 1; running.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (limitTimer.current) clearTimeout(limitTimer.current);
    limitTimer.current = null; timer.current = null; controller.current?.abort(); controller.current = null;
    setValue(null); setCopyStatus("");
  };
  useEffect(() => {
    const hidden = () => { if (document.hidden) { clear(); setState(initialState); } };
    const leave = () => { clear(); setState(initialState); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    document.addEventListener("astro:before-swap", leave);
    const logout = () => { clear(); setState("reauth_required"); };
    window.addEventListener("shop:logout", logout);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("shop-session-events");
    if (channel) channel.onmessage = (event) => { if (event.data === "logout") logout(); };
    return () => {
      clear(); document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave); document.removeEventListener("astro:before-swap", leave);
      window.removeEventListener("shop:logout", logout); channel?.close();
    };
  }, []);
  const check = async (token: number) => {
    if (token !== generation.current || document.hidden) return;
    if (Date.now() >= deadline.current) { running.current = false; setState("timedOut"); return; }
    controller.current = new AbortController();
    const abort = setTimeout(() => controller.current?.abort(), 8000);
    setState("checking");
    try {
      const response = await fetch(`/api/shop/me/orders/${encodeURIComponent(orderId)}/otp`, {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" },
        body: JSON.stringify({ allocationId }), signal: controller.current.signal,
      });
      const result = await response.json() as { ok?: boolean; state?: string; code?: string; receivedAt?: string; redirectUrl?: string };
      if (token !== generation.current || document.hidden) return;
      if (response.ok && result.ok === true && result.state === "found" && typeof result.code === "string" && /^[0-9]{4,8}$/.test(result.code) && typeof result.receivedAt === "string" && Number.isFinite(Date.parse(result.receivedAt)) && Date.parse(result.receivedAt) <= Date.now() && Date.now() - Date.parse(result.receivedAt) < 120000) {
        if (limitTimer.current) clearTimeout(limitTimer.current);
        limitTimer.current = null;
        setValue({ code: result.code, receivedAt: result.receivedAt }); setState("found"); running.current = false;
        timer.current = setTimeout(() => { clear(); setState(initialState); }, Math.max(0, Math.min(120000, Date.parse(result.receivedAt!) + 120000 - Date.now())));
      } else if (response.ok && result.ok && result.state === "pending") {
        setState("pending"); timer.current = setTimeout(() => void check(token), 5000);
      } else {
        clear();
        const errors: Record<string, State> = { reauth_required: "reauth_required", customer_auth_required: "reauth_required",
          otp_setup_pending: "setup_pending", otp_ambiguous: "ambiguous", otp_untrusted: "untrusted",
          otp_rate_limited: "rate_limited", otp_not_available: "revoked", otp_service_unavailable: "unavailable" };
        setState(errors[result.code ?? ""] ?? "unavailable");
      }
    } catch { if (token === generation.current) { clear(); setState("unavailable"); } }
    finally { clearTimeout(abort); }
  };
  const start = () => { if (running.current) return; clear(); running.current = true; deadline.current = Date.now() + 120000; limitTimer.current = setTimeout(() => { clear(); setState("timedOut"); }, 120000); void check(generation.current); };
  const reauth = async (provider: "google" | "email") => {
    clear(); setState("checking");
    const token = generation.current;
    controller.current = new AbortController();
    const abort = setTimeout(() => controller.current?.abort(), 8000);
    try {
      const response = await fetch("/api/shop/auth/reauth", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, allocationId, locale, provider }), signal: controller.current.signal });
      const result = await response.json() as { ok?: boolean; state?: string; code?: string; receivedAt?: string; redirectUrl?: string };
      if (token !== generation.current || document.hidden) return;
      if (!response.ok || !result.ok) { setState("unavailable"); return; }
      if (result.redirectUrl) {
        const destination = new URL(result.redirectUrl);
        if (destination.origin !== "https://accounts.google.com") { setState("unavailable"); return; }
        window.location.assign(destination.href);
      } else { setState("reauth_required"); setCopyStatus(labels.emailSent); }
    } catch { if (token === generation.current) setState("unavailable"); }
    finally { clearTimeout(abort); }
  };
  const copy = async () => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value.code); setCopyStatus(labels.copied); }
    catch { setCopyStatus(labels.copyFailed); }
  };
  return <article className="customer-otp" data-otp-allocation={allocationId}>
    <h3>{labels.title}</h3><p className="customer-otp__title">{title}</p><p>{labels.instruction}</p>
    <p role="status" aria-live="polite" aria-atomic="true">{labels[state]}</p>
    {value && <div className="customer-otp__result"><output className="customer-otp__code" aria-label={labels.title}>{value.code}</output>
      <p>{labels.received} <time dateTime={value.receivedAt}>{new Date(value.receivedAt).toLocaleString(locale === "vi" ? "vi-VN" : locale === "ja" ? "ja-JP" : locale === "zh" ? "zh-CN" : "en-US")}</time></p>
      <button type="button" onClick={() => void copy()}>{labels.copy}</button><p>{labels.caveat}</p></div>}
    {state === "reauth_required" ? <div className="customer-otp__actions">
      <button type="button" onClick={() => void reauth("google")}>{labels.reauthGoogle}</button>
      <button type="button" onClick={() => void reauth("email")}>{labels.reauthEmail}</button>
    </div> : <button type="button" disabled={["checking","pending","setup_pending","revoked"].includes(state)} onClick={start}>{labels.get}</button>}
    <p aria-live="polite">{copyStatus}</p>
  </article>;
}
