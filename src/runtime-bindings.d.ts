declare namespace Cloudflare {
  interface Env {
    SHOP_KEY_ENCRYPTION_SECRET?: string;
    VIETQR_BANK_ACCOUNT?: string;
    SHOP_PUBLIC_ORIGIN?: string;
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
    /** Optional Mini App shop name override (defaults to Telegram bot first_name). */
    TELEGRAM_MINI_SHOP_NAME?: string;
    /** Optional kill-switch for the Vietnam Mini App surface ("1"/"true" to force-enable; defaults to the D1 setting). */
    TELEGRAM_MINI_APP_ENABLED?: string;
    /** Optional welcome kicker override for the Vietnam Mini App hero. */
    TELEGRAM_MINI_WELCOME_KICKER?: string;
    /** Optional welcome heading override for the Vietnam Mini App hero. */
    TELEGRAM_MINI_WELCOME_HEADING?: string;
    /** Optional welcome emphasis override for the Vietnam Mini App hero. */
    TELEGRAM_MINI_WELCOME_EMPHASIS?: string;
    TELEGRAM_TOKEN_ENCRYPTION_SECRET?: string;
    TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION?: string;
    TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS?: string;
    NOTION_SHOP_TOKEN?: string;
    NOTION_SHOP_DATABASE_ID?: string;
    NOTION_EDITORIAL_DATABASE_ID?: string;
    NOTION_API_VERSION?: string;
    SHOP_CRON_SECRET?: string;
    TURNSTILE_SECRET_KEY?: string;
    TRANSACTIONAL_EMAIL_DELIVER_KEYS?: string;
    GOOGLE_OAUTH_CLIENT_ID?: string;
    GOOGLE_OAUTH_CLIENT_SECRET?: string;
    SHOP_CUSTOMER_SESSION_SECRET?: string;
    TELEGRAM_MINI_APP_SESSION_SECRET?: string;
  }
}
