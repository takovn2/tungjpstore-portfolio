import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadTelegramCommerce() {
  const types = compile(read("src/lib/shop/types.ts"));
  const commerce = compile(read("src/lib/shop/telegram-commerce.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`${types}\n${commerce}`);
}

async function loadTelegram() {
  const types = compile(read("src/lib/shop/types.ts"));
  const crypto = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const telegram = compile(read("src/lib/shop/telegram.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const commerce = await loadTelegramCommerce();
  const menuKeyboardCode = commerce.menuKeyboard.toString();
  return importSource(`${types}\n${crypto}\nconst menuKeyboard = ${menuKeyboardCode};\n${telegram}`);
}

test("AvengerGPT start menu layout and welcome text", async () => {
  const telegram = await loadTelegram();

  // Test native start reply
  const start = telegram.buildTelegramStartReply(undefined, "vi", "AvengerGPT", false);
  assert.match(start.text, /Chào mừng bạn đến với\s+\*AvengerGPT\*\s+!\s+👑/);
  assert.match(start.text, /Vui lòng chọn dịch vụ từ menu bên dưới để tiếp tục\./);

  const inlineKeyboard = start.replyMarkup?.inline_keyboard;
  assert.ok(inlineKeyboard);
  assert.equal(inlineKeyboard.length, 3);
  // Row 1: Cửa hàng
  assert.equal(inlineKeyboard[0][0].text, "💎 Cửa Hàng");
  assert.equal(inlineKeyboard[0][0].callback_data, "cat:0");
  // Row 2: Ví & Đơn Hàng
  assert.equal(inlineKeyboard[1][0].text, "👑 Ví & Trang Cá Nhân");
  assert.equal(inlineKeyboard[1][0].callback_data, "wallet");
  assert.equal(inlineKeyboard[1][1].text, "🛒 Đơn Hàng Của Tôi");
  assert.equal(inlineKeyboard[1][1].callback_data, "my");
  // Row 3: Đổi Ngôn Ngữ & Hỗ Trợ
  assert.equal(inlineKeyboard[2][0].text, "🌐 Đổi Ngôn Ngữ");
  assert.equal(inlineKeyboard[2][0].callback_data, "lang");
  assert.equal(inlineKeyboard[2][1].text, "📇 Hỗ Trợ");
  assert.equal(inlineKeyboard[2][1].callback_data, "help");
});

test("Persistent bottom keyboard contains Menu, Mua nhanh, and Nap tien", async () => {
  const commerce = await loadTelegramCommerce();

  const keyboard = commerce.persistentBottomKeyboard("vi");
  assert.ok(keyboard.keyboard);
  assert.equal(keyboard.resize_keyboard, true);
  assert.equal(keyboard.is_persistent, true);

  const row = keyboard.keyboard[0];
  assert.equal(row[0].text, "🏠 Menu");
  assert.equal(row[1].text, "🛒 Mua nhanh");
  assert.equal(row[2].text, "💳 Nạp tiền");
});

test("Product icon mappings and title cleaning", async () => {
  const commerce = await loadTelegramCommerce();

  assert.equal(commerce.getTelegramProductIcon("Duolingo Super", "duolingo"), "🦉");
  assert.equal(commerce.getTelegramProductIcon("Turnitin Non-Repo", "turnitin"), "📑");
  assert.equal(commerce.getTelegramProductIcon("Elsa Speak Pro 1y", "elsa-speak"), "🗣️");
  assert.equal(commerce.getTelegramProductIcon("Hotmail TRUSTED aged", "hotmail"), "📧");
  assert.equal(commerce.getTelegramProductIcon("Google Gemini Pro", "gemini-pro"), "✨");
  assert.equal(commerce.getTelegramProductIcon("ChatGPT Plus 1 Tháng", "chatgpt-plus"), "🤖");

  assert.equal(commerce.cleanTelegramProductTitle("Duolingo Super trâu bảo hành"), "Duolingo Super");
  assert.equal(commerce.cleanTelegramProductTitle("Turnitin No Repository"), "Turnitin No-Repo");
  assert.equal(commerce.cleanTelegramProductTitle("Elsa Speak Pro 1 Năm"), "Elsa Speak Pro");
});
