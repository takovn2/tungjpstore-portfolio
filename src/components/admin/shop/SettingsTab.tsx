import { useEffect, useState } from "react";
import { api, shopApi } from "../api/client";
import { useShop } from "./useShop";
import { Button, StatusBadge, SystemDot } from "../ui/primitives";
import { useStatus } from "../ui/Toast";

type CryptoForm = {
  provider: string; rail: string; asset: string; network: string; destinationValue: string;
  memoOrTag: string; displayName: string; status: string; minConfirmations: string; expiryMinutes: string; qrUrl: string;
};

const defaultCryptoForm: CryptoForm = {
  provider: "bybit", rail: "onchain_deposit", asset: "USDT", network: "ETHEREUM", destinationValue: "",
  memoOrTag: "", displayName: "USDT · Ethereum ERC20", status: "disabled", minConfirmations: "1", expiryMinutes: "30", qrUrl: "",
};

const defaultQrUrls: Record<string, string> = {
  ETHEREUM: "/payment-qr/bybit-usdt-erc20.png",
  BSC: "/payment-qr/bybit-usdt-bep20.png",
  POLYGON: "/payment-qr/bybit-usdt-polygon.png",
  TRON: "/payment-qr/bybit-usdt-trc20.png",
};

export function SettingsTab() {
  const { pricing, paymentProvider, cryptoMethods, notion, telegram, loadSettingsTab, loadTelegramBots, setTab } = useShop();
  const status = useStatus();
  const [usdVndRate, setUsdVndRate] = useState("");
  const [bankBin, setBankBin] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [notionToken, setNotionToken] = useState("");
  const [telegramMiniAppEnabled, setTelegramMiniAppEnabled] = useState(false);
  const [crypto, setCrypto] = useState<CryptoForm>(defaultCryptoForm);
  const [cryptoMethodId, setCryptoMethodId] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void loadSettingsTab().catch((error: unknown) => status(error instanceof Error ? error.message : "Không tải được cấu hình shop.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pricing?.usdVndRateScaled) setUsdVndRate(String(Number(pricing.usdVndRateScaled) / 1_000_000));
    if (notion?.editorialDatabaseId) setNotionDatabaseId(String(notion.editorialDatabaseId));
  }, [pricing, notion]);

  useEffect(() => {
    void api<{ settings?: { config?: Record<string, unknown> } }>("settings")
      .then((data) => setTelegramMiniAppEnabled(Boolean(data.settings?.config?.telegramMiniAppEnabled)))
      .catch(() => undefined);
  }, []);

  const saveSettings = async () => {
    setBusy("save");
    try {
      if (notionToken) setNotionToken("");
      if (usdVndRate) {
        const rate = Number(usdVndRate);
        if (!Number.isFinite(rate) || rate < 1 || rate > 100_000_000) throw new Error("Tỷ giá VND/USD không hợp lệ.");
        await shopApi("pricing", { method: "PUT", body: JSON.stringify({ usdVndRate: String(rate), expectedVersion: pricing?.version || undefined }) });
        status(`Đã cập nhật tỷ giá: 1 USD = ${rate.toLocaleString("en-US")} VND.`);
      }
      if (bankBin.trim() && bankAccountName.trim()) {
        if (paymentProvider?.status === "active") throw new Error("VietQR đã có cấu hình active; dùng nút kiểm tra provider để rà soát, không tạo bản ghi trùng.");
        const payload = {
          displayName: "TUNG payOS + VietQR", status: "active", provider: "vietqr",
          bankId: bankBin.trim().toUpperCase(), accountRef: "VIETQR_BANK_ACCOUNT",
          accountNameDisplay: bankAccountName.trim(), qrTemplate: "compact2",
          confirmationAdapter: "payos", secretRef: "PAYOS_CHECKSUM_KEY", publicConfig: {},
        };
        await shopApi("payment/providers", { method: "POST", body: JSON.stringify(payload) });
        status("Đã lưu cấu hình payOS + VietQR; số tài khoản vẫn chỉ nằm trong Worker Secret.");
      }
      if (crypto.destinationValue.trim()) {
        const internalUid = crypto.rail === "internal_uid";
        const network = internalUid ? "" : crypto.network.trim();
        const qrUrl = internalUid ? "" : crypto.qrUrl.trim() || (crypto.provider === "bybit" && crypto.asset === "USDT" ? defaultQrUrls[network] || "" : "");
        const payload = {
          provider: crypto.provider, rail: crypto.rail, asset: crypto.asset, network,
          destinationType: internalUid ? "uid" : "wallet_address", destinationValue: crypto.destinationValue.trim(),
          memoOrTag: crypto.memoOrTag.trim(), displayName: crypto.displayName.trim() || "Crypto payment",
          status: crypto.status, minConfirmations: Number(crypto.minConfirmations || 1),
          expiryMinutes: Number(crypto.expiryMinutes || 30), sortOrder: 0,
          publicConfig: qrUrl ? { qrUrl } : {},
        };
        if (cryptoMethodId) {
          const existing = cryptoMethods.find((method) => method.id === cryptoMethodId);
          await shopApi(`payment/crypto-methods/${encodeURIComponent(cryptoMethodId)}`, { method: "PUT", body: JSON.stringify({ ...payload, expectedVersion: existing?.version }) });
          status("Đã cập nhật địa chỉ nhận crypto.");
        } else {
          await shopApi("payment/crypto-methods", { method: "POST", body: JSON.stringify(payload) });
          status("Đã tạo địa chỉ nhận crypto. Admin sẽ duyệt bằng chứng thủ công.");
        }
        setCrypto(defaultCryptoForm);
        setCryptoMethodId("");
      }
      await loadSettingsTab();
    } catch (error) {
      status(error instanceof Error ? error.message : "Không lưu được cấu hình.", true);
    } finally {
      setBusy("");
    }
  };

  const notionAction = async (action: "status" | "test" | "sync") => {
    setBusy(`notion-${action}`);
    try {
      const data = await shopApi<{ integration?: Record<string, any> }>(action === "status" ? "integrations/notion" : `integrations/notion/${action}`, {
        ...(action === "status" ? {} : { method: "POST", body: JSON.stringify({}) }),
      });
      const fetched = data.integration?.fetched;
      status(action === "sync"
        ? `Đã chạy preview Notion (${Number.isFinite(Number(fetched)) ? Number(fetched) : 0} bản ghi); D1 vẫn là nguồn sự thật.`
        : `Notion ${data.integration?.configured ? "đã kết nối" : "chưa cấu hình"}.`);
      await loadSettingsTab();
    } catch (error) {
      status(error instanceof Error ? error.message : "Không thao tác được Notion.", true);
    } finally {
      setBusy("");
    }
  };

  const saveMiniAppToggle = async (checked: boolean) => {
    setTelegramMiniAppEnabled(checked);
    try {
      const current = await api<{ settings?: { config?: Record<string, unknown>; version?: number } }>("settings");
      const config = { ...(current.settings?.config || {}), telegramMiniAppEnabled: checked };
      await api("settings", { method: "PUT", body: JSON.stringify({ config, expectedVersion: current.settings?.version || 1 }) });
      status(checked ? "Đã bật Telegram Mini App Mode." : "Đã tắt Mini App — bot chạy luồng Chat truyền thống.");
    } catch (error) {
      setTelegramMiniAppEnabled(!checked);
      status(error instanceof Error ? error.message : "Không lưu được Mini App toggle.", true);
    }
  };

  const editCryptoMethod = (id: string) => {
    const method = cryptoMethods.find((item) => item.id === id);
    if (!method) {
      status("Không tìm thấy phương thức crypto. Hãy làm mới danh sách.", true);
      return;
    }
    setCryptoMethodId(method.id);
    setCrypto({
      provider: String(method.provider || "bybit"),
      rail: String(method.rail || "onchain_deposit"),
      asset: String(method.asset || "USDT"),
      network: String(method.network || ""),
      destinationValue: String(method.destinationValue || ""),
      memoOrTag: String(method.memoOrTag || ""),
      displayName: String(method.displayName || "Crypto payment"),
      status: method.status === "active" ? "active" : "disabled",
      minConfirmations: String(method.minConfirmations ?? 1),
      expiryMinutes: String(method.expiryMinutes ?? 30),
      qrUrl: typeof (method.publicConfig as Record<string, any>)?.qrUrl === "string" ? String((method.publicConfig as Record<string, any>).qrUrl) : "",
    });
    status(`Đang sửa ${String(method.displayName || method.provider)}. Nút lưu sẽ cập nhật phiên bản ${String(method.version)}.`);
  };

  const toggleCryptoMethod = async (id: string, nextActive: boolean) => {
    setBusy(`crypto-${id}`);
    try {
      const method = cryptoMethods.find((item) => item.id === id);
      if (!method) return;
      await shopApi(`payment/crypto-methods/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({
          provider: method.provider, rail: method.rail, asset: method.asset, network: method.network || "",
          destinationType: method.destinationType, destinationValue: method.destinationValue,
          memoOrTag: method.memoOrTag || "", displayName: method.displayName || "Crypto payment",
          status: nextActive ? "active" : "disabled", minConfirmations: method.minConfirmations,
          expiryMinutes: method.expiryMinutes, sortOrder: method.sortOrder,
          // Preserve the QR/account metadata when toggling; clearing it would
          // silently remove the customer-facing QR code.
          publicConfig: method.publicConfig || {},
          expectedVersion: method.version,
        }),
      });
      status(nextActive ? "Đã bật phương thức crypto cho checkout mới." : "Đã tắt phương thức crypto.");
      await loadSettingsTab();
    } catch (error) {
      status(error instanceof Error ? error.message : "Không chuyển được trạng thái.", true);
    } finally {
      setBusy("");
    }
  };

  const provider = paymentProvider;
  const providerReady = Boolean(provider && provider.configurationSupported === true && provider.ready === true);
  const activeCrypto = cryptoMethods.filter((method) => method.status === "active").length;
  const notionConfigured = Boolean(notion?.configured);
  const telegramActive = Boolean(telegram?.webhookConfigured);

  return (
    <div className="shop-panel" data-shop-panel="settings">
      <div className="grid2">
        <section className="section-card">
          <div className="section-heading"><div><p className="eyebrow">Store</p><h3>Thông tin & tỷ giá</h3></div></div>
          <label><strong>Tỷ giá USD → VND</strong>
            <input type="number" min={1} step={100} value={usdVndRate} onChange={(event) => setUsdVndRate(event.target.value)} placeholder="26500" />
            <small className="help">Giá USD và crypto tự tính từ giá VND cho đơn mới.</small>
          </label>
        </section>

        <section className="section-card">
          <div className="section-heading"><div><p className="eyebrow">Integrations</p><h3>Notion</h3></div>
            <StatusBadge status={notionConfigured ? "healthy" : "warning"} label={notionConfigured ? "Đã kết nối · preview" : "Chưa kết nối"} /></div>
          <label><strong>Editorial database ID</strong><input value={notionDatabaseId} onChange={(event) => setNotionDatabaseId(event.target.value)} placeholder="notion-database-id" /></label>
          <label><strong>Notion token (nhập lại khi đổi)</strong><input type="password" autoComplete="off" value={notionToken} onChange={(event) => setNotionToken(event.target.value)} placeholder="secret_…" /></label>
          <div className="actions">
            <Button busy={busy === "notion-status"} onClick={() => void notionAction("status")}>Kiểm tra</Button>
            <Button busy={busy === "notion-test"} onClick={() => void notionAction("test")}>Test kết nối</Button>
            <Button busy={busy === "notion-sync"} onClick={() => void notionAction("sync")}>Preview sync</Button>
          </div>
          <p className="help">Notion chỉ chạy ở chế độ preview; D1 vẫn là nguồn sự thật.</p>
        </section>
      </div>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">PayOS + VietQR</p><h3>Thanh toán truyền thống</h3></div>
          <StatusBadge status={providerReady ? "healthy" : "warning"} label={providerReady ? "payOS sẵn sàng" : provider ? "Cần kiểm tra" : "Chưa cấu hình"} />
        </div>
        <div className="grid2">
          <label><strong>BIN ngân hàng</strong><input value={bankBin} onChange={(event) => setBankBin(event.target.value)} placeholder="970422" /></label>
          <label><strong>Tên chủ tài khoản</strong><input value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} placeholder="TUNG STORE" /></label>
        </div>
        <p className="help">
          payOS: {provider ? (provider.payOsConfigured ? "đủ Client ID / API key / checksum" : "thiếu credential") : "chưa cấu hình"}
          {" · "}Tài khoản: {provider?.accountConfigured ? "đã liên kết" : "chưa cấu hình"}
          {" · "}Số tài khoản chỉ lưu trong Worker Secret VIETQR_BANK_ACCOUNT.
        </p>
        <div className="actions">
          <Button onClick={() => void loadSettingsTab()}>Kiểm tra provider</Button>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Crypto</p><h3>Địa chỉ nhận thủ công</h3></div>
          <span className="badge">{cryptoMethods.length} địa chỉ · {activeCrypto} đang bật</span>
        </div>
        <div className="crypto-method-list" data-shop-crypto-method-list>
          {cryptoMethods.length ? cryptoMethods.map((method) => {
            const active = method.status === "active";
            const destination = String(method.destinationValue || "");
            const masked = destination.length > 18 ? `${destination.slice(0, 8)}…${destination.slice(-8)}` : destination;
            return (
              <article className="connection-row crypto-method-row" key={method.id} data-shop-id={method.id}>
                <div className="crypto-method-summary">
                  <div>
                    <strong>{String(method.displayName || method.provider)}</strong>
                    <span>{String(method.network || method.rail)} · {String(method.asset)} · {String(method.provider).toUpperCase()} · {masked}</span>
                  </div>
                </div>
                <div className="shop-product-actions">
                  <StatusBadge status={active ? "healthy" : "warning"} label={active ? "Đang bật" : method.status === "disabled" ? "Đang tắt" : "Đã lưu trữ"} />
                  {method.status !== "archived" ? (
                    <>
                      <button className="row-action" type="button" onClick={() => editCryptoMethod(method.id)}>Sửa</button>
                      <button className="row-action" type="button" onClick={() => void toggleCryptoMethod(method.id, !active)}>{active ? "Tắt" : "Bật"}</button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          }) : <p className="help">Chưa có địa chỉ crypto. Tạo ở trạng thái Disabled để kiểm tra trước khi hiển thị.</p>}
        </div>
        <form className="form" onSubmit={(event) => {
          event.preventDefault();
          void saveSettings();
        }}>
          <div className="grid3">
            <label><strong>Sàn</strong>
              <select value={crypto.provider} onChange={(event) => setCrypto({ ...crypto, provider: event.target.value })}>
                <option value="bybit">Bybit</option>
                <option value="binance">Binance</option>
              </select>
            </label>
            <label><strong>Kiểu nhận</strong>
              <select value={crypto.rail} onChange={(event) => setCrypto({ ...crypto, rail: event.target.value })}>
                <option value="onchain_deposit">On-chain deposit</option>
                <option value="internal_uid">Internal UID</option>
              </select>
            </label>
            <label><strong>Asset</strong>
              <select value={crypto.asset} onChange={(event) => setCrypto({ ...crypto, asset: event.target.value })}>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </label>
          </div>
          <div className="grid3">
            <label><strong>Mạng</strong>
              <select value={crypto.network} disabled={crypto.rail === "internal_uid"} onChange={(event) => setCrypto({ ...crypto, network: event.target.value })}>
                {["ETHEREUM", "BSC", "POLYGON", "SOLANA", "TRON"].map((network) => <option key={network} value={network}>{network}</option>)}
              </select>
            </label>
            <label><strong>Địa chỉ / UID *</strong><input value={crypto.destinationValue} onChange={(event) => setCrypto({ ...crypto, destinationValue: event.target.value })} /></label>
            <label><strong>Memo/tag</strong><input value={crypto.memoOrTag} onChange={(event) => setCrypto({ ...crypto, memoOrTag: event.target.value })} /></label>
          </div>
          <div className="grid3">
            <label><strong>Tên hiển thị</strong><input value={crypto.displayName} onChange={(event) => setCrypto({ ...crypto, displayName: event.target.value })} /></label>
            <label><strong>Trạng thái</strong>
              <select value={crypto.status} onChange={(event) => setCrypto({ ...crypto, status: event.target.value })}>
                <option value="disabled">Disabled (kiểm tra trước)</option>
                <option value="active">Active</option>
              </select>
            </label>
            <label><strong>QR URL (tuỳ chọn)</strong><input value={crypto.qrUrl} onChange={(event) => setCrypto({ ...crypto, qrUrl: event.target.value })} placeholder="/payment-qr/…" /></label>
          </div>
          <div className="actions">
            <button type="submit" className="button primary" disabled={busy === "save"}>{busy === "save" ? "Đang lưu…" : "Lưu cấu hình shop"}</button>
            <Button onClick={() => {
              setCrypto(defaultCryptoForm);
              setCryptoMethodId("");
              status("Đã mở form tạo địa chỉ nhận crypto ở trạng thái Disabled.");
            }}>Form mới</Button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Telegram</p><h3>Mini App & kênh bán</h3></div>
          <StatusBadge status={telegramActive ? "healthy" : "warning"} label={telegramActive ? "Webhook hoạt động" : "Chưa cấu hình"} />
        </div>
        <label className="check">
          <input
            type="checkbox"
            name="telegramMiniAppEnabled"
            checked={telegramMiniAppEnabled}
            onChange={(event) => void saveMiniAppToggle(event.target.checked)}
          />
          <span><strong>Telegram Mini App Mode</strong></span>
        </label>
        <p className="help">Bật để bot mở storefront Mini App; tắt để chạy luồng Chat truyền thống.</p>
        <div className="actions">
          <Button onClick={() => setTab("telegram")}>Quản lý bot fleet</Button>
          <Button onClick={() => void loadTelegramBots()}>Làm mới trạng thái</Button>
          <Button
            busy={busy === "telegram-configure"}
            busyLabel="Đang cấu hình…"
            onClick={async () => {
              setBusy("telegram-configure");
              try {
                const data = await shopApi<{ telegram?: Record<string, any>; integration?: Record<string, any> }>("telegram/configure", { method: "POST", body: JSON.stringify({}) });
                const integration = (data.telegram || data.integration || {}) as Record<string, any>;
                status(integration.webhookConfigured
                  ? `TUNG Shop Bot ${integration.botUsername ? `@${integration.botUsername} ` : ""}đã nhận webhook trên Cloudflare Worker.`
                  : "Secret Telegram đã có nhưng webhook chưa hoàn tất.");
                await loadSettingsTab();
              } catch (error) {
                const code = (error as { code?: string }).code;
                if (code === "telegram_legacy_config_disabled") {
                  status("Bot đang được registry quản lý. Dùng tab Telegram để kiểm tra, kích hoạt hoặc rollback.", true);
                  setTab("telegram");
                } else {
                  status(error instanceof Error ? error.message : "Không cấu hình được webhook.", true);
                }
              } finally {
                setBusy("");
              }
            }}
          >
            Cấu hình webhook legacy
          </Button>
        </div>
        <p className="help" data-shop-telegram-runtime>{telegram?.botUsername ? `@${String(telegram.botUsername)} · Worker webhook` : "Cloudflare Worker · webhook"}</p>
      </section>
    </div>
  );
}
