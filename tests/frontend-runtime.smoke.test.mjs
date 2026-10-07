import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("the inline contact script is valid browser JavaScript and registers submit", () => {
  const source = readFileSync(`${projectRoot}/src/components/pages/ContactPage.astro`, "utf8");
  const inlineScript = source.match(/<script is:inline define:vars=\{\{ copy: c, locale \}\}>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript, "contact inline script was not found");

  let registeredEvent;
  const form = {
    addEventListener(eventName) {
      registeredEvent = eventName;
    },
  };
  const status = {};
  const document = {
    querySelector(selector) {
      return selector === "[data-contact-form]" ? form : status;
    },
  };

  const execute = new Function("copy", "locale", "document", "FormData", "fetch", inlineScript);
  execute({}, "vi", document, class FormData {}, async () => new Response());

  assert.equal(registeredEvent, "submit");
});

test("contact submission reads and resets the same Turnstile widget", async () => {
  const source = readFileSync(`${projectRoot}/src/components/pages/ContactPage.astro`, "utf8");
  const inlineScript = source.match(/<script is:inline define:vars=\{\{ copy: c, locale \}\}>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript, "contact inline script was not found");

  const widget = {};
  const listeners = {};
  let formWasReset = false;
  const form = {
    setAttribute() {},
    querySelector(selector) {
      return selector === ".cf-turnstile" ? widget : null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(eventName, listener) {
      listeners[eventName] = listener;
    },
    reset() {
      formWasReset = true;
    },
  };
  const status = { textContent: "", dataset: {} };
  const submitButton = { disabled: false };
  const document = {
    querySelector(selector) {
      if (selector === "[data-contact-form]") return form;
      if (selector === "[data-form-status]") return status;
      if (selector === "[data-submit-button]") return submitButton;
      return null;
    },
  };
  const values = new Map([
    ["name", "Tung Nguyen"],
    ["email", "tung@example.com"],
    ["company", "Tung Labs"],
    ["website", "https://tung.codes"],
    ["building", "A multilingual portfolio"],
    ["message", "A sufficiently detailed project message."],
    ["website_confirm", ""],
    ["cf-turnstile-response", ""],
  ]);
  class FakeFormData {
    get(name) {
      return values.get(name) ?? null;
    }
  }

  let resetTarget;
  let sentPayload;
  const window = {
    turnstile: {
      getResponse(target) {
        assert.equal(target, widget);
        return "fallback-turnstile-token";
      },
      reset(target) {
        resetTarget = target;
      },
    },
  };
  const fetch = async (_url, options) => {
    sentPayload = JSON.parse(options.body);
    return Response.json({ ok: true });
  };
  const copy = {
    validation: {},
    sending: "Sending",
    success: "Received",
    error: "Error",
    fallback: "Try email",
  };

  const execute = new Function("copy", "locale", "document", "FormData", "fetch", "window", inlineScript);
  execute(copy, "vi", document, FakeFormData, fetch, window);
  await listeners.submit({ preventDefault() {} });

  assert.equal(sentPayload.turnstileToken, "fallback-turnstile-token");
  assert.equal(resetTarget, widget);
  assert.equal(formWasReset, true);
  assert.equal(status.dataset.state, "success");
  assert.equal(submitButton.disabled, false);
});

test("localized mobile and form accessibility invariants stay in the source", () => {
  const header = readFileSync(`${projectRoot}/src/components/Header.astro`, "utf8");
  assert.match(header, /grid-template-columns: minmax\(0, 1fr\) auto auto/);
  assert.match(header, /overflow-y: auto/);
  assert.match(header, /target\.search = window\.location\.search/);

  const contact = readFileSync(`${projectRoot}/src/components/pages/ContactPage.astro`, "utf8");
  assert.match(contact, /const directEmailHref = `mailto:\$\{encodeURIComponent\(directEmail\)\}`/);
  assert.doesNotMatch(contact, /aria-describedby="contact-form-status"/);
  assert.match(contact, /aria-errormessage/);
  assert.match(contact, /class="cf-turnstile"/);
  assert.match(contact, /TURNSTILE_SITE_KEY/);
  assert.match(contact, /data\.get\("cf-turnstile-response"\)/);
  assert.match(contact, /const turnstileWidget = form\?\.querySelector\?\.\("\.cf-turnstile"\)/);
  assert.match(contact, /getResponse\?\.\(turnstileWidget\)/);
  assert.match(contact, /reset\?\.\(turnstileWidget\)/);
  assert.match(contact, /turnstileToken/);
  assert.match(contact, /data-refresh-expired="auto"/);
  assert.match(contact, /resetTurnstile/);

  const visual = readFileSync(`${projectRoot}/src/components/SystemVisual.astro`, "utf8");
  assert.match(visual, /role="img"/);

  for (const file of [
    "src/components/pages/HomePage.astro",
    "src/components/pages/AboutPage.astro",
    "src/components/pages/CaseStudyPage.astro",
  ]) {
    assert.match(readFileSync(`${projectRoot}/${file}`, "utf8"), /role="list"/);
  }
});
