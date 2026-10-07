import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { consumeCartBridge, createCartBridge } from "../../../lib/shop/platform/service";
import type { CartBridgePayload, ShopChannel } from "../../../lib/shop/platform/attribution";

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  },
});

const MAX_BODY = 12_000;

async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { error: json({ ok: false, code: "invalid_content_type" }, 415) };
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: json({ ok: false, code: "payload_too_large" }, 413) };
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { error: json({ ok: false, code: "invalid_json" }, 400) };
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  const body = await readJson(request);
  if ("error" in body && body.error) return body.error;
  const value = body.value as {
    items?: CartBridgePayload["items"];
    attribution?: CartBridgePayload["attribution"];
    channel?: ShopChannel;
  };
  if (!Array.isArray(value?.items) || !value.items.length) {
    return json({ ok: false, code: "bridge_empty" }, 422);
  }
  try {
    const result = await createCartBridge(
      env.CONTENT_DB,
      {
        v: 1,
        items: value.items,
        attribution: value.attribution,
        createdAt: new Date().toISOString(),
      },
      value.channel === "telegram" || value.channel === "telegram_glb" ? value.channel : "web",
    );
    const origin = env.SHOP_PUBLIC_ORIGIN?.trim() || "https://tung.codes";
    return json({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      itemCount: result.itemCount,
      url: `${origin}/shop/cart?bridge=${encodeURIComponent(result.token)}`,
    }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "bridge_failed";
    if (code === "bridge_empty") return json({ ok: false, code }, 422);
    // Migration not applied yet
    if (/no such table/i.test(String(error))) {
      return json({ ok: false, code: "bridge_not_migrated" }, 503);
    }
    return json({ ok: false, code: "bridge_failed" }, 503);
  }
};

export const GET: APIRoute = async ({ request }) => {
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  if (!token) return json({ ok: false, code: "token_required" }, 400);
  try {
    const payload = await consumeCartBridge(env.CONTENT_DB, token);
    if (!payload) return json({ ok: false, code: "bridge_invalid_or_expired" }, 404);
    return json({ ok: true, bridge: payload });
  } catch (error) {
    if (/no such table/i.test(String(error))) {
      return json({ ok: false, code: "bridge_not_migrated" }, 503);
    }
    return json({ ok: false, code: "bridge_failed" }, 503);
  }
};

export const ALL: APIRoute = ({ request }) => {
  if (request.method === "POST") return POST({ request } as Parameters<NonNullable<typeof POST>>[0]);
  if (request.method === "GET") return GET({ request } as Parameters<NonNullable<typeof GET>>[0]);
  return json({ ok: false, code: "method_not_allowed" }, 405);
};
