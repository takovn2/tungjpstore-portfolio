declare namespace Cloudflare {
  interface Env {
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    CF_ACCESS_ALLOWED_EMAILS?: string;
    ADMIN_AUTH_SECRET?: string;
    TURNSTILE_SECRET_KEY?: string;
    CONTACT_HASH_SECRET?: string;
    SHOP_KEY_ENCRYPTION_SECRET?: string;
    SHOP_KEY_ENCRYPTION_KEY_VERSION?: string;
    SHOP_ORDER_TOKEN_SECRET?: string;
    SHOP_PUBLIC_ORIGIN?: string;
    VIETQR_BANK_ACCOUNT?: string;
    PAYOS_CLIENT_ID?: string;
    PAYOS_API_KEY?: string;
    PAYOS_CHECKSUM_KEY?: string;
    BYBIT_API_KEY?: string;
    BYBIT_API_SECRET?: string;
    BYBIT_API_BASE_URL?: string;
    BINANCE_API_KEY?: string;
    BINANCE_API_SECRET?: string;
    BINANCE_API_BASE_URL?: string;
    SHOP_TELEGRAM_VPS_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    TELEGRAM_BOT_USERNAME?: string;
    TELEGRAM_TOKEN_ENCRYPTION_SECRET?: string;
    TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION?: string;
    TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS?: string;
    SHOP_CRON_SECRET?: string;
    NOTION_SHOP_TOKEN?: string;
    NOTION_SHOP_DATABASE_ID?: string;
    NOTION_EDITORIAL_DATABASE_ID?: string;
    NOTION_API_VERSION?: string;
    PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN?: string;
    TRANSACTIONAL_EMAIL_DELIVER_KEYS?: string;
    GOOGLE_OAUTH_CLIENT_ID?: string;
    GOOGLE_OAUTH_CLIENT_SECRET?: string;
    SHOP_CUSTOMER_SESSION_SECRET?: string;
    TELEGRAM_MINI_APP_SESSION_SECRET?: string;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
