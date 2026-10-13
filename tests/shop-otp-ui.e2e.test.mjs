import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import { root, otpModule } from "./helpers/otp-harness.mjs";
const { getOtpCopy } = await otpModule("src/i18n/shop-otp.ts");
let server, origin, bundle, css;
const browsers = {};
before(async () => {
  const result = await build({ stdin: { contents: `import React from "react"; import {createRoot} from "react-dom/client";
    import Card from "./src/components/shop/otp/CustomerOtpCard";
    const query=new URLSearchParams(location.search);
    createRoot(document.getElementById("root")).render(React.createElement(Card,{orderId:"order-a",allocationId:"allocation-a",title:"Synthetic delivered account",locale:query.get("locale")||"en",grantState:query.get("state")||"active"}));`,
    resolveDir: root, sourcefile: "otp-ui-fixture.tsx" }, bundle: true, format: "esm", platform: "browser", jsx: "automatic",
    write: false, outdir: "/tmp/otp-ui-bundle", define: { "process.env.NODE_ENV": '"production"' } });
  bundle = result.outputFiles.find(f => f.path.endsWith(".js")).text;
  css = result.outputFiles.find(f => f.path.endsWith(".css")).text;
  server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/app.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle); }
    else if (request.url === "/app.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><main id="root"></main><script type="module" src="/app.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browsers.chromium = await chromium.launch(); browsers.webkit = await webkit.launch();
}, { timeout: 30000 });
after(async () => { await Promise.all(Object.values(browsers).map(browser => browser.close())); await new Promise(resolve => server?.close(resolve)); });
async function pageFor(engine, locale = "en", state = "active") {
  const context = await browsers[engine].newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.copiedSynthetic = text; } }, configurable: true }); });
  await page.goto(`${origin}/?locale=${locale}&state=${state}`); await page.locator("article.customer-otp").waitFor();
  return { page, context, labels: getOtpCopy(locale) };
}
for (const engine of ["chromium", "webkit"]) {
  for (const locale of ["vi", "en", "ja", "zh"]) test(`${engine} mobile ${locale}: scoped request, accessible code, copy, no storage, clear on hidden`, async () => {
    const { page, context, labels } = await pageFor(engine, locale);
    try {
      let count = 0;
      await page.route("**/api/shop/me/orders/order-a/otp", async route => {
        count += 1; assert.equal(route.request().method(), "POST");
        assert.deepEqual(route.request().postDataJSON(), { allocationId: "allocation-a" });
        assert.ok(!route.request().url().includes("593821"));
        await route.fulfill({ json: { ok: true, state: "found", code: "593821", receivedAt: new Date().toISOString() }, headers: { "cache-control": "private, no-store" } });
      });
      const get = page.getByRole("button", { name: labels.get, exact: true }); await get.focus(); await page.keyboard.press("Enter");
      await page.locator("output").waitFor(); assert.equal(await page.locator("output").textContent(), "593821");
      assert.equal(await page.locator("p[role=\"status\"]").getAttribute("aria-live"), "polite");
      await page.getByRole("button", { name: labels.copy, exact: true }).click();
      assert.equal(await page.evaluate(() => window.copiedSynthetic), "593821");
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
      await page.locator("output").waitFor({ state: "detached" }); assert.equal(count, 1);
    } finally { await context.close(); }
  }, { timeout: 20000 });
  test(`${engine}: one polling loop stops by 120 seconds, even with RPC in flight`, async () => {
    const { page, context, labels } = await pageFor(engine);
    try {
      await page.clock.install(); let requests = 0;
      await page.route("**/api/shop/me/orders/order-a/otp", async route => { requests += 1; await route.fulfill({ json: { ok: true, state: "pending", pollAfterMs: 5000 } }); });
      await page.getByRole("button", { name: labels.get, exact: true }).click();
      await page.locator("p[role=\"status\"]").filter({ hasText: labels.pending }).waitFor();
      await page.clock.runFor(5000); await page.locator("p[role=\"status\"]").filter({ hasText: labels.pending }).waitFor(); assert.equal(requests, 2);
      await page.clock.fastForward(120000); await page.locator("p[role=\"status\"]").filter({ hasText: labels.timedOut }).waitFor();
      const stopped = requests; await page.clock.runFor(10000); assert.equal(requests, stopped);
    } finally { await context.close(); }
  }, { timeout: 20000 });
  test(`${engine}: reauth, revoke, errors and cross-tab logout clear code safely`, async () => {
    const { page, context, labels } = await pageFor(engine);
    try {
      let response = { ok: false, code: "reauth_required" }, status = 403;
      await page.route("**/api/shop/me/orders/order-a/otp", route => route.fulfill({ status, json: response }));
      await page.route("**/api/shop/auth/reauth", route => { assert.deepEqual(route.request().postDataJSON(), { orderId: "order-a", allocationId: "allocation-a", locale: "en", provider: "email" }); return route.fulfill({ json: { ok: true, state: "email_sent" } }); });
      await page.getByRole("button", { name: labels.get, exact: true }).click(); await page.getByRole("button", { name: labels.reauthEmail }).click();
      await page.getByText(labels.emailSent).waitFor();
      await page.reload(); response = { ok: true, state: "found", code: "593821", receivedAt: new Date().toISOString() }; status = 200;
      await page.getByRole("button", { name: labels.get, exact: true }).click(); await page.locator("output").waitFor();
      const sibling = await context.newPage(); await sibling.goto(origin);
      await sibling.evaluate(() => { const channel = new BroadcastChannel("shop-session-events"); channel.postMessage("logout"); channel.close(); });
      await page.locator("output").waitFor({ state: "detached" }); await page.getByRole("button", { name: labels.reauthEmail }).waitFor();
      await page.goto(`${origin}/?state=revoked`); assert.equal(await page.getByRole("button", { name: labels.get, exact: true }).isDisabled(), true);
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide"))); assert.equal(await page.getByRole("button", { name: labels.get, exact: true }).isDisabled(), true);
      for (const [code, state] of [["otp_ambiguous", "ambiguous"], ["otp_untrusted", "untrusted"], ["otp_rate_limited", "rate_limited"], ["otp_service_unavailable", "unavailable"]]) {
        await page.goto(origin); response = { ok: false, code }; status = code === "otp_rate_limited" ? 429 : 409;
        await page.getByRole("button", { name: labels.get, exact: true }).click(); await page.locator("p[role=\"status\"]").filter({ hasText: labels[state] }).waitFor();
        assert.equal(await page.locator("output").count(), 0);
      }
    } finally { await context.close(); }
  }, { timeout: 30000 });
}
