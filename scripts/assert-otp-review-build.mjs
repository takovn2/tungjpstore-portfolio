import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
assert.equal(config.vars.SHOP_OTP_ENABLED, "false");
assert.deepEqual(config.services.find(binding => binding.binding === "MAILVAULT_OTP"), {
  binding: "MAILVAULT_OTP", service: "mail-vault", entrypoint: "CustomerOtpReader",
});
console.log("OTP build binding and OFF default verified");
