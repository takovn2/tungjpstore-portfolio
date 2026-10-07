/**
 * Authentication for machine-to-machine shop integrations.
 *
 * The Telegram VPS worker uses a dedicated bearer secret. It never receives
 * the admin cookie and is intentionally separate from the order access token.
 */
export type IntegrationAuthResult =
  | { ok: true; subject: string }
  | { ok: false; code: "integration_not_configured" | "integration_auth_required" | "integration_auth_invalid"; status: 401 | 503 };

const encoder = new TextEncoder();

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyShopIntegrationBearer(request: Request, secret: string | undefined): Promise<IntegrationAuthResult> {
  const expected = typeof secret === "string" ? secret.trim() : "";
  if (expected.length < 32) return { ok: false, code: "integration_not_configured", status: 503 };
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]{32,200})$/.exec(header);
  if (!match) return { ok: false, code: "integration_auth_required", status: 401 };
  const candidate = match[1];
  const [expectedDigest, candidateDigest] = await Promise.all([digest(expected), digest(candidate)]);
  if (!constantTimeEqual(expectedDigest, candidateDigest)) return { ok: false, code: "integration_auth_invalid", status: 401 };
  return { ok: true, subject: "telegram-vps" };
}

export function integrationWorkerId(request: Request) {
  const value = request.headers.get("x-shop-worker-id")?.trim() ?? "";
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : "telegram-vps";
}
