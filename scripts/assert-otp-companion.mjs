import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const receipt = JSON.parse(readFileSync(resolve(root, "docs/otp-bridge/mailvault-companion.json"), "utf8"));
const workflow = readFileSync(resolve(root, ".github/workflows/otp-bridge.yml"), "utf8");
const repository = workflow.match(/^\s+repository: (\S+)$/m)?.[1];
const ref = workflow.match(/^\s+ref: ([a-f0-9]{40})$/m)?.[1];
if (receipt.repositoryId !== 1409350639 || receipt.repository !== "takovn2/mailvault" ||
    repository !== receipt.repository || ref !== receipt.headSha) throw new Error("OTP companion workflow/receipt mismatch");
if (!process.env.MAILVAULT_REPO_PATH) throw new Error("MAILVAULT_REPO_PATH is required for exact-SHA evidence");
const companion = resolve(process.env.MAILVAULT_REPO_PATH);
const actual = execFileSync("git", ["-C", companion, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["-C", companion, "status", "--porcelain"], { encoding: "utf8" }).trim();
if (actual !== receipt.headSha || dirty) throw new Error("OTP companion must be clean at the exact recorded SHA");
console.log(`OTP companion ${receipt.repository} verified at ${actual}`);
