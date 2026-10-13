import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Isolate generation from developer .env/.dev.vars. Runtime secrets are declared
// as optional names in runtime-bindings.d.ts, never inferred from local secrets.
mkdirSync(".otp-typegen", { recursive: true });
writeFileSync(".otp-typegen/wrangler.jsonc", readFileSync("wrangler.jsonc"));
writeFileSync(".otp-typegen/empty.env", "");
const result = spawnSync("npx", ["wrangler", "types", "--config=.otp-typegen/wrangler.jsonc", "--env-file=.otp-typegen/empty.env",
  "--strict-vars=false", "src/worker-configuration.d.ts"], { stdio: "inherit", env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" } });
process.exit(result.status ?? 1);
