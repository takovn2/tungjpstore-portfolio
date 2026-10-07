import { useEffect, useState } from "react";
import { useShop } from "./useShop";
import { Button, EmptyState, StatusBadge } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { formatDate, shopMoney } from "../lib/format";
import { OrderDialog } from "./OrderDialog";

export function PaymentsTab() {
  const { payments, paymentAttention, cryptoMethods, loadPayments, paymentProvider } = useShop();
  const status = useStatus();
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setBusy(true);
    try {
      await loadPayments();
    } catch (error) {
      status(error instanceof Error ? error.message : "Không tải được thanh toán.", true);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provider = paymentProvider;
  const providerReady = Boolean(provider && provider.configurationSupported === true && provider.ready === true);
  const activeCrypto = cryptoMethods.filter((method) => method.status === "active").length;

  return (
    <div className="shop-panel" data-shop-panel="payments">
      <div className="filter-bar">
        <span className="help">
          payOS: {provider ? (provider.payOsConfigured ? "đủ Client ID / API key / checksum" : "thiếu credential") : "chưa cấu hình"}
          {" · "}Tài khoản: {provider?.accountConfigured ? "đã liên kết" : "chưa cấu hình"}
          {" · "}Crypto: {activeCrypto} địa chỉ đang bật (manual review)
        </span>
        <div className="view-actions">
          <Button busy={busy} busyLabel="Đang tải…" onClick={() => void reload()}>Làm mới</Button>
        </div>
      </div>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Attention</p><h3>Giao dịch cần rà soát</h3></div>
          <span className={`badge ${paymentAttention.length ? "danger" : "ready"}`}>{paymentAttention.length}</span>
        </div>
        <div className="table-shell">
          <table>
            <thead><tr><th>Tham chiếu</th><th>Ngày</th><th>Lỗi / sự kiện</th><th className="numeric">Số tiền</th><th>Đơn</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody data-shop-list="unmatched-payments">
              {paymentAttention.map((event, index) => {
                const orderId = typeof event.orderId === "string" ? event.orderId.trim() : "";
                return (
                  <tr key={index}>
                    <td><span className="cell-title">{String(event.transactionReference || event.id)}</span><span className="cell-meta">{String(event.provider || "payos")}</span></td>
                    <td>{formatDate(event.occurredAt || event.createdAt, true)}</td>
                    <td><span className="cell-title">{String(event.errorCode || event.eventType || "Cần rà soát")}</span><span className="cell-meta">{String(event.matchState || "—")}</span></td>
                    <td className="numeric">{shopMoney(event.amountMinor, String(event.currency || "VND"))}</td>
                    <td><span className="cell-title">{String(event.orderReference || event.orderId || "—")}</span></td>
                    <td><StatusBadge status="warning" label="Rà soát" /></td>
                    <td>
                      {orderId
                        ? <button className="row-action" type="button" onClick={() => setOpenOrderId(orderId)}>Mở đơn</button>
                        : <button className="row-action" type="button" disabled aria-disabled="true" title="Sự kiện chưa được ghép với đơn hàng">Chưa ghép đơn</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {paymentAttention.length === 0 ? <EmptyState title="Chưa có proof cần rà soát." hint="Proof hoặc mã giao dịch khách gửi sẽ xuất hiện tại đây." /> : null}
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Provider</p><h3>Payment attempts</h3></div>
          <span className={`badge ${providerReady ? "ready" : ""}`}>{providerReady ? "payOS sẵn sàng" : provider ? "Cần kiểm tra" : "Chưa cấu hình"}</span>
        </div>
        <div className="table-shell">
          <table>
            <thead><tr><th>Đơn</th><th>Provider</th><th>Confirmation</th><th>Trạng thái</th><th>Ngày</th><th></th></tr></thead>
            <tbody data-shop-list="payment-attempts">
              {payments.map((payment, index) => (
                <tr key={index} data-shop-id={String(payment.orderId || payment.id)}>
                  <td><span className="cell-title">{String(payment.orderReference || payment.orderId)}</span><span className="cell-meta">{String(payment.orderId || "—")}</span></td>
                  <td>{String(payment.provider || "—")}</td>
                  <td>{String(payment.confirmationProvider || "—")}</td>
                  <td><StatusBadge status={String(payment.status)} /></td>
                  <td>{formatDate(payment.createdAt, true)}</td>
                  <td>
                    <button className="row-action" type="button" onClick={() => payment.orderId && setOpenOrderId(String(payment.orderId))}>Mở đơn</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payments.length === 0 ? <EmptyState title="Chưa có payment attempt." /> : null}
      </section>

      {openOrderId ? (
        <OrderDialog orderId={openOrderId} onClose={() => setOpenOrderId(null)} onSaved={reload} />
      ) : null}
    </div>
  );
}
