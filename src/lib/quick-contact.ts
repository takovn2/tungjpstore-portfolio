import type { Locale } from "../i18n/dictionaries";

export type QuickContactChannelId = "messenger" | "zalo" | "telegram";

export type QuickContactChannel = {
  id: QuickContactChannelId;
  href: string;
  label: string;
};

export type QuickContactMenu = {
  buttonLabel: string;
  heading: string;
  closeLabel: string;
  channels: QuickContactChannel[];
};

type ConfigValue = string | number | boolean | string[] | null | undefined;

const channelIds: QuickContactChannelId[] = ["messenger", "zalo", "telegram"];
const localeSuffix: Record<Locale, string> = { vi: "Vi", en: "En", ja: "Ja", zh: "Zh" };

const channelHosts: Record<QuickContactChannelId, Set<string>> = {
  messenger: new Set(["m.me", "messenger.com", "www.messenger.com", "facebook.com", "www.facebook.com"]),
  zalo: new Set(["zalo.me", "www.zalo.me"]),
  telegram: new Set(["t.me", "telegram.me", "www.telegram.me"]),
};

const channelBaseUrl: Record<QuickContactChannelId, string> = {
  messenger: "https://m.me/",
  zalo: "https://zalo.me/",
  telegram: "https://t.me/",
};

const fallbackLabels: Record<Locale, Record<QuickContactChannelId, string>> = {
  vi: { messenger: "Nhắn qua Messenger", zalo: "Nhắn qua Zalo", telegram: "Nhắn qua Telegram" },
  en: { messenger: "Message on Messenger", zalo: "Message on Zalo", telegram: "Message on Telegram" },
  ja: { messenger: "Messengerで連絡", zalo: "Zaloで連絡", telegram: "Telegramで連絡" },
  zh: { messenger: "通过 Messenger 联系", zalo: "通过 Zalo 联系", telegram: "通过 Telegram 联系" },
};

const menuCopy: Record<Locale, { buttonLabel: string; heading: string; closeLabel: string }> = {
  vi: { buttonLabel: "Mở liên hệ nhanh", heading: "Liên hệ nhanh", closeLabel: "Đóng liên hệ nhanh" },
  en: { buttonLabel: "Open quick contact", heading: "Quick contact", closeLabel: "Close quick contact" },
  ja: { buttonLabel: "クイック連絡を開く", heading: "クイック連絡", closeLabel: "クイック連絡を閉じる" },
  zh: { buttonLabel: "打开快速联系", heading: "快速联系", closeLabel: "关闭快速联系" },
};

const textValue = (value: ConfigValue, maxLength = 120) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength && !/[<>]/.test(value)
    ? value.trim()
    : null;

const configString = (config: Record<string, ConfigValue>, key: string) => textValue(config[key]);

const safeChannelIdentifier = (value: string) => {
  const identifier = value.trim().replace(/^@/, "");
  return /^[A-Za-z0-9._-]{1,100}$/.test(identifier) ? identifier : null;
};

/** Accept a channel URL or a username/ID and always return a channel-owned HTTPS URL. */
export function safeQuickContactUrl(channel: QuickContactChannelId, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 1_000 || /[\u0000-\u001f\u007f\\]/.test(trimmed)) return null;
  if (!/^https:\/\//i.test(trimmed)) {
    const identifier = safeChannelIdentifier(trimmed);
    return identifier ? `${channelBaseUrl[channel]}${encodeURIComponent(identifier)}` : null;
  }
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
    if (url.protocol !== "https:" || !channelHosts[channel].has(hostname) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const channelLabel = (config: Record<string, ConfigValue>, channel: QuickContactChannelId, locale: Locale) => {
  const key = `quickContact${channel[0].toUpperCase()}${channel.slice(1)}Label${localeSuffix[locale]}`;
  return configString(config, key) || fallbackLabels[locale][channel];
};

const channelEnabled = (config: Record<string, ConfigValue>, channel: QuickContactChannelId) => {
  const key = `quickContact${channel[0].toUpperCase()}${channel.slice(1)}Enabled`;
  return config[key] !== false;
};

/** Projects flat site_state values into the small, locale-aware public menu. */
export function getQuickContactMenu(config: Record<string, ConfigValue> | null | undefined, locale: Locale): QuickContactMenu | null {
  const source = config ?? {};
  if (source.quickContactEnabled === false) return null;

  const channels = channelIds.flatMap((id) => {
    const key = `quickContact${id[0].toUpperCase()}${id.slice(1)}Url`;
    const identifierKey = `quickContact${id[0].toUpperCase()}${id.slice(1)}Id`;
    const href = safeQuickContactUrl(id, source[key] ?? source[identifierKey]);
    return href && channelEnabled(source, id) ? [{ id, href, label: channelLabel(source, id, locale) }] : [];
  });
  if (channels.length === 0) return null;

  const copy = menuCopy[locale];
  const title = configString(source, `quickContactTitle${localeSuffix[locale]}`) || copy.heading;
  return { buttonLabel: copy.buttonLabel, heading: title, closeLabel: copy.closeLabel, channels };
}
