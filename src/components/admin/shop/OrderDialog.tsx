import { useEffect, useState } from "react";
import { shopApi } from "../api/client";
import { Dialog } from "../ui/Dialog";
import { StatusBadge } from "../ui/primitives";
import { useStatus } from "../ui/Toast";
import { formatDate, shopMoney } from "../lib/format";

type OrderDetail = Record<string, any> & {
  id: string; orderNumber?: string; orderReference?: string | null; paymentStatus: string; fulfillmentStatus: string;
  status: string; currency?: string; totalMinor?: number; customerName?: string | null; customerEmail?: string | null;
  items?: Array<Record<string, any>>; payments?: Array<Record<string, any>>; paymentEvents?: Array<Record<string, any>>;
  cryptoPayments?: Array<Record<string, any>>; cryptoEvents?: Array<Record<string, any>>;
  fulfillment?: Array<Record<string, any>>; paymentProofs?: Array<Record<string, any>>;
};

const proofStatusLabels: Record<string, string> = { submitted: "Chờ admin review", reviewed: "Đã review", rejected: "Từ chối" };

function formatProofSize(value: unknown) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrderDialog({ orderId, onClose, onSaved }: { orderId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const status = useStatus();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    void shopApi<{ order: OrderDetail }>(`orders/${encodeURIComponent(orderId)}`)
      .then((data) => setOrder(data.order))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Không tải được đơn hàng.");
        status(err instanceof Error ? err.message : "Không tải được đơn hàng.", true);
      });
  }, [orderId, status]);

  const canManualPay = order
    ? ["unpaid", "pending"].includes(order.paymentStatus) && !["cancelled", "expired", "refunded"].includes(order.status)
    : false;
  const hasCryptoPayment = (order?.cryptoPayments || []).length > 0;

  const submit = async () => {
    if (!order || !canManualPay) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) throw new Error("Cần ghi rõ lý do duyệt (≥ 5 ký tự).");
    if (!confirmed) throw new Error(hasCryptoPayment ? "Hãy xác nhận đã xem và đối chiếu proof thanh toán." : "Hãy xác nhận đã đối chiếu chuyển khoản.");
    const result = await shopApi<{ confirmation?: { outcome?: string } }>(`orders/${encodeURIComponent(orderId)}/manual-confirm`, {
      method: "POST",
      body: JSON.stringify({ reason: trimmed }),
    });
    status(result.confirmation?.outcome === "already_paid"
      ? `Đơn ${order.orderNumber} đã được thanh toán trước đó.`
      : `Đã duyệt thủ công đơn ${order.orderNumber}. Key có thể giao.`);
    await onSaved();
  };

  if (error && !order) {
    return <Dialog title="Không tải được đơn hàng" onClose={onClose}><p className="help">{error}</p></Dialog>;
  }
  if (!order) {
    return <Dialog title="Đang tải đơn…" onClose={onClose}><p className="help">Đang tải dữ liệu đơn hàng.</p></Dialog>;
  }

  const currency = String(order.currency || "VND");
  return (
    <Dialog
      title={`Đơn ${order.orderNumber || order.orderReference || order.id}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={canManualPay ? "Duyệt đã thanh toán" : "Đóng"}
      busyLabel="Đang duyệt…"
      eyebrow="Order detail"
    >
      <div className="grid2">
        <div><strong>Khách hàng</strong><p className="help">{String(order.customerName || "Ẩn tên")} · {String(order.customerEmail || "Ẩn email")}</p></div>
        <div><strong>Trạng thái</strong><p><StatusBadge status={order.paymentStatus} /> <StatusBadge status={order.fulfillmentStatus} /></p></div>
      </div>
      <div className="table-shell">
        <table>
          <thead><tr><th>Sản phẩm</th><th>Biến thể</th><th>Số lượng</th><th className="numeric">Tổng</th></tr></thead>
          <tbody>
            {(order.items || []).map((item, index) => (
              <tr key={index}>
                <td>{String(item.productTitle || item.productSlug || "—")}</td>
                <td>{String(item.variantTitle || item.sku || "—")}</td>
                <td>{String(item.quantity)}</td>
                <td className="numeric">{shopMoney(item.totalMinor, currency)}</td>
              </tr>
            ))}
            {(order.items || []).length === 0 ? <tr><td colSpan={4}>Không có dòng hàng.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p><strong>Tổng đơn:</strong> {shopMoney(order.totalMinor, currency)} · <strong>Mã:</strong> {String(order.orderReference || "—")}</p>

      {canManualPay ? (
        <section className="shop-editor-card">
          <div className="section-heading">
            <div><p className="eyebrow">{hasCryptoPayment ? "Crypto manual review" : "PayOS lỗi / chuyển khoản tay"}</p><h3>Duyệt thanh toán thủ công</h3></div>
          </div>
          <label><strong>Lý do duyệt (bắt buộc)</strong>
            <textarea
              rows={3}
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={hasCryptoPayment ? "VD: Đã xem ảnh/PDF và tx hash; asset, network, số tiền khớp." : "VD: Khách CK đúng số tiền, payOS webhook trễ/lỗi. Mã GD: ..."}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span><strong>{hasCryptoPayment ? "Tôi đã xem proof và đối chiếu asset, network, địa chỉ ví, số tiền cùng mã giao dịch." : "Tôi đã đối chiếu số tiền và nội dung chuyển khoản."}</strong></span>
          </label>
        </section>
      ) : <p className="help">Đơn đã {order.paymentStatus} — không cần duyệt thủ công.</p>}

      <section className="section-card payment-proofs-card">
        <div className="section-heading">
          <div><p className="eyebrow">Customer submissions</p><h3>Proof thanh toán</h3></div>
          <span className="badge">{(order.paymentProofs || []).length}</span>
        </div>
        <ul className="payment-proof-list">
          {(order.paymentProofs || []).length ? (order.paymentProofs || []).map((proof, index) => {
            const statusKey = proofStatusLabels[String(proof.status)] ? String(proof.status) : "submitted";
            return (
              <li className="payment-proof-row" key={index}>
                <div>
                  <strong>{String(proof.filename || "Payment proof")}</strong>
                  <span className="help">{String(proof.mimeType || "file")} · {formatProofSize(proof.byteSize)} · {formatDate(proof.createdAt, true)}</span>
                  {proof.transactionReference ? <span className="help">Tx/hash: {String(proof.transactionReference)}</span> : null}
                </div>
                <div className="shop-product-actions">
                  <StatusBadge status={statusKey === "reviewed" ? "healthy" : statusKey === "rejected" ? "failed" : "warning"} label={proofStatusLabels[statusKey]} />
                  {proof.downloadUrl ? <a className="row-action" href={String(proof.downloadUrl)} target="_blank" rel="noreferrer" download>Open proof</a> : null}
                </div>
              </li>
            );
          }) : <li className="help">Khách chưa tải file proof. Có thể kiểm tra mã giao dịch trong crypto attempt.</li>}
        </ul>
      </section>

      <section className="section-card">
        <div className="section-heading"><div><h3>Sự kiện thanh toán</h3></div><span className="badge">{(order.paymentEvents || []).length}</span></div>
        <div className="timeline">
          {(order.paymentEvents || []).length ? (order.paymentEvents || []).map((event, index) => (
            <article key={index}>
              <strong>{String(event.provider || "payos")} · {String(event.errorCode || event.eventType || "payment.attention")}</strong>
              <p>{[
                event.transactionReference ? `Giao dịch ${String(event.transactionReference)}` : "",
                event.orderReference ? `Đơn ${String(event.orderReference)}` : "",
                event.amountMinor != null && Number.isFinite(Number(event.amountMinor)) ? shopMoney(event.amountMinor, String(event.currency || currency)) : "",
              ].filter(Boolean).join(" · ") || "Không có tham chiếu giao dịch công khai."}</p>
              {event.matchState || event.processingState ? <p className="help">{[event.matchState ? `Ghép đơn: ${String(event.matchState)}` : "", event.processingState ? `Xử lý: ${String(event.processingState)}` : ""].filter(Boolean).join(" · ")}</p> : null}
              <time dateTime={String(event.occurredAt || event.createdAt || "")}>{formatDate(event.occurredAt || event.createdAt, true)}</time>
            </article>
          )) : <p className="help">Không có sự kiện cần chú ý.</p>}
        </div>
      </section>

      <details><summary>Payment attempts</summary>
        <ul>
          {(order.payments || []).length ? (order.payments || []).map((item, index) => <li key={index}>{String(item.provider || "—")} · {String(item.status || "—")} · {formatDate(item.createdAt, true)}</li>) : <li>Chưa có</li>}
        </ul>
      </details>
      <details open><summary>Crypto payment details</summary>
        <ul>
          {(order.cryptoPayments || []).map((item, index) => (
            <li key={index}>
              <strong>{String(item.provider || "").toUpperCase()}</strong> · {String(item.asset || "")} {String(item.network || "")} · {item.amountMinor != null ? shopMoney(item.amountMinor, "USD") : String(item.expectedAmountAtomic || "—")} · {String(item.status || "—")}
              <br /><span className="help">Destination: {String(item.destination || "—")} · Reference: {String(item.customerReference || item.transactionReference || "not submitted")}</span>
            </li>
          ))}
          {(order.cryptoPayments || []).length === 0 ? <li>Không có crypto attempt.</li> : null}
        </ul>
        <ul>
          {(order.cryptoEvents || []).length ? (order.cryptoEvents || []).map((event, index) => (
            <li key={index}>{String(event.provider || "").toUpperCase()} · {String(event.matchState || "—")} · {String(event.transactionReference || event.providerEventId || "—")} · {formatDate(event.occurredAt || event.createdAt, true)}</li>
          )) : <li>Chưa có payment event.</li>}
        </ul>
      </details>
      <details><summary>Fulfillment events</summary>
        <ul>
          {(order.fulfillment || []).length ? (order.fulfillment || []).map((item, index) => <li key={index}>{String(item.eventType || "—")} · {String(item.channel || "—")} · {formatDate(item.createdAt, true)}</li>) : <li>Chưa có</li>}
        </ul>
      </details>
    </Dialog>
  );
}
