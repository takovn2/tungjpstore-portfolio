import type { TelegramUser } from "./telegram";

const encoder = new TextEncoder();
const MAX_INIT_DATA_AGE_SECONDS = 15 * 60;

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyTelegramMiniAppInitData(
  raw: string | null,
  botToken: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<{ ok: true; user: TelegramUser; authDate: number } | { ok: false; code: string }> {
  if (!raw || raw.length > 8_192 || !botToken?.trim()) return { ok: false, code: "telegram_auth_unavailable" };
  const params = new URLSearchParams(raw);
  const seen = new Set<string>();
  for (const [key] of params.entries()) {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(key) || seen.has(key) || seen.size >= 32) {
      return { ok: false, code: "telegram_auth_invalid" };
    }
    seen.add(key);
  }
  const providedHash = params.get("hash")?.toLowerCase() || "";
  const authDate = Number(params.get("auth_date") || "0");
  const userJson = params.get("user") || "";
  if (!/^[a-f0-9]{64}$/.test(providedHash) || !Number.isInteger(authDate) || authDate <= 0 || !userJson) return { ok: false, code: "telegram_auth_invalid" };
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS) return { ok: false, code: "telegram_auth_expired" };

  const checkString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    encoder.encode(botToken.trim()),
  );
  const calculatedHash = hex(await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", secretKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    encoder.encode(checkString),
  ));
  if (!safeEqual(providedHash, calculatedHash)) return { ok: false, code: "telegram_auth_invalid" };

  try {
    const value = JSON.parse(userJson) as Partial<TelegramUser>;
    if (!Number.isSafeInteger(value.id) || Number(value.id) <= 0 || typeof value.first_name !== "string") return { ok: false, code: "telegram_user_invalid" };
    return {
      ok: true,
      authDate,
      user: {
        id: Number(value.id),
        first_name: value.first_name.slice(0, 80),
        ...(typeof value.last_name === "string" ? { last_name: value.last_name.slice(0, 80) } : {}),
        ...(typeof value.username === "string" ? { username: value.username.slice(0, 64) } : {}),
        ...(typeof value.language_code === "string" ? { language_code: value.language_code.slice(0, 16) } : {}),
      },
    };
  } catch {
    return { ok: false, code: "telegram_user_invalid" };
  }
}
