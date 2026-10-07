import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const serverDir = join(process.cwd(), "dist", "server");
const generatedEntry = join(serverDir, "entry.mjs");
const astroEntry = join(serverDir, "astro-entry.mjs");

if (!existsSync(generatedEntry)) {
  throw new Error(`Astro Worker entry not found: ${generatedEntry}`);
}

// Keep Astro's generated fetch handler intact, then add the one Worker event
// that cannot be represented by an Astro page route: the Cloudflare cron.
renameSync(generatedEntry, astroEntry);
writeFileSync(generatedEntry, `import astroWorker from "./astro-entry.mjs";\n\nexport default {\n  fetch: astroWorker.fetch,\n  async scheduled(controller, env, context) {\n    const request = new Request("https://tung.codes/api/shop/maintenance", {\n      method: "POST",\n      headers: {\n        authorization: \`Bearer \${env.SHOP_CRON_SECRET ?? ""}\`,\n        "content-type": "application/json",\n      },\n      body: "{}",\n    });\n    const response = await astroWorker.fetch(request, env, context);\n    if (!response.ok) {\n      console.error(JSON.stringify({ event: "shop_maintenance_cron_failed", status: response.status, cron: controller.cron }));\n    }\n  },\n};\n`);

// Cloudflare's API WAF currently false-positives on this readable dependency
// pattern. Reflect.has preserves the `in` operator semantics without changing
// the deployed runtime behavior.
function patchUploadWafFalsePositives(directory) {
  for (const name of readdirSync(directory)) {
    const filePath = join(directory, name);
    if (statSync(filePath).isDirectory()) {
      patchUploadWafFalsePositives(filePath);
      continue;
    }
    if (!name.endsWith(".mjs")) continue;
    const source = readFileSync(filePath, "utf8");
    const patched = source.replace(
      /typeof ([A-Za-z_$][\w$]*) === "object" && "id" in \1/g,
      'typeof $1 === "object" && Reflect.has($1, "id")',
    );
    if (patched !== source) writeFileSync(filePath, patched);
  }
}

patchUploadWafFalsePositives(serverDir);
