import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("transfer content is provider_description only — never TUNG order_reference", () => {
  const payos = read("src/lib/shop/payos.ts");
  const service = read("src/lib/shop/service.ts");
  const orderPage = read("src/components/pages/OrderPage.astro");
  const types = read("src/lib/shop/types.ts");

  assert.match(payos, /PAYOS_TRANSFER_DESCRIPTION_MAX\s*=\s*9/);
  assert.match(payos, /normalizePayOsTransferDescription/);
  assert.match(payos, /payOsTransferDescriptionMatches/);
  assert.match(payos, /addInfo/);
  assert.match(service, /Never reuse shop order_reference/);
  assert.match(service, /paymentDescription/);
  assert.match(types, /paymentDescription: string \| null/);
  // Order UI must copy payment description, not TUNG order reference.
  assert.match(orderPage, /data-payment-description/);
  assert.match(orderPage, /data-copy-payment-description/);
  assert.match(orderPage, /paymentDescription/);
  assert.match(orderPage, /order\.qrUrl/);
  assert.match(orderPage, /qrImage\.onerror/);
  assert.match(orderPage, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(orderPage, /order\.qrUrl && order\.state === "awaiting_payment"/);
  assert.doesNotMatch(orderPage, /data-copy-order-reference/);
  assert.doesNotMatch(service, /buildVietQrImageUrl\(\{[^}]*order_reference/s);
  assert.doesNotMatch(service, /accountNumber:\s*account,[\s\S]{0,180}provider_description/);
  assert.doesNotMatch(service, /input\.payment\.accountNumber !== input\.account/);
  assert.match(service, /getPayOsCheckoutQr/);
  assert.match(service, /resolveCustomerQrImageUrl/);
  assert.match(payos, /buildEmvCoQrImageUrl/);
  // Recovery must not wipe a QR that already resolved when HTML scrape fails.
  assert.match(service, /previousQr/);
  assert.doesNotMatch(service, /input\.payment\.bin !== input\.bankId/);
});
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadShopValidation() {
  const types = compile(read("src/lib/shop/types.ts"));
  const validation = compile(read("src/lib/shop/validation.ts")).replace(
    /import\s+\{[\s\S]*?\}\s+from\s+["']\.\/types["'];?/m,
    "",
  );
  return importSource(`${types}\n${validation}`);
}

async function loadCheckoutReadiness() {
  const service = read("src/lib/shop/service.ts");
  const start = service.indexOf("type VietQrProviderRow");
  const end = service.indexOf("export async function previewInventoryImport", start);
  assert.ok(start >= 0 && end > start, "checkout readiness boundary changed");
  // readiness checks order-token secret shape; ship a minimal base64url length probe.
  const secretCheckShim = `
const SECRET_BYTES = 32;
function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function isShopOrderTokenSecretConfigured(secret) {
  if (!secret?.trim()) return false;
  try { return fromBase64Url(secret.trim()).byteLength === SECRET_BYTES; }
  catch { return false; }
}
`;
  return importSource(compile(`${secretCheckShim}\n${service.slice(start, end)}`));
}

async function loadPublicWebhookRoute() {
  const route = compile(read("src/pages/api/shop/payment-webhooks/[provider].ts"))
    .replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`const env = {};\n${route}`);
}

function createProviderD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE shop_payment_provider_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    account_ref TEXT NOT NULL,
    account_name_display TEXT NOT NULL DEFAULT '',
    qr_template TEXT NOT NULL,
    confirmation_adapter TEXT NOT NULL,
    secret_ref TEXT,
    updated_at TEXT NOT NULL
  )`);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { return statement.get(...bindings) ?? null; },
      };
      return prepared;
    },
  };
  return { db, sqlite };
}

function insertProvider(sqlite, confirmationAdapter, secretRef) {
  sqlite.prepare(`INSERT INTO shop_payment_provider_configs
    (id, provider, status, bank_id, account_ref, account_name_display, qr_template,
     confirmation_adapter, secret_ref, updated_at)
    VALUES (?, 'vietqr', 'active', '970436', 'VIETQR_BANK_ACCOUNT', 'TUNG', 'compact2', ?, ?, ?)`)
    .run(`provider-${confirmationAdapter}`, confirmationAdapter, secretRef, "2026-07-24T00:00:00.000Z");
}

function textFilesUnder(relativeRoot) {
  const absoluteRoot = `${projectRoot}/${relativeRoot}`;
  if (!existsSync(absoluteRoot)) return [];
  const textExtensions = new Set([
    ".astro", ".css", ".html", ".js", ".json", ".jsonc", ".md", ".mjs", ".svg", ".ts", ".txt", ".webmanifest", ".xml",
  ]);
  const result = [];
  const visit = (absolutePath) => {
    for (const entry of readdirSync(absolutePath)) {
      const child = `${absolutePath}/${entry}`;
      if (statSync(child).isDirectory()) visit(child);
      else if (textExtensions.has(entry.slice(entry.lastIndexOf(".")))) result.push(child);
    }
  };
  visit(absoluteRoot);
  return result;
}

test("runtime and public artifacts expose no SePay integration", () => {
  const forbidden = new RegExp(`\\b${["se", "pay"].join("")}\\b`, "i");
  for (const root of ["src", "public", "dist/client", "dist/server"]) {
    for (const file of textFilesUnder(root)) {
      const relativePath = file.slice(projectRoot.length + 1);
      assert.doesNotMatch(relativePath, forbidden, `${relativePath} path exposes the retired provider`);
      assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, `${relativePath} exposes the retired provider`);
    }
  }
  assert.doesNotMatch(read("docs/shop-integrations.md"), /SEPAY_|payment-webhooks\/sepay|provider\s*[=:]\s*["'`]?sepay/i);
});

test("payment provider validation accepts only the fixed payOS configuration", async () => {
  const validation = await loadShopValidation();
  const valid = {
    displayName: "TUNG VietQR via payOS",
    status: "active",
    provider: "vietqr",
    bankId: "970436",
    accountRef: "VIETQR_BANK_ACCOUNT",
    accountNameDisplay: "TUNG",
    qrTemplate: "compact2",
    confirmationAdapter: "payos",
    secretRef: "PAYOS_CHECKSUM_KEY",
    publicConfig: {},
  };
  assert.equal(validation.validatePaymentProviderConfigInput(valid).ok, true);

  for (const confirmationAdapter of ["generic_signed", "casso", "manual"]) {
    const result = validation.validatePaymentProviderConfigInput({ ...valid, confirmationAdapter });
    assert.equal(result.ok, false, `${confirmationAdapter} must not become an active provider`);
    assert.deepEqual(result.issues.find((issue) => issue.path === "confirmationAdapter"), {
      path: "confirmationAdapter",
      code: "payos_required",
    });
  }

  for (const secretRef of [undefined, "GENERIC_PAYMENT_WEBHOOK_SECRET", "CASSO_WEBHOOK_SECRET"]) {
    const result = validation.validatePaymentProviderConfigInput({ ...valid, secretRef });
    assert.equal(result.ok, false, `${String(secretRef)} must not configure payOS`);
    assert.deepEqual(result.issues.find((issue) => issue.path === "secretRef"), {
      path: "secretRef",
      code: "payos_checksum_key_required",
    });
  }
});

test("checkout readiness ignores every active legacy adapter and wrong secret reference", async () => {
  const { getShopCheckoutReadiness } = await loadCheckoutReadiness();
  // 32 zero bytes, base64url — matches SHOP_ORDER_TOKEN_SECRET format.
  const orderTokenSecret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const commonBindings = {
    VIETQR_BANK_ACCOUNT: "0123456789",
    PAYOS_CLIENT_ID: "payos-client-id-long-enough",
    PAYOS_API_KEY: "payos-api-key-long-enough",
    PAYOS_CHECKSUM_KEY: "payos-checksum-key-at-least-32-bytes-long",
    SHOP_PUBLIC_ORIGIN: "https://tung.codes/",
    SHOP_ORDER_TOKEN_SECRET: orderTokenSecret,
  };

  for (const [adapter, secretRef] of [
    ["generic_signed", "GENERIC_PAYMENT_WEBHOOK_SECRET"],
    ["casso", "CASSO_WEBHOOK_SECRET"],
    ["manual", null],
    ["payos", "GENERIC_PAYMENT_WEBHOOK_SECRET"],
  ]) {
    const { db, sqlite } = createProviderD1();
    try {
      insertProvider(sqlite, adapter, secretRef);
      assert.deepEqual(await getShopCheckoutReadiness({ ...commonBindings, CONTENT_DB: db }), {
        ready: false,
        code: "vietqr_config_not_found",
      });
    } finally {
      sqlite.close();
    }
  }

  const { db, sqlite } = createProviderD1();
  try {
    insertProvider(sqlite, "payos", "PAYOS_CHECKSUM_KEY");
    assert.deepEqual(await getShopCheckoutReadiness({ ...commonBindings, CONTENT_DB: db }), { ready: true });
    assert.deepEqual(await getShopCheckoutReadiness({ ...commonBindings, CONTENT_DB: db, SHOP_ORDER_TOKEN_SECRET: undefined }), {
      ready: false,
      code: "shop_order_token_not_configured",
    });
    assert.deepEqual(await getShopCheckoutReadiness({ ...commonBindings, CONTENT_DB: db, SHOP_ORDER_TOKEN_SECRET: "too-short" }), {
      ready: false,
      code: "shop_order_token_not_configured",
    });
  } finally {
    sqlite.close();
  }
});

test("public webhook rejects legacy providers before authentication or database access", async () => {
  const route = await loadPublicWebhookRoute();
  for (const provider of ["generic_signed", "casso", "manual", "unknown"]) {
    const response = await route.POST({
      params: { provider },
      request: new Request(`https://tung.codes/api/shop/payment-webhooks/${provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    });
    assert.equal(response.status, 404, `${provider} webhook must not be reachable`);
    assert.deepEqual(await response.json(), { ok: false, code: "provider_not_supported" });
  }

  const source = read("src/pages/api/shop/payment-webhooks/[provider].ts");
  assert.match(source, /provider\s*!==\s*["']payos["']/);
  assert.match(source, /authenticatePayOsPaymentWebhook\s*\(/);
  assert.match(source, /reconcilePaymentConfirmation\s*\(/);
  assert.doesNotMatch(source, /authenticateGenericPaymentWebhook|GENERIC_PAYMENT_WEBHOOK_SECRET|CASSO_WEBHOOK_SECRET/);
});

test("admin cannot create legacy providers or submit manual reconciliation", () => {
  const payments = read("src/lib/admin/router/shop/payments.ts");
  const shared = read("src/lib/admin/router/shop/shared.ts");
  const api = [payments, shared].join("\n");
  const workspace = read("src/components/admin/shop/SettingsTab.tsx") + read("src/components/admin/shop/PaymentsTab.tsx");

  assert.match(payments, /validatePaymentProviderConfigInput\s*\(/);
  assert.match(shared, /PAYOS_CHECKSUM_KEY/);
  assert.doesNotMatch(api, /segments\[2\]\s*===\s*["']attempts["']/);
  assert.doesNotMatch(api, /segments\[2\]\s*===\s*["']reconcile["']/);
  assert.doesNotMatch(api, /reconcilePaymentConfirmation\s*\(|validatePaymentConfirmation\s*\(|signatureVerified:\s*true/);

  assert.match(workspace, /PayOS/i);
  assert.match(workspace, /PAYOS_CHECKSUM_KEY/);
  assert.doesNotMatch(workspace, /name=["']confirmationAdapter["']|generic_signed|Casso|>Thủ công</i);
  assert.match(read("src/components/admin/shop/SettingsTab.tsx"), /confirmationAdapter: "payos"/);
  assert.match(read("src/components/admin/shop/SettingsTab.tsx"), /secretRef: "PAYOS_CHECKSUM_KEY"/);
  assert.doesNotMatch(workspace, /shopOpenReconcile|data-shop-action=["']reconcile-payments["']/);
});
