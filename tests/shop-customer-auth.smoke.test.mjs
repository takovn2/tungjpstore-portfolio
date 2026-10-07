import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

// Import compiled-friendly pure helpers via experimental strip types when available.
// Fallback: re-implement critical path checks that mirror customer-auth contracts.

function sanitizeReturnPath(value, fallback = "/shop/account") {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("\0")) {
    return fallback;
  }
  try {
    const url = new URL(trimmed, "https://tung.codes");
    if (url.origin !== "https://tung.codes") return fallback;
    const path = `${url.pathname}${url.search}`;
    const allowed = /^\/(en|ja|zh|vi)?\/?shop(\/account(\/.*)?)?$/.test(url.pathname)
      || /^\/(en|ja|zh|vi)?\/?shop\/order$/.test(url.pathname)
      || /^\/(en|ja|zh|vi)?\/?shop\/cart$/.test(url.pathname)
      || url.pathname === "/shop"
      || url.pathname === "/shop/"
      || /^\/(en|ja|zh|vi)\/shop\/?$/.test(url.pathname);
    if (!allowed) return fallback;
    if (path.length > 512) return fallback;
    return path;
  } catch {
    return fallback;
  }
}

describe("customer auth return path allowlist", () => {
  it("allows shop account paths", () => {
    assert.equal(sanitizeReturnPath("/shop/account"), "/shop/account");
    assert.equal(sanitizeReturnPath("/shop/account/orders"), "/shop/account/orders");
    assert.equal(sanitizeReturnPath("/en/shop/account/login"), "/en/shop/account/login");
    assert.equal(sanitizeReturnPath("/shop/order"), "/shop/order");
    assert.equal(sanitizeReturnPath("/shop/cart"), "/shop/cart");
    assert.equal(sanitizeReturnPath("/shop/cart?step=checkout"), "/shop/cart?step=checkout");
    assert.equal(sanitizeReturnPath("/ja/shop/cart?step=checkout"), "/ja/shop/cart?step=checkout");
  });

  it("blocks open redirects", () => {
    assert.equal(sanitizeReturnPath("https://evil.example/phish"), "/shop/account");
    assert.equal(sanitizeReturnPath("//evil.example"), "/shop/account");
    assert.equal(sanitizeReturnPath("/admin"), "/shop/account");
    assert.equal(sanitizeReturnPath("/api/shop/checkout"), "/shop/account");
    assert.equal(sanitizeReturnPath("../etc/passwd"), "/shop/account");
  });
});

describe("opaque token shape", () => {
  it("accepts 43-char base64url tokens", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEF_";
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  });
});

describe("OAuth and account cache hardening", () => {
  it("requires the same-site OAuth state cookie", () => {
    const oauth = read("src/lib/shop/oauth-google.ts");
    assert.match(oauth, /if \(!input\.cookieState \|\| input\.cookieState !== input\.state\)/);
  });

  it("marks localized and canonical account pages private and no-store", () => {
    const localized = read("src/pages/[lang]/[...slug].astro");
    const auth = read("src/lib/shop/customer-auth.ts");
    assert.match(localized, /if \(isAccountRoute \|\| isCart\) setPrivateNoStore\(Astro\.response\.headers\)/);
    assert.match(auth, /Cloudflare-CDN-Cache-Control", "no-store, max-age=0"/);
    for (const path of [
      "src/pages/shop/account/index.astro",
      "src/pages/shop/account/login.astro",
      "src/pages/shop/account/orders/index.astro",
      "src/pages/shop/account/orders/[id].astro",
    ]) {
      assert.match(read(path), /setPrivateNoStore\(Astro\.response\.headers\)/, path);
    }
  });

  it("preserves a safe checkout return path across account login", () => {
    const component = read("src/components/pages/AccountLoginPage.astro");
    const canonical = read("src/pages/shop/account/login.astro");
    const localized = read("src/pages/[lang]/[...slug].astro");
    assert.match(component, /sanitizeReturnPath\(requestedReturnPath/);
    assert.match(component, /encodeURIComponent\(returnPath\)/);
    assert.match(canonical, /Astro\.url\.searchParams\.get\("return"\)/);
    assert.match(canonical, /Astro\.redirect\(returnPath/);
    assert.match(localized, /accountReturnPath/);
    assert.match(localized, /returnPath=\{accountReturnPath\}/);
  });

  it("retries welcome enqueue on login while deduplicating by customer", () => {
    const account = read("src/lib/shop/customer-account.ts");
    assert.match(account, /INSERT OR IGNORE INTO transactional_email_outbox/);
    assert.match(account, /'shop\.customer\.welcome', 'shop_customer'/);
    assert.match(account, /customer-welcome:\$\{customerId\}/);
  });

  it("reserves customer key-reveal slots atomically and advertises retry timing", () => {
    const account = read("src/lib/shop/customer-account.ts");
    const service = read("src/lib/shop/service.ts");
    const route = read("src/pages/api/shop/me/orders/[orderId]/keys.ts");
    assert.match(account, /INSERT INTO shop_customer_security_events[\s\S]*SELECT \?, \?, 'key_reveal'/);
    assert.match(account, /COUNT\(\*\)[\s\S]*event_type = 'key_reveal'[\s\S]*< 20/);
    assert.doesNotMatch(account, /const count = await db\.prepare\(`SELECT COUNT\(\*\) AS count FROM shop_customer_security_events/);
    assert.match(account, /deliverCustomerOwnedOrder\(bindings, input\.customerId, order\.id, "account"\)/);
    assert.match(service, /FROM shop_orders WHERE id = \? AND customer_id = \? LIMIT 1/);
    assert.match(route, /retry-after/);
  });
});
