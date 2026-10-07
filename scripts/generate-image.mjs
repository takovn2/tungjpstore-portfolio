#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const endpoint = process.env.ROUTER_IMAGE_ENDPOINT ?? "http://localhost:20128/v1/images/generations";
const apiKey = process.env.ROUTER_API_KEY;
const model = process.env.ROUTER_IMAGE_MODEL ?? "cx/gpt-5.5-image";
const prompt = process.argv.slice(2).join(" ").trim();
const output = process.env.ROUTER_IMAGE_OUTPUT ?? "public/generated/image.png";
const endpointUrl = new URL(endpoint);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

if (endpointUrl.protocol !== "https:" && !(endpointUrl.protocol === "http:" && loopbackHosts.has(endpointUrl.hostname))) {
  throw new Error("ROUTER_IMAGE_ENDPOINT must use HTTPS unless it points to the local 9Router service.");
}

if (!apiKey) {
  console.error("Missing ROUTER_API_KEY. Copy it from your local 9Router setup into your shell environment only.");
  process.exit(1);
}

if (!prompt) {
  console.error('Usage: ROUTER_API_KEY=... npm run image:generate -- "your prompt"');
  process.exit(1);
}

const response = await fetch(endpointUrl, {
  method: "POST",
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    prompt,
    n: 1,
    size: process.env.ROUTER_IMAGE_SIZE ?? "1792x1024",
    quality: process.env.ROUTER_IMAGE_QUALITY ?? "high",
    background: process.env.ROUTER_IMAGE_BACKGROUND ?? "opaque",
    image_detail: process.env.ROUTER_IMAGE_DETAIL ?? "high",
    output_format: process.env.ROUTER_IMAGE_FORMAT ?? "png",
  }),
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`9Router image request failed (${response.status}): ${detail.slice(0, 500)}`);
}

const payload = await response.json();
const image = payload?.data?.[0];
const base64 = image?.b64_json;

if (!base64) {
  throw new Error("9Router returned no base64 image data.");
}

const destination = resolve(output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, Buffer.from(base64, "base64"));
console.log(`Saved ${basename(destination)} to ${destination}`);
