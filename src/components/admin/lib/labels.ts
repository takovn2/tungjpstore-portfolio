/** Centralized Vietnamese labels shared across the admin React app. */

export const locales = ["vi", "en", "ja", "zh"] as const;
export type Locale = (typeof locales)[number];
export const localeLabel: Record<string, string> = { vi: "Tiếng Việt", en: "English", ja: "日本語", zh: "简体中文" };

export const typeLabel: Record<string, string> = { site_section: "Trang", project: "Dự án", post: "Bài viết" };

export const statusLabel: Record<string, string> = {
  draft: "Bản nháp", published: "Đã xuất bản", archived: "Lưu trữ", deleted: "Thùng rác",
  new: "Mới", reviewing: "Đang xem xét", replied: "Đã trả lời", closed: "Đã đóng", spam: "Spam",
};

export const stageLabel: Record<string, string> = {
  inbox: "Inbox", qualified: "Đã đánh giá", contacted: "Đã liên hệ", proposal: "Đề xuất", won: "Thành công", lost: "Không phù hợp",
};

export const priorityLabel: Record<string, string> = { low: "Thấp", normal: "Bình thường", high: "Cao", urgent: "Khẩn cấp" };

export const blockLabel: Record<string, string> = {
  paragraph: "Đoạn văn", heading: "Tiêu đề phụ", quote: "Trích dẫn", list: "Danh sách", image: "Hình ảnh", cta: "Nút CTA", metric: "Số liệu",
};

export const blockTypes = ["paragraph", "heading", "quote", "list", "image", "cta", "metric"] as const;

export const publishIssueLabel: Record<string, string> = {
  revision_not_found: "Không tìm thấy bản nháp", missing_locale: "Thiếu nội dung ngôn ngữ", title_required: "Thiếu tiêu đề",
  excerpt_required: "Thiếu mô tả ngắn", body_required: "Thiếu nội dung chính", seo_title_required: "Thiếu SEO title",
  seo_description_required: "Thiếu SEO description", cover_required: "Thiếu ảnh bìa", cover_not_found: "Không tìm thấy ảnh bìa",
  cover_not_active: "Ảnh bìa chưa sẵn sàng", cover_alt_required: "Ảnh bìa thiếu alt text", image_alt_required: "Block ảnh thiếu alt text",
  seo_title_too_long: "SEO title quá dài", seo_description_too_long: "SEO description quá dài",
};

export function formatPublishIssue(issue: unknown) {
  const text = String(issue);
  const localized = /^(.+)\.(vi|en|ja|zh):\s*([a-z_]+)$/.exec(text);
  if (localized) return `${localized[1]} · ${localeLabel[localized[2]]}: ${publishIssueLabel[localized[3]] || localized[3]}`;
  const generic = /^(.+):\s*([a-z_]+)$/.exec(text);
  return generic ? `${generic[1]}: ${publishIssueLabel[generic[2]] || generic[2]}` : text;
}

export const shopStatusLabels: Record<string, string> = {
  active: "Đang bán", draft: "Bản nháp", archived: "Lưu trữ", paid: "Đã thanh toán", pending: "Chờ thanh toán",
  awaiting_payment: "Chờ thanh toán", confirmed: "Đã xác nhận", fulfilled: "Đã giao", unfulfilled: "Chưa giao",
  processing: "Đang xử lý", failed: "Lỗi", expired: "Hết hạn", available: "Khả dụng", low: "Sắp hết",
  healthy: "Ổn định", valid: "Sẵn sàng", ready: "Sẵn sàng", duplicate_in_file: "Trùng trong file",
  already_in_stock: "Đã có trong kho", invalid: "Không hợp lệ", revoked: "Đã thu hồi", reserved: "Đang giữ chỗ",
  matched: "Đã ghép", unmatched: "Chưa ghép", submitted: "Chờ admin review", reviewed: "Đã review",
  rejected: "Từ chối", needs_review: "Chờ rà soát", unpaid: "Chưa thanh toán", cancelled: "Đã huỷ",
  refunded: "Đã hoàn tiền", pending_payment: "Chờ thanh toán", paused: "Tạm dừng", delivered: "Đã giao",
};

export const shopStateText = (value: unknown) => shopStatusLabels[String(value)] || String(value || "—");

export const telegramBotStatusLabels: Record<string, string> = {
  active: "Đang chạy", standby: "Sẵn sàng kích hoạt", previous: "Bản trước · có thể rollback",
  activating: "Đang kích hoạt", retiring: "Đang dọn webhook cũ", error: "Cần xử lý", revoked: "Đã thu hồi",
};

export const telegramEventLabels: Record<string, string> = {
  created: "Đã thêm bot", validated: "Đã kiểm tra token", activation_started: "Bắt đầu kích hoạt",
  activate: "Đã kích hoạt", activated: "Đã kích hoạt", activation_failed: "Kích hoạt thất bại",
  rollback: "Đã rollback", rolled_back: "Đã rollback", previous_retired: "Đã dọn bot trước",
  credentials_rewrapped: "Đã bọc lại credential", token_rotated: "Đã xoay token",
  revoke: "Đã thu hồi token", revoked: "Đã thu hồi token", failed: "Thao tác lỗi",
};

export const apiErrorLabel: Record<string, string> = {
  publish_validation_failed: "Chưa thể xuất bản. Hãy hoàn thiện các mục sau:",
  conflict: "Nội dung đã thay đổi ở một phiên khác. Hãy tải lại trước khi lưu.",
  contact_conflict: "Liên hệ đã được cập nhật ở phiên khác. Hãy tải lại chi tiết.",
  validation_failed: "Dữ liệu chưa hợp lệ. Hãy kiểm tra lại các trường.",
  contact_validation_failed: "Thông tin CRM chưa hợp lệ.",
  contact_note_validation_failed: "Ghi chú chưa hợp lệ hoặc chứa ký tự bị từ chối.",
  contact_crm_not_configured: "CONTACT_DB chưa được cấu hình cho môi trường này.",
  contact_crm_unavailable: "Inbox tạm thời không khả dụng.",
  service_unavailable: "Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.",
  password_required: "Cần nhập mật khẩu quản trị.",
  invalid_password_policy: "Mật khẩu chưa đạt chính sách tối thiểu 14 ký tự.",
  invalid_password_proof: "Không thể xác minh khóa dẫn xuất. Hãy thử lại trên trình duyệt hiện đại.",
  invalid_login_challenge: "Yêu cầu đăng nhập đã hết hạn hoặc đã được sử dụng. Vui lòng thử lại.",
  password_upgrade_required: "Dữ liệu mật khẩu dùng phiên bản cũ và cần được nâng cấp trước khi đăng nhập.",
  invalid_password: "Mật khẩu quản trị chưa đúng.",
  login_locked: "Tạm khóa đăng nhập do nhiều lần thử sai. Hãy chờ rồi thử lại.",
  password_setup_required: "Cần thiết lập mật khẩu quản trị trước.",
  password_already_setup: "Mật khẩu quản trị đã được thiết lập.",
  security_state_changed: "Trạng thái bảo mật vừa thay đổi ở phiên khác. Hãy tải lại trước khi tiếp tục.",
  admin_auth_not_configured: "Worker Secret cho lớp mật khẩu chưa được cấu hình.",
  security_unavailable: "Lớp bảo mật tạm thời không khả dụng; dữ liệu vẫn đang được khóa.",
  access_not_configured: "Cloudflare Access chưa được cấu hình cho môi trường này.",
  shop_product_validation_failed: "Sản phẩm chưa đạt điều kiện lưu hoặc mở bán.",
  shop_category_validation_failed: "Danh mục chưa đạt điều kiện lưu.",
  category_create_conflict: "Slug danh mục đã tồn tại hoặc bị trùng.",
  category_not_found: "Danh mục đã chọn không tồn tại hoặc không còn hoạt động.",
  category_update_conflict: "Danh mục vừa được sửa ở phiên khác. Hãy tải lại rồi thử lại.",
  category_archive_conflict: "Danh mục vừa được sửa ở phiên khác. Hãy tải lại rồi thử lại.",
  category_slug_in_use: "Không thể đổi mã danh mục khi sản phẩm đang dùng mã này.",
  category_in_use: "Không thể lưu trữ danh mục đang được gán cho sản phẩm.",
  shop_inventory_validation_failed: "Lô key chưa hợp lệ.",
  shop_inventory_preview_validation_failed: "Lô key chưa đạt kiểm tra preview.",
  shop_inventory_commit_validation_failed: "Không thể ghi lô key này; hãy thử lại đúng batch.",
  shop_inventory_preview_failed: "Không thể kiểm tra lô key.",
  shop_key_crypto_not_configured: "Kho key chưa sẵn sàng: khóa mã hóa Worker đang thiếu hoặc không hợp lệ. Chưa có dữ liệu nào được ghi; hãy cấu hình lại khóa rồi thử lại.",
  shop_inventory_variant_not_eligible: "Biến thể này không nhận kho license key.",
  inventory_import_not_found: "Lô nhập không còn tồn tại.",
  inventory_import_chunk_not_found: "Lô con không còn tồn tại.",
  inventory_import_chunk_conflict: "Lô con đã được xử lý hoặc có xung đột.",
  inventory_import_chunk_mismatch: "Dữ liệu lô con không khớp preview.",
  inventory_import_conflict: "Lô nhập có dòng lỗi hoặc trùng; hãy kiểm tra preview.",
  insufficient_inventory: "Kho không đủ số lượng khả dụng.",
  shop_payment_validation_failed: "Cấu hình thanh toán chỉ chấp nhận payOS với các tham chiếu Worker Secret cố định.",
  shop_payment_account_not_configured: "VIETQR_BANK_ACCOUNT chưa được cấu hình đúng định dạng trong Worker Secret.",
  shop_payment_payos_client_id_not_configured: "PAYOS_CLIENT_ID chưa được cấu hình hoặc chưa hợp lệ.",
  shop_payment_payos_api_key_not_configured: "PAYOS_API_KEY chưa được cấu hình hoặc chưa hợp lệ.",
  shop_payment_payos_checksum_key_not_configured: "PAYOS_CHECKSUM_KEY chưa được cấu hình hoặc quá ngắn.",
  telegram_bot_not_configured: "Telegram chưa đủ Worker Secret để cấu hình bot.",
  telegram_token_crypto_not_configured: "Khóa mã hóa token Telegram chưa được cấu hình an toàn trên Worker.",
  telegram_api_unreachable: "Không thể kết nối Telegram Bot API lúc này.",
  telegram_unavailable: "Trạng thái Telegram tạm thời không khả dụng.",
  variant_archive_inventory_conflict: "Không thể lưu trữ khi sản phẩm còn key khả dụng hoặc đơn đang giữ key.",
  telegram_bot_validation_failed: "Thông tin bot chưa hợp lệ. Hãy làm mới rồi thử lại.",
  telegram_bot_token_invalid: "Token BotFather không hợp lệ.",
  telegram_bot_already_registered: "Bot này đã có trong registry.",
  telegram_bot_version_conflict: "Cấu hình bot vừa thay đổi. Hãy làm mới danh sách trước khi tiếp tục.",
  telegram_bot_previous_expired: "Thời gian rollback bot trước đã hết.",
  telegram_bot_previous_unavailable: "Bot trước không còn trong cửa sổ rollback 15 phút.",
  telegram_bot_activation_in_progress: "Một thao tác đổi bot khác đang chạy. Hãy chờ trạng thái cập nhật rồi thử lại.",
  telegram_bot_operation_in_progress: "Bot đang hoàn tất một thao tác khác. Hãy chờ trạng thái cập nhật rồi thử lại.",
  telegram_identity_mismatch: "Token không còn khớp với danh tính bot đã đăng ký.",
  telegram_active_bot_requires_switch: "Hãy kích hoạt bot khác trước khi thu hồi bot đang chạy.",
  telegram_legacy_config_disabled: "Bot đang được quản lý bằng registry. Hãy dùng vùng Bot Telegram để đổi hoặc cấu hình lại.",
  shop_crypto_payment_validation_failed: "Địa chỉ ví crypto hoặc mạng chưa hợp lệ.",
  crypto_provider_not_configured: "Chưa thể bật phương thức: cần cấu hình đúng địa chỉ ví và mạng nhận tiền.",
  admin_step_up_required: "Phiên xác minh quản trị đã cũ. Hãy nhập lại mật khẩu để tiếp tục thao tác nhạy cảm.",
  admin_recent_auth_required: "Phiên xác minh quản trị đã quá 30 phút. Hãy nhập lại mật khẩu trong hộp xác nhận rồi thử lại.",
  shop_product_not_publishable: "Sản phẩm chưa đủ nội dung bốn ngôn ngữ để mở bán.",
  shop_product_not_found: "Không tìm thấy sản phẩm.",
  shop_order_not_found: "Không tìm thấy đơn hàng.",
};

export { apiErrorLabel as apiErrorLabels };
