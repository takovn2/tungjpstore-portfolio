import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getPublicShopOrderStatus } from "../../../lib/shop/service";

export const prerender = false;

const MAX_QR_BYTES = 512_000;

const json = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  },
});

function isSupportedQrImage(bytes: Uint8Array) {
  const png = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png ? "image/png" : jpeg ? "image/jpeg" : null;
}

export const GET: APIRoute = async ({ request }) => {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{24,200})$/);
  if (!match) return json({ ok: false, code: "order_access_required" }, 401);

  try {
    const order = await getPublicShopOrderStatus(env, match[1]);
    if (!order) return json({ ok: false, code: "order_not_found" }, 404);
    if (!order.qrUrl) return json({ ok: false, code: "order_qr_pending" }, 409);

    const qrUrl = new URL(order.qrUrl);
    if (qrUrl.protocol !== "https:" || qrUrl.hostname !== "img.vietqr.io") {
      return json({ ok: false, code: "order_qr_unavailable" }, 502);
    }
    const upstream = await fetch(qrUrl, {
      headers: { accept: "image/png,image/jpeg;q=0.9" },
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (!upstream.ok || (declaredLength > 0 && declaredLength > MAX_QR_BYTES)) {
      return json({ ok: false, code: "order_qr_unavailable" }, 502);
    }
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const contentType = bytes.length <= MAX_QR_BYTES ? isSupportedQrImage(bytes) : null;
    if (!contentType) return json({ ok: false, code: "order_qr_unavailable" }, 502);

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(bytes.length),
        "cache-control": "private, no-store, max-age=0",
        "content-disposition": "inline; filename=payment-qr.png",
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "order_qr_unavailable";
    console.error(JSON.stringify({ event: "public_order_qr_proxy_failed", code }));
    return json({ ok: false, code: "order_qr_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
