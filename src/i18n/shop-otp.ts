import type { Locale } from "./dictionaries";
export interface OtpCopy {
  title: string; instruction: string; refreshSetup: string; get: string; copy: string; copied: string; copyFailed: string;
  received: string; caveat: string; reauthGoogle: string; reauthEmail: string; emailSent: string;
  idle: string; checking: string; pending: string; found: string; setup_pending: string;
  reauth_required: string; untrusted: string; ambiguous: string; rate_limited: string;
  unavailable: string; revoked: string; timedOut: string;
}
const copy: Record<Locale, OtpCopy> = {
  vi: {
    title: "Mã xác minh email", instruction: "Trước tiên, yêu cầu nhà cung cấp gửi mã đăng nhập mới, rồi chọn Lấy OTP.",
    refreshSetup: "Kiểm tra trạng thái thiết lập", get: "Lấy OTP", copy: "Sao chép mã", copied: "Đã sao chép", copyFailed: "Không thể sao chép. Bạn có thể chọn mã để sao chép thủ công.",
    received: "Nhận lúc", caveat: "Mã có thể hết hạn theo quy định của nhà cung cấp. Giữ mã riêng tư.",
    reauthGoogle: "Xác thực lại bằng Google", reauthEmail: "Xác thực lại bằng email", emailSent: "Kiểm tra email và mở liên kết trong trình duyệt này.",
    idle: "Sẵn sàng kiểm tra mã mới.", checking: "Đang kiểm tra...", pending: "Chưa nhận mã. Đang chờ tối đa 2 phút.", found: "Đã nhận mã đăng nhập.",
    setup_pending: "Quyền nhận mã đang được thiết lập.", reauth_required: "Xác thực lại tài khoản của bạn để lấy mã.",
    untrusted: "Chưa có mã đáp ứng yêu cầu xác minh người gửi.", ambiguous: "Có nhiều mã không thể phân biệt an toàn. Thử lại sau khi yêu cầu mã mới.",
    rate_limited: "Bạn đã kiểm tra quá nhanh hoặc vượt giới hạn. Hãy thử lại sau.", unavailable: "Dịch vụ tạm thời không khả dụng.", revoked: "Quyền lấy mã không còn khả dụng.", timedOut: "Đã hết thời gian chờ. Bạn có thể kiểm tra lại.",
  },
  en: {
    title: "Email verification code", instruction: "First ask the provider to send a new login code, then select Get OTP.",
    refreshSetup: "Check setup status", get: "Get OTP", copy: "Copy code", copied: "Copied", copyFailed: "Copy failed. Select the code to copy it manually.",
    received: "Received", caveat: "The provider may expire this code. Keep it private.",
    reauthGoogle: "Verify again with Google", reauthEmail: "Verify again by email", emailSent: "Check your email and open the link in this browser.",
    idle: "Ready to check for a new code.", checking: "Checking...", pending: "No code yet. Waiting for up to 2 minutes.", found: "Login code received.",
    setup_pending: "Code access is being set up.", reauth_required: "Verify your account again to read the code.",
    untrusted: "No code meets sender verification requirements.", ambiguous: "Multiple codes cannot be safely distinguished. Try again after requesting a new code.",
    rate_limited: "You checked too quickly or reached the limit. Try again later.", unavailable: "The service is temporarily unavailable.", revoked: "Code access is no longer available.", timedOut: "Waiting has ended. You can check again.",
  },
  ja: {
    title: "メール認証コード", instruction: "提供元に新しいログインコードの送信を依頼し、「OTPを取得」を押してください。",
    refreshSetup: "設定状況を確認", get: "OTPを取得", copy: "コードをコピー", copied: "コピーしました", copyFailed: "コピーできませんでした。コードを選択して手動でコピーしてください。",
    received: "受信日時", caveat: "提供元の規定によりコードが失効する場合があります。第三者に共有しないでください。",
    reauthGoogle: "Googleで再認証", reauthEmail: "メールで再認証", emailSent: "メールを確認し、このブラウザーでリンクを開いてください。",
    idle: "新しいコードを確認できます。", checking: "確認中...", pending: "コード未受信です。最大2分間待機します。", found: "ログインコードを受信しました。",
    setup_pending: "コードへのアクセスを準備しています。", reauth_required: "コードを見るには再認証してください。",
    untrusted: "送信元の認証要件を満たすコードがありません。", ambiguous: "複数のコードを安全に判別できません。新しいコードを依頼してから再試行してください。",
    rate_limited: "確認頻度または上限を超えました。時間を置いて再試行してください。", unavailable: "サービスを一時的に利用できません。", revoked: "コードへのアクセスを利用できません。", timedOut: "待機時間が終了しました。再確認できます。",
  },
  zh: {
    title: "邮件验证码", instruction: "先要求服务商发送新的登录验证码，再选择获取 OTP。",
    refreshSetup: "检查设置状态", get: "获取 OTP", copy: "复制验证码", copied: "已复制", copyFailed: "复制失败。请选择验证码并手动复制。",
    received: "接收时间", caveat: "验证码可能按服务商规定失效。请勿分享。",
    reauthGoogle: "通过 Google 重新验证", reauthEmail: "通过邮件重新验证", emailSent: "请检查邮件，并在此浏览器中打开链接。",
    idle: "可以检查新验证码。", checking: "正在检查...", pending: "尚未收到验证码，最多等待2分钟。", found: "已收到登录验证码。",
    setup_pending: "正在设置验证码访问权限。", reauth_required: "请重新验证账户后获取验证码。",
    untrusted: "没有符合发件人验证要求的验证码。", ambiguous: "无法安全区分多个验证码。请求新验证码后重试。",
    rate_limited: "检查过快或已达到限制，请稍后重试。", unavailable: "服务暂时不可用。", revoked: "验证码访问权限已不可用。", timedOut: "等待已结束，可以再次检查。",
  },
};
export function getOtpCopy(locale: Locale): OtpCopy { return copy[locale]; }
