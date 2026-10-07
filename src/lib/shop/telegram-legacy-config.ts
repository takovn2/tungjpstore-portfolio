const REGISTRY_OWNED_STATUSES = [
  "standby",
  "activating",
  "active",
  "previous",
  "retiring",
  "error",
] as const;

type LegacyTelegramConfigurationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "telegram_legacy_config_disabled" };

/**
 * Keep the Worker-secret fallback from mutating Telegram once a reusable
 * registry credential exists, including during activation and retirement.
 */
export async function configureLegacyTelegramBotSafely<T>(
  db: D1Database,
  configure: () => Promise<T>,
): Promise<LegacyTelegramConfigurationResult<T>> {
  const placeholders = REGISTRY_OWNED_STATUSES.map(() => "?").join(", ");
  const owner = await db.prepare(
    `SELECT 1 AS found FROM shop_telegram_bot_configs WHERE scope = 'legacy' AND status IN (${placeholders}) LIMIT 1`,
  ).bind(...REGISTRY_OWNED_STATUSES).first<{ found: number }>();
  if (owner) return { ok: false, code: "telegram_legacy_config_disabled" };
  return { ok: true, value: await configure() };
}
