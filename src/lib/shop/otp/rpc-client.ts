import { canonicalRequest, type OtpBindings, type OtpRpcRequestV1 } from "./contract";

export async function signedRpcRequest(bindings: Pick<OtpBindings, "OTP_BRIDGE_RPC_HMAC_KEY">,
  input: Omit<OtpRpcRequestV1, "v" | "issuedAt" | "requestId" | "mac">, now = Date.now()): Promise<OtpRpcRequestV1> {
  const secret = bindings.OTP_BRIDGE_RPC_HMAC_KEY;
  if (!secret || secret.length < 32 || secret.length > 512) throw new Error("otp_service_unavailable");
  const request = { ...input, v: 1 as const, issuedAt: new Date(now).toISOString(), requestId: crypto.randomUUID() };
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonicalRequest(request)));
  const mac = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ...request, mac };
}
export async function boundedRpc<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("otp_service_unavailable")), 3000);
  })]).finally(() => clearTimeout(timer));
}
