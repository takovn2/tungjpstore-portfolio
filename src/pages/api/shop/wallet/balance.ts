import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCustomerSession } from "../../../../lib/shop/customer-auth";
import { getCustomerLifetimeSpend } from "../../../../lib/shop/loyalty";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getCustomerSession(env, request);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, code: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  let balanceVndMinor = 0;
  let balanceUsdMinor = 0;
  let transactions: Array<{
    id: string;
    type: string;
    amountMinor: number;
    currency: string;
    createdAt: string;
    description: string;
  }> = [];

  if (env.CONTENT_DB) {
    try {
      const row = await env.CONTENT_DB.prepare(`
        SELECT COALESCE(balance_vnd_minor, 0) AS balance_vnd,
               COALESCE(balance_usd_minor, 0) AS balance_usd
        FROM shop_customer_wallets
        WHERE customer_id = ?
      `).bind(session.customerId).first<{ balance_vnd: number; balance_usd: number }>();

      if (row) {
        balanceVndMinor = row.balance_vnd || 0;
        balanceUsdMinor = row.balance_usd || 0;
      }

      const history = await env.CONTENT_DB.prepare(`
        SELECT id, type, amount_minor, currency, reference_id, description, created_at
        FROM shop_wallet_transactions
        WHERE customer_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).bind(session.customerId).all<{
        id: string;
        type: string;
        amount_minor: number;
        currency: string;
        reference_id: string | null;
        description: string | null;
        created_at: string;
      }>();

      transactions = (history.results ?? []).map((entry) => ({
        id: entry.id,
        type: entry.type,
        amountMinor: entry.amount_minor,
        currency: entry.currency,
        createdAt: entry.created_at,
        description: entry.description ?? entry.reference_id ?? "",
      }));
    } catch {
      // Wallet tables are optional; an unreadable wallet must not break the page.
    }
  }

  const loyalty = env.CONTENT_DB && session.emailNormalized
    ? await getCustomerLifetimeSpend(env.CONTENT_DB, session.emailNormalized)
    : null;

  return new Response(JSON.stringify({
    ok: true,
    wallet: {
      customerId: session.customerId,
      balanceVndMinor,
      balanceUsdMinor,
      transactions,
    },
    loyalty,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
    },
  });
};

export const ALL: APIRoute = () => new Response(JSON.stringify({ ok: false, code: "method_not_allowed" }), { status: 405 });
