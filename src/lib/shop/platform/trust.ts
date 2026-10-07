/**
 * F4 Trust OS — order fulfillment timeline model (UI + API shared).
 */

export type OrderLifecycleState =
  | "created"
  | "awaiting_payment"
  | "confirming"
  | "paid"
  | "fulfilled"
  | "expired"
  | "failed"
  | "cancelled"
  | string;

export type TrustTimelineStep = {
  id: string;
  label: string;
  description: string;
  status: "done" | "active" | "todo" | "error";
};

const mapStateToIndex = (state: OrderLifecycleState): number => {
  switch (state) {
    case "created":
      return 1;
    case "awaiting_payment":
      return 2;
    case "confirming":
      return 3;
    case "paid":
      return 3;
    case "fulfilled":
      return 4;
    case "expired":
    case "failed":
    case "cancelled":
      return -1;
    default:
      return 1;
  }
};

export function buildOrderTrustTimeline(
  state: OrderLifecycleState,
  locale = "vi",
): TrustTimelineStep[] {
  const active = mapStateToIndex(state);
  const isError = active < 0;
  const labels = locale === "vi"
    ? [
        { id: "created", label: "Tạo đơn", description: "Đơn đã được ghi nhận trong hệ thống." },
        { id: "pay", label: "Thanh toán", description: "Quét QR / chuyển khoản / crypto theo hướng dẫn." },
        { id: "verify", label: "Xác minh", description: "Backend đối soát bằng chứng thanh toán." },
        { id: "keys", label: "Giao key", description: "Nhận sản phẩm số trong trang đơn / email." },
      ]
    : [
        { id: "created", label: "Created", description: "Order recorded in the system." },
        { id: "pay", label: "Payment", description: "Pay via QR, transfer, or crypto." },
        { id: "verify", label: "Verification", description: "Backend verifies payment evidence." },
        { id: "keys", label: "Delivery", description: "Receive digital goods in order page." },
      ];

  if (isError) {
    return labels.map((step, index) => ({
      ...step,
      status: index === 0 ? "done" : index === 1 ? "error" : "todo",
      description: index === 1
        ? (locale === "vi" ? `Đơn ${state}. Liên hệ hỗ trợ nếu cần.` : `Order ${state}. Contact support if needed.`)
        : step.description,
    }));
  }

  return labels.map((step, index) => {
    const stepNo = index + 1;
    let status: TrustTimelineStep["status"] = "todo";
    if (stepNo < active) status = "done";
    else if (stepNo === active) status = "active";
    if (active >= 4 && stepNo <= 4) status = "done";
    return { ...step, status };
  });
}

export function trustCopyForDelivery(mode: "automatic" | "manual" | string, locale = "vi") {
  if (mode === "manual") {
    return locale === "vi"
      ? "Gói thủ công: admin kiểm tra trước khi gửi. Bạn sẽ thấy trạng thái cập nhật trên đơn."
      : "Manual package: reviewed before delivery. Status updates on the order page.";
  }
  return locale === "vi"
    ? "Gói tự động: key được cấp sau khi thanh toán được backend xác minh."
    : "Automatic package: keys release after verified payment.";
}
