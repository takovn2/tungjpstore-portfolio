/**
 * Telegram Bot Broadcast Engine for promotional campaigns, flash sales, and announcements.
 * Includes rate-limiting controls to comply with Telegram API constraints (max 30 msgs/sec).
 */

export type BroadcastCampaign = {
  id: string;
  title: string;
  messageText: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  createdAt: string;
};

export type BroadcastDispatchStats = {
  campaignId: string;
  totalRecipients: number;
  delivered: number;
  failed: number;
  blockedUsers: number;
  durationMs: number;
};

/**
 * Validates broadcast campaign payload.
 */
export function validateBroadcastPayload(payload: {
  title?: string;
  messageText?: string;
  buttonText?: string;
  buttonUrl?: string;
}): { ok: boolean; issues?: string[] } {
  const issues: string[] = [];
  if (!payload.messageText || payload.messageText.trim().length === 0) {
    issues.push("messageText is required");
  } else if (payload.messageText.length > 4096) {
    issues.push("messageText exceeds Telegram limit of 4096 characters");
  }

  if (payload.buttonUrl && !/^https?:\/\//i.test(payload.buttonUrl.trim())) {
    issues.push("buttonUrl must be a valid HTTP/HTTPS URL");
  }

  return {
    ok: issues.length === 0,
    issues: issues.length > 0 ? issues : undefined,
  };
}

/**
 * Splits recipient list into manageable chunks for rate-limited dispatch.
 */
export function chunkRecipients<T>(recipients: T[], chunkSize = 25): T[][] {
  if (!recipients.length) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < recipients.length; i += chunkSize) {
    chunks.push(recipients.slice(i, i + chunkSize));
  }
  return chunks;
}
