#!/usr/bin/env node
/**
 * Import non-duplicate products from tap-hoa-ai-products.json into TUNG Shop.
 * - Maps into existing categories only (ai-tools, creative-tools, entertainment, productivity)
 * - Groups SKUs into product + variants
 * - Generates brand-style covers (logo badge on brand gradient, 1200x900 webp)
 * - Writes content-migrations/0030_shop_taphoa_catalog.sql
 * - Optionally --apply (remote D1) and --upload-r2
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "artifacts", "shop-images-taphoa-2026-07-25");
const logoDir = path.join(outDir, "logos");
const publicShop = path.join(root, "public", "images", "shop");
const sqlPath = path.join(root, "content-migrations", "0030_shop_taphoa_catalog.sql");
const seedKey = "shop-taphoa-2026-07-25-v1";
const actor = "seed:shop-taphoa:2026-07-25:v1";
const now = "2026-07-25T15:30:00.000Z";

const EXISTING_SKIP = new Set([
  // already live as distinct brand products
  "gpt-plus-1-month",
  "netflix-premium-4k-1-month",
  "netflix-1-month",
  "adobe-full-app-1-month",
  "capcut-pro-7-days",
  "capcut-pro-30-days",
  "preorder-cursor-pro-plus-1-month",
  "preorder-cursor-ultra-1-month",
  "xbox-game-pass-ultimate",
]);

/** @typedef {{
 *  slug: string,
 *  title: string,
 *  categorySlug: 'ai-tools'|'creative-tools'|'entertainment'|'productivity',
 *  categoryLabel: string,
 *  sortOrder: number,
 *  eyebrow: string,
 *  short: string,
 *  description: string,
 *  usage: string,
 *  accent: string,
 *  logo: { type: 'iconify', id: string } | { type: 'svg', svg: string },
 *  categoryTag: string,
 *  variants: Array<{
 *    id: string,
 *    sku: string,
 *    title: string,
 *    optionSummary: string,
 *    price: number,
 *    optionValues: Record<string, unknown>,
 *    sourceIds: string[],
 *  }>
 * }} CatalogProduct */

/** @type {CatalogProduct[]} */
const CATALOG = [
  {
    slug: "suno",
    title: "Suno Pro",
    categorySlug: "creative-tools",
    categoryLabel: "Thiết kế & sáng tạo",
    sortOrder: 150,
    eyebrow: "AI Music · 1 tháng",
    short: "Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.",
    description:
      "Suno Pro hỗ trợ tạo bài hát, giai điệu và lời từ prompt AI trong thời hạn gói được bàn giao.",
    usage:
      "1) Nhận key/tài khoản sau thanh toán.\n2) Đăng nhập Suno (hoặc redeem theo hướng dẫn kèm key).\n3) Kiểm tra quyền Pro và hạn dùng trên tài khoản.\n4) Đổi mật khẩu / bật 2FA nếu key dạng mail|pass|2fa.",
    accent: "#000000",
    logo: { type: "iconify", id: "simple-icons/suno" },
    categoryTag: "AI MUSIC",
    variants: [
      {
        id: "catalog-variant-suno-pro-1m",
        sku: "SUNO-PRO-1M",
        title: "Suno Pro · 1 tháng",
        optionSummary: "Thời hạn: 1 tháng · BH: 7 ngày",
        price: 270000,
        optionValues: { duration: "1-month", warrantyDays: 7 },
        sourceIds: ["suno-pro-1-month"],
      },
    ],
  },
  {
    slug: "claude-api",
    title: "Claude API",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 160,
    eyebrow: "Anthropic · Token pack",
    short: "Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.",
    description:
      "Claude API token pack dùng cho tích hợp và thử nghiệm model Claude. Hạn token và thời hạn theo từng biến thể.",
    usage:
      "1) Nhận API key/thông tin endpoint sau thanh toán.\n2) Cấu hình key vào client (SDK, proxy, hoặc tool).\n3) Theo dõi quota token còn lại.\n4) Không chia sẻ key công khai; rotate nếu lộ.",
    accent: "#D97706",
    logo: { type: "iconify", id: "simple-icons/anthropic" },
    categoryTag: "AI API",
    variants: [
      {
        id: "catalog-variant-claude-api-10m-1d",
        sku: "CLAUDE-API-10M-1D",
        title: "10M token · 1 ngày",
        optionSummary: "10M token · Hạn: 1 ngày",
        price: 70000,
        optionValues: { tokens: "10M", duration: "1-day" },
        sourceIds: ["claude-api-10m-token-1-day"],
      },
      {
        id: "catalog-variant-claude-api-50m-1d",
        sku: "CLAUDE-API-50M-1D",
        title: "50M token · 1 ngày",
        optionSummary: "50M token · Hạn: 1 ngày",
        price: 160000,
        optionValues: { tokens: "50M", duration: "1-day" },
        sourceIds: ["claude-api-50m-token-1-day"],
      },
      {
        id: "catalog-variant-claude-api-100m-1d",
        sku: "CLAUDE-API-100M-1D",
        title: "100M token · 1 ngày",
        optionSummary: "100M token · Hạn: 1 ngày",
        price: 180000,
        optionValues: { tokens: "100M", duration: "1-day" },
        sourceIds: ["claude-api-100m-token-1-day"],
      },
      {
        id: "catalog-variant-claude-api-100m-3d",
        sku: "CLAUDE-API-100M-3D",
        title: "100M token · 3 ngày",
        optionSummary: "100M token · Hạn: 3 ngày",
        price: 225000,
        optionValues: { tokens: "100M", duration: "3-day" },
        sourceIds: ["claude-api-100m-token-3-days"],
      },
    ],
  },
  {
    slug: "claude-x20",
    title: "Claude X20",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 170,
    eyebrow: "Pre-order · 1 tháng",
    short: "Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.",
    description:
      "Gói Claude X20 pre-order thời hạn 1 tháng. Quyền lợi và model theo cấu hình bàn giao; chọn mức bảo hành phù hợp.",
    usage:
      "1) Đặt mua và chờ bàn giao (pre-order).\n2) Nhận thông tin đăng nhập/key theo email đơn.\n3) Đăng nhập Claude và kiểm tra gói X20.\n4) Liên hệ hỗ trợ trong thời hạn BH của biến thể đã chọn.",
    accent: "#D97706",
    logo: { type: "iconify", id: "simple-icons/claude" },
    categoryTag: "AI CHAT",
    variants: [
      {
        id: "catalog-variant-claude-x20-1m-no-warranty",
        sku: "CLAUDE-X20-1M-NO-BH",
        title: "X20 · 1 tháng · Không BH",
        optionSummary: "Pre-order · Không bảo hành",
        price: 2940000,
        optionValues: { plan: "x20", duration: "1-month", warranty: "none", preorder: true },
        sourceIds: ["preorder-claude-x20-1-month-no-warranty"],
      },
      {
        id: "catalog-variant-claude-x20-1m-full",
        sku: "CLAUDE-X20-1M-FULL",
        title: "X20 · 1 tháng · Full BH",
        optionSummary: "Pre-order · Bảo hành full",
        price: 5180000,
        optionValues: { plan: "x20", duration: "1-month", warranty: "full", preorder: true },
        sourceIds: ["preorder-claude-x20-1-month-full-warranty"],
      },
    ],
  },
  {
    slug: "leonardo-ai",
    title: "Leonardo AI",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 180,
    eyebrow: "AI Image · 8.500 credit",
    short: "Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.",
    description:
      "Gói Leonardo AI với 8.500 credit trong 1 tháng, phục vụ tạo ảnh, concept art và tài nguyên sáng tạo.",
    usage:
      "1) Nhận tài khoản/key sau thanh toán.\n2) Đăng nhập Leonardo AI.\n3) Kiểm tra số credit còn lại.\n4) Đổi mật khẩu nếu nhận dạng mail|pass.",
    accent: "#7C3AED",
    logo: {
      type: "svg",
      svg: brandMarkSvg("L", "#7C3AED"),
    },
    categoryTag: "AI IMAGE",
    variants: [
      {
        id: "catalog-variant-leonardo-8500-1m",
        sku: "LEONARDO-8500-1M",
        title: "8.500 credit · 1 tháng",
        optionSummary: "8.500 credit · BH: 24 giờ",
        price: 60000,
        optionValues: { credits: 8500, duration: "1-month", warrantyHours: 24 },
        sourceIds: ["leonardo-ai-8500-credits-1-month"],
      },
    ],
  },
  {
    slug: "heygen",
    title: "HeyGen Creator",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 190,
    eyebrow: "AI Avatar · 600 credit",
    short: "HeyGen Creator 600 credit / 30 ngày — avatar và video AI.",
    description:
      "Gói HeyGen Creator gồm 600 credit trong 30 ngày cho video avatar, thuyết minh và nội dung marketing.",
    usage:
      "1) Nhận tài khoản sau thanh toán.\n2) Đăng nhập HeyGen.\n3) Kiểm tra gói Creator và credit.\n4) Xuất video trong hạn 30 ngày.",
    accent: "#0EA5E9",
    logo: { type: "svg", svg: brandMarkSvg("H", "#0EA5E9") },
    categoryTag: "AI VIDEO",
    variants: [
      {
        id: "catalog-variant-heygen-600-30d",
        sku: "HEYGEN-CREATOR-600-30D",
        title: "Creator · 600 credit · 30 ngày",
        optionSummary: "600 credit · BH: 1 ngày",
        price: 280000,
        optionValues: { plan: "creator", credits: 600, duration: "30-day", warrantyDays: 1 },
        sourceIds: ["heygen-creator-600-credits-30-days"],
      },
    ],
  },
  {
    slug: "kling",
    title: "Kling AI",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 200,
    eyebrow: "AI Video · Credit pack",
    short: "Kling AI video generation — Standard hoặc Ultra theo credit.",
    description:
      "Gói credit Kling AI cho tạo video generative. Chọn Standard (~792–992 credit) hoặc Ultra (27.500 credit).",
    usage:
      "1) Nhận tài khoản/key sau thanh toán.\n2) Đăng nhập Kling AI.\n3) Kiểm tra credit và hạn BH biến thể.\n4) Tạo video và theo dõi credit tiêu hao.",
    accent: "#111827",
    logo: { type: "svg", svg: brandMarkSvg("K", "#111827") },
    categoryTag: "AI VIDEO",
    variants: [
      {
        id: "catalog-variant-kling-standard",
        sku: "KLING-STANDARD",
        title: "Standard · 792–992 credit",
        optionSummary: "Standard · BH: 12 giờ",
        price: 150000,
        optionValues: { plan: "standard", credits: "792-992", warrantyHours: 12 },
        sourceIds: ["kling-standard-792-992-credits"],
      },
      {
        id: "catalog-variant-kling-ultra",
        sku: "KLING-ULTRA-27500",
        title: "Ultra · 27.500 credit",
        optionSummary: "Ultra · BH: 3 ngày",
        price: 2590000,
        optionValues: { plan: "ultra", credits: 27500, warrantyDays: 3 },
        sourceIds: ["kling-ultra-27500-credits"],
      },
    ],
  },
  {
    slug: "lovable",
    title: "Lovable AI Pro",
    categorySlug: "productivity",
    categoryLabel: "Năng suất",
    sortOrder: 210,
    eyebrow: "AI App Builder · 1 tháng",
    short: "Lovable AI Pro 1 tháng — build app từ prompt.",
    description:
      "Lovable AI Pro hỗ trợ dựng giao diện và ứng dụng từ mô tả tự nhiên trong thời hạn 1 tháng.",
    usage:
      "1) Nhận tài khoản Pro sau thanh toán.\n2) Đăng nhập Lovable.\n3) Tạo project và deploy theo hướng dẫn nền tảng.\n4) Đổi mật khẩu ngay khi nhận mail|pass.",
    accent: "#EC4899",
    logo: { type: "svg", svg: brandMarkSvg("♥", "#EC4899") },
    categoryTag: "DEV TOOL",
    variants: [
      {
        id: "catalog-variant-lovable-pro-1m",
        sku: "LOVABLE-PRO-1M",
        title: "Pro · 1 tháng",
        optionSummary: "1 tháng · BH: 30 ngày",
        price: 560000,
        optionValues: { plan: "pro", duration: "1-month", warrantyDays: 30 },
        sourceIds: ["lovable-ai-pro-1-month"],
      },
    ],
  },
  {
    slug: "gmail-aged",
    title: "Gmail Aged",
    categorySlug: "productivity",
    categoryLabel: "Năng suất",
    sortOrder: 220,
    eyebrow: "Email account · Aged",
    short: "Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.",
    description:
      "Tài khoản Gmail aged theo mốc năm. Phù hợp test, warm-up hoặc nhu cầu tài khoản lâu năm. Không cam bảo lịch sử dịch vụ ngoài mô tả biến thể.",
    usage:
      "1) Nhận mail|pass|2fa (nếu có) sau thanh toán.\n2) Đăng nhập tại accounts.google.com.\n3) Thêm phương thức khôi phục của bạn.\n4) Bật 2FA riêng và xoá 2FA cũ nếu được hướng dẫn.",
    accent: "#EA4335",
    logo: { type: "iconify", id: "logos/google-gmail" },
    categoryTag: "EMAIL",
    variants: [
      {
        id: "catalog-variant-gmail-2010-2016",
        sku: "GMAIL-AGED-2010-2016",
        title: "2010–2016 · kèm số · chưa DV",
        optionSummary: "Date 2010–2016 · có số",
        price: 70000,
        optionValues: { range: "2010-2016", phone: true, unused: true },
        sourceIds: ["gmail-aged-2010-2016-unused-with-phone"],
      },
      {
        id: "catalog-variant-gmail-random-2010-2022",
        sku: "GMAIL-AGED-2010-2022",
        title: "Random 2010–2022",
        optionSummary: "Random date 2010–2022",
        price: 70000,
        optionValues: { range: "2010-2022", random: true },
        sourceIds: ["gmail-aged-random-2010-2022"],
      },
      {
        id: "catalog-variant-gmail-us-2006-2012-otp",
        sku: "GMAIL-US-2006-2012-OTP",
        title: "US 2006–2012 · số + API OTP",
        optionSummary: "US · có số & API OTP",
        price: 80000,
        optionValues: { range: "2006-2012", region: "US", phone: true, otpApi: true },
        sourceIds: ["gmail-us-aged-2006-2012-phone-api-otp"],
      },
      {
        id: "catalog-variant-mail-random-2012-2024",
        sku: "MAIL-AGED-2012-2024",
        title: "Mail cổ random 2012–2024",
        optionSummary: "Siêu trâu · random 2012–2024",
        price: 50000,
        optionValues: { range: "2012-2024", random: true },
        sourceIds: ["aged-mail-random-2012-2024"],
      },
    ],
  },
  {
    slug: "linkedin-premium",
    title: "LinkedIn Premium",
    categorySlug: "productivity",
    categoryLabel: "Năng suất",
    sortOrder: 230,
    eyebrow: "Career · 3 tháng",
    short: "Code LinkedIn Premium Career 3 tháng.",
    description:
      "Mã kích hoạt LinkedIn Premium Career thời hạn 3 tháng. Quyền lợi theo gói Career của LinkedIn.",
    usage:
      "1) Nhận code sau thanh toán.\n2) Mở LinkedIn → Settings → Subscriptions.\n3) Redeem code trên tài khoản của bạn.\n4) Xác nhận Premium Career đã active.",
    accent: "#0A66C2",
    logo: { type: "iconify", id: "logos/linkedin-icon" },
    categoryTag: "CAREER",
    variants: [
      {
        id: "catalog-variant-linkedin-career-3m",
        sku: "LINKEDIN-CAREER-3M",
        title: "Premium Career · 3 tháng",
        optionSummary: "Code redeem · 3 tháng",
        price: 120000,
        optionValues: { plan: "career", duration: "3-month", delivery: "code" },
        sourceIds: ["linkedin-premium-career-code-3-months"],
      },
    ],
  },
  {
    slug: "gpm-login",
    title: "GPM Login",
    categorySlug: "productivity",
    categoryLabel: "Năng suất",
    sortOrder: 240,
    eyebrow: "Antidetect browser · License",
    short: "Key GPM Login chính hãng — trình duyệt antidetect.",
    description:
      "License key GPM Login chính hãng để quản lý profile trình duyệt antidetect phục vụ marketing/automation.",
    usage:
      "1) Nhận key license sau thanh toán.\n2) Tải GPM Login từ nhà phát hành.\n3) Kích hoạt key trong phần License.\n4) Tạo profile và đồng bộ theo nhu cầu.",
    accent: "#2563EB",
    logo: { type: "svg", svg: brandMarkSvg("GPM", "#2563EB") },
    categoryTag: "DEV TOOL",
    variants: [
      {
        id: "catalog-variant-gpm-login-key",
        sku: "GPM-LOGIN-KEY",
        title: "License key chính hãng",
        optionSummary: "Key · BH full theo NCC",
        price: 280000,
        optionValues: { delivery: "license_key" },
        sourceIds: ["gpm-login-license"],
      },
    ],
  },
  {
    slug: "zoom-pro",
    title: "Zoom Pro",
    categorySlug: "productivity",
    categoryLabel: "Năng suất",
    sortOrder: 250,
    eyebrow: "Trial · 28 ngày",
    short: "Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.",
    description:
      "Gói Zoom Pro trial 28 ngày cho họp nhóm, webinar cơ bản và ghi hình theo quyền lợi Pro.",
    usage:
      "1) Nhận tài khoản/key sau thanh toán.\n2) Đăng nhập Zoom desktop/web.\n3) Kiểm tra plan Pro và ngày hết hạn.\n4) Đổi mật khẩu ngay.",
    accent: "#2D8CFF",
    logo: { type: "iconify", id: "simple-icons/zoom" },
    categoryTag: "MEETING",
    variants: [
      {
        id: "catalog-variant-zoom-pro-28d",
        sku: "ZOOM-PRO-28D",
        title: "Pro Trial · 28 ngày",
        optionSummary: "28 ngày · BH full",
        price: 100000,
        optionValues: { plan: "pro-trial", duration: "28-day" },
        sourceIds: ["zoom-pro-trial-28-days"],
      },
    ],
  },
  {
    slug: "scribd",
    title: "Scribd Premium",
    categorySlug: "entertainment",
    categoryLabel: "Giải trí",
    sortOrder: 260,
    eyebrow: "Books & docs · 1 tháng",
    short: "Scribd Premium 1 tháng — sách, audiobook, tài liệu.",
    description:
      "Gói Scribd Premium 1 tháng cho đọc sách, audiobook và tài liệu trong thư viện Scribd.",
    usage:
      "1) Nhận tài khoản sau thanh toán.\n2) Đăng nhập scribd.com hoặc app.\n3) Kiểm tra Premium badge.\n4) Đổi mật khẩu.",
    accent: "#1E7B85",
    logo: { type: "iconify", id: "simple-icons/scribd" },
    categoryTag: "READING",
    variants: [
      {
        id: "catalog-variant-scribd-1m",
        sku: "SCRIBD-PREMIUM-1M",
        title: "Premium · 1 tháng",
        optionSummary: "1 tháng · BH full",
        price: 150000,
        optionValues: { duration: "1-month" },
        sourceIds: ["scribd-premium-1-month"],
      },
    ],
  },
  {
    slug: "tiktok",
    title: "TikTok Account",
    categorySlug: "entertainment",
    categoryLabel: "Giải trí",
    sortOrder: 270,
    eyebrow: "Social account",
    short: "Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.",
    description:
      "Các gói tài khoản TikTok: Hàn mail live, Live Studio buff follow, hoặc cổ mở giỏ hàng + Live.",
    usage:
      "1) Nhận mail|pass|2fa sau thanh toán.\n2) Đăng nhập TikTok, đổi mật khẩu và email khôi phục.\n3) Kiểm tra quyền Live/Shop theo biến thể.\n4) Không spam ngay sau khi nhận tài khoản.",
    accent: "#010101",
    logo: { type: "iconify", id: "logos/tiktok-icon" },
    categoryTag: "SOCIAL",
    variants: [
      {
        id: "catalog-variant-tiktok-kr-live",
        sku: "TIKTOK-KR-MAIL-LIVE",
        title: "Hàn · Mail Live",
        optionSummary: "KR · Live enabled",
        price: 60000,
        optionValues: { region: "KR", live: true },
        sourceIds: ["tiktok-korea-mail-live"],
      },
      {
        id: "catalog-variant-tiktok-live-studio-1k",
        sku: "TIKTOK-LIVE-STUDIO-1K",
        title: "Live Studio · 1K FL buff",
        optionSummary: "Live Studio · ~1K follow buff",
        price: 280000,
        optionValues: { liveStudio: true, followBuff: 1000 },
        sourceIds: ["tiktok-live-studio-1k-fl-buff"],
      },
      {
        id: "catalog-variant-tiktok-shop-live",
        sku: "TIKTOK-AGED-SHOP-LIVE",
        title: "Cổ · Shop + Live",
        optionSummary: "Aged · giỏ hàng + Live",
        price: 420000,
        optionValues: { aged: true, shop: true, live: true },
        sourceIds: ["tiktok-aged-shop-live-enabled"],
      },
    ],
  },
  {
    slug: "hma-vpn",
    title: "HMA VPN",
    categorySlug: "productivity",
    categoryLabel: "Năng suất",
    sortOrder: 280,
    eyebrow: "VPN · 20–30 ngày",
    short: "Key HMA VPN Android/PC 20–30 ngày.",
    description:
      "License HMA (HideMyAss) VPN dùng trên Android/PC trong khoảng 20–30 ngày tùy key bàn giao.",
    usage:
      "1) Nhận key sau thanh toán.\n2) Cài HMA VPN chính thức.\n3) Activate key trên app.\n4) Kết nối server và kiểm tra IP.",
    accent: "#00ADEF",
    logo: { type: "iconify", id: "material-symbols/vpn-lock" },
    categoryTag: "VPN",
    variants: [
      {
        id: "catalog-variant-hma-20-30d",
        sku: "HMA-VPN-20-30D",
        title: "Android/PC · 20–30 ngày",
        optionSummary: "Key · 20–30 ngày",
        price: 40000,
        optionValues: { durationMinDays: 20, durationMaxDays: 30, platforms: "android-pc" },
        sourceIds: ["hma-android-pc-key-20-30-days"],
      },
    ],
  },
  {
    slug: "x-premium",
    title: "X Premium",
    categorySlug: "entertainment",
    categoryLabel: "Giải trí",
    sortOrder: 290,
    eyebrow: "Slot · 3 tháng",
    short: "Slot X (Twitter) Premium 3 tháng.",
    description:
      "Slot X Premium 3 tháng — tham gia gói Premium qua slot được bàn giao (không phải family Google).",
    usage:
      "1) Nhận hướng dẫn join slot sau thanh toán.\n2) Làm theo link/invite trong email đơn.\n3) Kiểm tra badge Premium trên X.\n4) Không rời slot trước hạn nếu muốn giữ Premium.",
    accent: "#000000",
    logo: { type: "iconify", id: "simple-icons/x" },
    categoryTag: "SOCIAL",
    variants: [
      {
        id: "catalog-variant-x-premium-3m",
        sku: "X-PREMIUM-SLOT-3M",
        title: "Premium slot · 3 tháng",
        optionSummary: "Slot · 3 tháng · BH full",
        price: 450000,
        optionValues: { duration: "3-month", delivery: "slot" },
        sourceIds: ["x-premium-slot-3-months"],
      },
    ],
  },
  {
    slug: "notion-enterprise",
    title: "Notion Enterprise",
    categorySlug: "productivity",
    categoryLabel: "Năng suất",
    sortOrder: 300,
    eyebrow: "Slot · 1 năm",
    short: "Slot Notion Enterprise 1 năm.",
    description:
      "Slot workspace Notion Enterprise thời hạn 1 năm — quyền lợi theo workspace được mời.",
    usage:
      "1) Nhận invite email/link sau thanh toán.\n2) Join workspace Notion.\n3) Kiểm tra plan Enterprise.\n4) Dùng email cá nhân ổn định; không rời workspace nếu muốn giữ quyền.",
    accent: "#000000",
    logo: { type: "iconify", id: "logos/notion-icon" },
    categoryTag: "WORKSPACE",
    variants: [
      {
        id: "catalog-variant-notion-ent-1y",
        sku: "NOTION-ENT-SLOT-1Y",
        title: "Enterprise slot · 1 năm",
        optionSummary: "Slot · 1 năm",
        price: 50000,
        optionValues: { duration: "1-year", delivery: "slot", warranty: "none" },
        sourceIds: ["notion-enterprise-slot-1-year"],
      },
    ],
  },
  {
    slug: "veo3-credits",
    title: "VEO3 Credits",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 310,
    eyebrow: "AI Video · Credit pack",
    short: "Gói credit VEO3 — extension 45K hoặc Admin X20 25K.",
    description:
      "Credit pack VEO3 cho tạo video AI. Khác gói VEO3 Anti sẵn có: đây là nạp/extension credit theo mức chọn.",
    usage:
      "1) Nhận hướng dẫn nạp hoặc tài khoản sau thanh toán.\n2) Áp dụng credit vào tài khoản VEO3 chỉ định.\n3) Kiểm tra số dư credit.\n4) Dùng trong hạn BH biến thể.",
    accent: "#0F9D8A",
    logo: { type: "iconify", id: "hugeicons/ai-video" },
    categoryTag: "AI VIDEO",
    variants: [
      {
        id: "catalog-variant-veo3-45k-ext",
        sku: "VEO3-45K-EXT",
        title: "45K credits extension",
        optionSummary: "45K credit · BH: 20 ngày",
        price: 420000,
        optionValues: { credits: 45000, kind: "extension", warrantyDays: 20 },
        sourceIds: ["veo3-45k-credits-extension"],
      },
      {
        id: "catalog-variant-veo3-admin-x20-25k",
        sku: "VEO3-ADMIN-X20-25K",
        title: "Admin X20 · 25K credits",
        optionSummary: "Admin X20 · 25K · BH: 7 ngày",
        price: 2380000,
        optionValues: { credits: 25000, plan: "admin-x20", warrantyDays: 7 },
        sourceIds: ["admin-veo3-x20-25k-credits"],
      },
    ],
  },
  {
    slug: "google-family",
    title: "Google Family Slot",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 320,
    eyebrow: "Family slot · AI plan",
    short: "Slot Add Family cho gói AI — 0 credit hoặc random credit.",
    description:
      "Slot gia đình Google/AI plan: biến thể 0 credit hoặc random credit. Quyền lợi phụ thuộc gói chủ family.",
    usage:
      "1) Cung cấp email Google sạch theo hướng dẫn đơn.\n2) Chấp nhận lời mời family.\n3) Kiểm tra quyền AI trên tài khoản.\n4) Không rời family trước hạn nếu muốn giữ slot.",
    accent: "#4285F4",
    logo: { type: "iconify", id: "logos/google-icon" },
    categoryTag: "AI ACCOUNT",
    variants: [
      {
        id: "catalog-variant-family-0-credit",
        sku: "FAMILY-SLOT-0CR",
        title: "Slot family · 0 credit",
        optionSummary: "0 credit · BH: 30 ngày",
        price: 535000,
        optionValues: { credits: 0, warrantyDays: 30 },
        sourceIds: ["slot-add-family-0-credit"],
      },
      {
        id: "catalog-variant-family-random-credit",
        sku: "FAMILY-SLOT-RND-CR",
        title: "Slot family · random credit",
        optionSummary: "Random credit · BH: 30 ngày",
        price: 630000,
        optionValues: { credits: "random", warrantyDays: 30 },
        sourceIds: ["slot-add-family-random-credit"],
      },
    ],
  },
  {
    slug: "grok-api",
    title: "Grok xAI API",
    categorySlug: "ai-tools",
    categoryLabel: "Công cụ AI",
    sortOrder: 330,
    eyebrow: "API Key · $100 · 1 tháng",
    short: "API Key Grok xAI mệnh giá 100 USD / 1 tháng.",
    description:
      "API key Grok (xAI) với hạn mức tương đương gói 100 USD trong 1 tháng. Khác gói Super Grok dùng web/app.",
    usage:
      "1) Nhận API key sau thanh toán.\n2) Gọi API theo docs xAI/Grok.\n3) Theo dõi usage/quota.\n4) Không public key; rotate nếu lộ.",
    accent: "#111111",
    logo: { type: "iconify", id: "simple-icons/x" },
    categoryTag: "AI API",
    variants: [
      {
        id: "catalog-variant-grok-api-100-1m",
        sku: "GROK-API-100USD-1M",
        title: "API · $100 · 1 tháng",
        optionSummary: "$100 credit · BH: 30 ngày",
        price: 1400000,
        optionValues: { usdCredit: 100, duration: "1-month", warrantyDays: 30 },
        sourceIds: ["grok-xai-api-key-100usd-1-month"],
      },
    ],
  },
];

function brandMarkSvg(letter, color) {
  const safe = String(letter).slice(0, 3);
  const fontSize = safe.length > 1 ? 360 : 520;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" rx="260" fill="${color}"/>
  <text x="600" y="680" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${escapeXml(safe)}</text>
</svg>`;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(obj) {
  return sqlQuote(JSON.stringify(obj));
}

function multilang(product) {
  const usageBlock = `\n\nHướng dẫn sử dụng:\n${product.usage}`;
  const note =
    "\n\nLưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.";
  return {
    vi: {
      title: product.title,
      eyebrow: product.eyebrow,
      short: product.short,
      description: `${product.description}${usageBlock}${note}`,
      seoTitle: `${product.title} | TUNG Shop`,
      seoDescription: product.short,
    },
    en: {
      title: product.title,
      eyebrow: product.eyebrow,
      short: product.short,
      description: `${product.description}\n\nHow to use:\n${product.usage}${note}`,
      seoTitle: `${product.title} | TUNG Shop`,
      seoDescription: product.short,
    },
    ja: {
      title: product.title,
      eyebrow: product.eyebrow,
      short: product.short,
      description: `${product.description}\n\n使い方:\n${product.usage}${note}`,
      seoTitle: `${product.title} | TUNG Shop`,
      seoDescription: product.short,
    },
    zh: {
      title: product.title,
      eyebrow: product.eyebrow,
      short: product.short,
      description: `${product.description}\n\n使用说明:\n${product.usage}${note}`,
      seoTitle: `${product.title} | TUNG Shop`,
      seoDescription: product.short,
    },
  };
}

async function fetchIconify(id) {
  const url = `https://api.iconify.design/${id}.svg?height=320`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iconify ${id} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ensureLogo(product) {
  const file = path.join(logoDir, `${product.slug}.svg`);
  if (product.logo.type === "svg") {
    await fs.writeFile(file, product.logo.svg);
    return file;
  }
  try {
    await fs.access(file);
    return file;
  } catch {
    const buf = await fetchIconify(product.logo.id);
    await fs.writeFile(file, buf);
    return file;
  }
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function darken(hex, amount = 0.55) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => Math.max(0, Math.round(c * (1 - amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

async function composeCover(product, logoFile) {
  const accent = product.accent;
  const dark = darken(accent, 0.65);
  const mid = darken(accent, 0.35);
  const bg = Buffer.from(`
<svg width="1200" height="900" viewBox="0 0 1200 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${dark}"/>
      <stop offset="55%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#g)"/>
  <circle cx="600" cy="360" r="340" fill="url(#glow)"/>
  <g stroke="#ffffff" stroke-opacity="0.05" stroke-width="1">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="900"/>`).join("")}
    ${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="1200" y2="${i * 100}"/>`).join("")}
  </g>
  <rect x="340" y="190" width="520" height="500" rx="54" fill="#ffffff" fill-opacity="0.94"/>
  <rect x="404" y="562" width="392" height="3" rx="2" fill="${accent}" fill-opacity="0.9"/>
  <text x="600" y="615" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="30" font-weight="700" fill="#111318">${escapeXml(product.title)}</text>
  <text x="600" y="652" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="2.8" fill="#626971">${escapeXml(product.categoryTag)}</text>
</svg>`);

  const logoPng = await sharp(logoFile)
    .resize({ width: 220, height: 220, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();

  const outPublic = path.join(publicShop, `${product.slug}.webp`);
  const outArt = path.join(outDir, `${product.slug}.webp`);
  const composed = sharp(bg).composite([
    { input: logoPng, left: Math.round((1200 - 220) / 2), top: 270 },
  ]);
  await composed.webp({ quality: 90, effort: 5 }).toFile(outPublic);
  await fs.copyFile(outPublic, outArt);
  return outPublic;
}

function buildSql(products) {
  const lines = [];
  lines.push(`-- TUNG Shop catalog expansion from tap-hoa-ai-products.json (non-duplicates only).`);
  lines.push(`-- Categories reused: ai-tools, creative-tools, entertainment, productivity.`);
  lines.push(`-- Inventory keys are NOT created here.`);
  lines.push(`PRAGMA foreign_keys = ON;`);
  lines.push(``);

  for (const product of products) {
    const productId = `catalog-product-${product.slug}`;
    const loc = multilang(product);
    const meta = {
      categorySlug: product.categorySlug,
      category: product.categoryLabel,
      badges: ["Giao key tự động", "TUNG Shop"],
      seedKey,
      source: "tap-hoa-ai-products.json",
      sourceIds: product.variants.flatMap((v) => v.sourceIds),
    };

    lines.push(`-- ===== ${product.title} (${product.slug}) =====`);
    lines.push(`INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  ${sqlQuote(productId)},
  ${sqlQuote(product.slug)},
  'active', 'digital_key', 0, ${product.sortOrder}, 'vi', NULL,
  ${jsonSql(meta)},
  1, ${sqlQuote(now)}, ${sqlQuote(actor)}, ${sqlQuote(actor)}, ${sqlQuote(now)}, ${sqlQuote(now)}
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = ${sqlQuote(product.slug)} AND p.deleted_at IS NULL);`);
    lines.push(``);

    for (const locale of ["vi", "en", "ja", "zh"]) {
      const L = loc[locale];
      lines.push(`INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  ${sqlQuote(productId)}, ${sqlQuote(locale)},
  ${sqlQuote(L.title)}, ${sqlQuote(L.eyebrow)}, ${sqlQuote(L.short)},
  ${sqlQuote(L.description)}, ${sqlQuote(L.seoTitle)}, ${sqlQuote(L.seoDescription)}
);`);
    }
    lines.push(``);

    for (const variant of product.variants) {
      const vMeta = {
        seedKey,
        sourceIds: variant.sourceIds,
        ...variant.optionValues,
      };
      lines.push(`INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  ${sqlQuote(variant.id)}, ${sqlQuote(productId)}, ${sqlQuote(variant.sku)},
  'active', 'license_key', 'automatic', 'tracked',
  ${variant.price}, NULL, 'VND', 3, 1,
  ${jsonSql(variant.optionValues)},
  ${jsonSql(vMeta)},
  1, ${sqlQuote(now)}, ${sqlQuote(now)}
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = ${sqlQuote(productId)} AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = ${sqlQuote(variant.sku)} COLLATE NOCASE AND deleted_at IS NULL);`);
      lines.push(``);

      for (const locale of ["vi", "en", "ja", "zh"]) {
        lines.push(`INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES (${sqlQuote(variant.id)}, ${sqlQuote(locale)}, ${sqlQuote(variant.title)}, ${sqlQuote(variant.optionSummary)});`);
      }
      lines.push(``);
    }

    lines.push(`INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  ${sqlQuote(`catalog-media-${product.slug}`)},
  ${sqlQuote(productId)},
  NULL, NULL, 'image',
  ${sqlQuote(`https://media.tung.codes/shop/${product.slug}.webp`)},
  ${sqlQuote(`Ảnh bìa ${product.title} — TUNG Shop`)},
  0, ${sqlQuote(now)}
);`);
    lines.push(``);
  }

  const productCount = products.length;
  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  lines.push(`INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
VALUES (
  'audit-shop-taphoa-2026-07-25-v1',
  ${sqlQuote(actor)},
  'shop.catalog.seeded',
  'shop_catalog',
  ${sqlQuote(seedKey)},
  NULL,
  ${jsonSql({ products: productCount, variants: variantCount, source: "tap-hoa-ai-products.json", skippedDuplicates: [...EXISTING_SKIP] })},
  ${sqlQuote(now)}
);`);
  lines.push(``);
  return lines.join("\n");
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    uploadR2: argv.includes("--upload-r2"),
    imagesOnly: argv.includes("--images-only"),
    sqlOnly: argv.includes("--sql-only"),
  };
}

async function uploadR2(slug) {
  const file = path.join(publicShop, `${slug}.webp`);
  const args = [
    "wrangler",
    "r2",
    "object",
    "put",
    `tung-profile-media/shop/${slug}.webp`,
    "--file",
    file,
    "--content-type",
    "image/webp",
    "--remote",
  ];
  const result = spawnSync("npx", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw new Error(`R2 upload failed for ${slug}`);
  }
  console.log(`[r2] shop/${slug}.webp`);
}

async function applySql() {
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "tungjpstore-content", "--remote", "--file", sqlPath],
    { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  console.log(result.stdout);
  if (result.status !== 0) {
    console.error(result.stderr);
    throw new Error("D1 apply failed");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fs.mkdir(logoDir, { recursive: true });
  await fs.mkdir(publicShop, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  // coverage check vs source JSON
  const sourcePath = path.join(process.env.HOME || "", "Downloads", "tap-hoa-ai-products.json");
  let sourceIds = [];
  try {
    const raw = JSON.parse(await fs.readFile(sourcePath, "utf8"));
    sourceIds = raw.products.map((p) => p.id);
  } catch {
    console.warn("[warn] source JSON not found at Downloads; skip coverage check");
  }
  if (sourceIds.length) {
    const covered = new Set(CATALOG.flatMap((p) => p.variants.flatMap((v) => v.sourceIds)));
    const skipped = sourceIds.filter((id) => EXISTING_SKIP.has(id));
    const missing = sourceIds.filter((id) => !covered.has(id) && !EXISTING_SKIP.has(id));
    console.log(`[diff] source=${sourceIds.length} covered=${covered.size} skipped_dup=${skipped.length} missing=${missing.length}`);
    if (missing.length) console.log("[missing]", missing.join(", "));
    if (skipped.length) console.log("[skipped duplicates]", skipped.join(", "));
  }

  if (!args.sqlOnly) {
    for (const product of CATALOG) {
      const logo = await ensureLogo(product);
      await composeCover(product, logo);
      console.log(`[cover] ${product.slug}`);
    }
  }

  const sql = buildSql(CATALOG);
  await fs.writeFile(sqlPath, sql);
  console.log(`[sql] ${sqlPath}`);

  if (args.uploadR2) {
    for (const product of CATALOG) await uploadR2(product.slug);
  }
  if (args.apply) await applySql();

  console.log(`[done] products=${CATALOG.length} variants=${CATALOG.reduce((n, p) => n + p.variants.length, 0)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
