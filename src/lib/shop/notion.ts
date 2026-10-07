/**
 * Notion Plus is an editorial surface only. This adapter deliberately exposes
 * preview records and never mutates shop_products, prices, inventory or orders.
 */
export const NOTION_COLLECTIONS = {
  productPlanning: "6f4f3b83-4fed-436c-ba4a-b6066d51a7da",
  editorialSeo: "70d27093-15e5-49b4-a544-a7b18f50f06b",
  releases: "d68d37cb-6860-4bf0-96be-78dfb19e876d",
  runbooks: "b08ddcbf-3dbf-4d8b-8e8c-80e9ca0e4141",
} as const;

const DEFAULT_NOTION_VERSION = "2025-09-03";
const MAX_RESPONSE_BYTES = 512_000;

export type NotionIntegrationConfig = {
  token?: string;
  productPlanningDatabaseId?: string;
  editorialDatabaseId?: string;
  notionVersion?: string;
};

export type NotionEditorialRecord = {
  pageId: string;
  lastEditedTime: string | null;
  title: string;
  canonicalSlug: string;
  contentType: string;
  locale: string;
  seoTitle: string;
  metaDescription: string;
  cta: string;
  relatedProductRef: string;
  status: string;
};

export type NotionProductPlanningRecord = {
  pageId: string;
  lastEditedTime: string | null;
  product: string;
  productRef: string;
  category: string;
  lifecycle: string;
  locales: string;
  fulfillmentPolicy: string;
  publicUrl: string;
};

export class NotionIntegrationError extends Error {
  constructor(public readonly code: "notion_not_configured" | "notion_request_failed" | "notion_response_invalid", message: string = code) {
    super(message);
    this.name = "NotionIntegrationError";
  }
}

function configuredToken(config: NotionIntegrationConfig) {
  const token = config.token?.trim() ?? "";
  return token.length >= 20 ? token : null;
}

export function notionStatus(config: NotionIntegrationConfig) {
  const token = configuredToken(config);
  const productPlanningDatabaseId = config.productPlanningDatabaseId?.trim() || NOTION_COLLECTIONS.productPlanning;
  const editorialDatabaseId = config.editorialDatabaseId?.trim() || NOTION_COLLECTIONS.editorialSeo;
  return {
    configured: Boolean(token),
    tokenConfigured: Boolean(token),
    productPlanningDatabaseId,
    editorialDatabaseId,
    notionVersion: config.notionVersion?.trim() || DEFAULT_NOTION_VERSION,
    sourceOfTruth: "CONTENT_DB",
    mode: "editorial_preview",
  } as const;
}

async function readBoundedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel("notion_response_too_large").catch(() => undefined);
        throw new NotionIntegrationError("notion_response_invalid");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function queryCollection(token: string, collectionId: string, notionVersion: string) {
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "notion-version": notionVersion,
  };
  const body = JSON.stringify({ page_size: 100 });
  const dataSourceUrl = `https://api.notion.com/v1/data_sources/${encodeURIComponent(collectionId)}/query`;
  let response = await fetch(dataSourceUrl, { method: "POST", headers, body, signal: AbortSignal.timeout(8_000) });
  // Older workspaces expose the same collection through the databases API.
  if (response.status === 404 || response.status === 405) {
    await response.body?.cancel().catch(() => undefined);
    response = await fetch(`https://api.notion.com/v1/databases/${encodeURIComponent(collectionId)}/query`, {
      method: "POST",
      headers: { ...headers, "notion-version": "2022-06-28" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
  }
  const raw = await readBoundedText(response).catch((error) => {
    if (error instanceof NotionIntegrationError) throw error;
    throw new NotionIntegrationError("notion_response_invalid");
  });
  if (!response.ok) throw new NotionIntegrationError("notion_request_failed", `notion_http_${response.status}`);
  try {
    const parsed = JSON.parse(raw) as { results?: unknown };
    if (!Array.isArray(parsed.results)) throw new Error("results_missing");
    return parsed.results.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  } catch {
    throw new NotionIntegrationError("notion_response_invalid");
  }
}

function plainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const row = item as Record<string, unknown>;
    if (typeof row.plain_text === "string") return row.plain_text;
    const text = row.text;
    return text && typeof text === "object" && typeof (text as Record<string, unknown>).content === "string"
      ? (text as Record<string, unknown>).content as string
      : "";
  }).join("").trim();
}

function propertyValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const property = value as Record<string, unknown>;
  switch (property.type) {
    case "title":
    case "rich_text": return plainText(property[property.type]);
    case "select": {
      const select = property.select;
      return select && typeof select === "object" && typeof (select as Record<string, unknown>).name === "string" ? (select as Record<string, unknown>).name as string : "";
    }
    case "status": {
      const status = property.status;
      return status && typeof status === "object" && typeof (status as Record<string, unknown>).name === "string" ? (status as Record<string, unknown>).name as string : "";
    }
    case "multi_select": {
      const values = property.multi_select;
      return Array.isArray(values) ? values.map((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string" ? (item as Record<string, unknown>).name as string : "").filter(Boolean).join(", ") : "";
    }
    case "url": return typeof property.url === "string" ? property.url : "";
    case "number": return typeof property.number === "number" ? String(property.number) : "";
    case "checkbox": return property.checkbox === true ? "true" : property.checkbox === false ? "false" : "";
    case "date": {
      const date = property.date;
      return date && typeof date === "object" && typeof (date as Record<string, unknown>).start === "string" ? (date as Record<string, unknown>).start as string : "";
    }
    default: return "";
  }
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findProperty(properties: Record<string, unknown>, ...aliases: string[]) {
  const wanted = new Set(aliases.map(normalizedKey));
  const entry = Object.entries(properties).find(([key]) => wanted.has(normalizedKey(key)));
  return entry ? propertyValue(entry[1]) : "";
}

function editorialRecord(page: Record<string, unknown>): NotionEditorialRecord {
  const properties = page.properties && typeof page.properties === "object" && !Array.isArray(page.properties)
    ? page.properties as Record<string, unknown>
    : {};
  return {
    pageId: typeof page.id === "string" ? page.id : "",
    lastEditedTime: typeof page.last_edited_time === "string" ? page.last_edited_time : null,
    title: findProperty(properties, "Title", "Product"),
    canonicalSlug: findProperty(properties, "Canonical Slug", "Slug"),
    contentType: findProperty(properties, "Content Type", "Type"),
    locale: findProperty(properties, "Locale", "Language"),
    seoTitle: findProperty(properties, "SEO Title", "SeoTitle"),
    metaDescription: findProperty(properties, "Meta Description", "SEO Description", "SeoDescription"),
    cta: findProperty(properties, "CTA", "Call To Action"),
    relatedProductRef: findProperty(properties, "Related Product Ref", "Product Ref"),
    status: findProperty(properties, "Status", "Publishing Status"),
  };
}

function productPlanningRecord(page: Record<string, unknown>): NotionProductPlanningRecord {
  const properties = page.properties && typeof page.properties === "object" && !Array.isArray(page.properties)
    ? page.properties as Record<string, unknown>
    : {};
  return {
    pageId: typeof page.id === "string" ? page.id : "",
    lastEditedTime: typeof page.last_edited_time === "string" ? page.last_edited_time : null,
    product: findProperty(properties, "Product", "Name", "Title"),
    productRef: findProperty(properties, "Product Ref", "ProductRef"),
    category: findProperty(properties, "Category"),
    lifecycle: findProperty(properties, "Lifecycle", "Status"),
    locales: findProperty(properties, "Locales", "Locale", "Languages"),
    fulfillmentPolicy: findProperty(properties, "Fulfillment Policy", "FulfillmentPolicy"),
    publicUrl: findProperty(properties, "Public URL", "PublicUrl", "URL"),
  };
}

export async function previewNotionEditorialSync(config: NotionIntegrationConfig) {
  const token = configuredToken(config);
  if (!token) throw new NotionIntegrationError("notion_not_configured");
  const status = notionStatus(config);
  const [editorialPages, planningPages] = await Promise.all([
    queryCollection(token, status.editorialDatabaseId, status.notionVersion),
    queryCollection(token, status.productPlanningDatabaseId, status.notionVersion),
  ]);
  const records = editorialPages.map(editorialRecord).filter((record) => record.pageId);
  const productPlanning = planningPages.map(productPlanningRecord).filter((record) => record.pageId);
  return {
    ...status,
    fetched: records.length,
    records: records.slice(0, 100),
    fetchedProductPlanning: productPlanning.length,
    productPlanning: productPlanning.slice(0, 100),
    applied: 0,
    writeMode: "preview_only",
    note: "D1 remains the source of truth; review and apply through /admin before changing storefront content.",
  } as const;
}
