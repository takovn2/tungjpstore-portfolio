/**
 * Shared inlining utilities for shop smoke tests.
 *
 * The smoke harness executes shop TS sources by transpiling them and importing
 * via data: URLs. Relative *dynamic* imports (`await import("./platform/...")`)
 * cannot resolve from a data: URL, so this helper prelinks every known shop
 * platform module into its own stable data: URL and rewrites the dynamic
 * specifiers found in the inlined sources.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export const readShopSource = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

export const compileShopSource = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

export const shopDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

export const importShopSource = (source) => import(shopDataUrl(source));

const stripStaticImports = (source) => source.replace(/^import[\s\S]*?;\s*/gm, "");

// ── Prelinked platform modules (dependency-ordered) ──────────────────────────
const attributionUrl = shopDataUrl(
  stripStaticImports(compileShopSource(readShopSource("src/lib/shop/platform/attribution.ts"))),
);

// platform/service.ts statically imports recommendProducts (value) and
// dynamically imports ./attribution.ts — inline the former, rebind the latter.
const platformServiceUrl = shopDataUrl(
  stripStaticImports(compileShopSource(readShopSource("src/lib/shop/platform/service.ts")))
    .replace(/import\("\.\/attribution\.ts"\)/g, `import(${JSON.stringify(attributionUrl)})`)
  + "\n" + stripStaticImports(compileShopSource(readShopSource("src/lib/shop/platform/recommend.ts"))),
);

/**
 * Rewrite the dynamic relative imports used by shop repository/service sources
 * so they resolve after the source has been inlined into a data: module.
 */
export const rewriteShopDynamicImports = (source) => source
  .replace(/import\("\.\/platform\/attribution"\)/g, `import(${JSON.stringify(attributionUrl)})`)
  .replace(/import\("\.\/platform\/service"\)/g, `import(${JSON.stringify(platformServiceUrl)})`);

/**
 * Self-contained data: URL for telegram-commerce's pure menu/copy layer.
 * Heavy repository/validation value imports are stubbed — menuKeyboard and
 * commerceCopy never touch them at module-eval or menu-render time.
 */
export const commerceMenuModule = shopDataUrl(
  stripStaticImports(compileShopSource(readShopSource("src/lib/shop/telegram-commerce.ts")))
  + "\nconst { maskShopEmail, normalizeShopEmail } = { maskShopEmail: (v) => String(v ?? \"\"), normalizeShopEmail: (v) => String(v ?? \"\") };"
  + "\nconst { consumeCheckoutRateLimit, getPublicVariantStock, previewCheckoutQuote } = { consumeCheckoutRateLimit: async () => { throw new Error(\"commerce stub\"); }, getPublicVariantStock: async () => { throw new Error(\"commerce stub\"); }, previewCheckoutQuote: async () => { throw new Error(\"commerce stub\"); } };\n",
);
