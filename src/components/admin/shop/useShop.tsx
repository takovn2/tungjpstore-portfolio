import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { api, shopApi } from "../api/client";

/**
 * Shop workspace state + loaders. Products and orders use server-side
 * pagination (page + total from the API) instead of fetching full lists and
 * filtering in the browser.
 */

export type ProductRow = Record<string, unknown> & { id: string; slug: string; status: string; productType?: string; version: number; publicProduct?: Record<string, unknown> | null };
export type OrderRow = Record<string, unknown> & { id: string; status: string; paymentStatus: string; fulfillmentStatus: string; createdAt: string };
export type InventoryRow = Record<string, unknown> & { variantId: string };
export type CategoryRow = Record<string, unknown> & { id: string; slug: string; status: string; usageCount?: number; version: number; localizations?: Record<string, { title?: string; description?: string }> };
export type DiscountRow = Record<string, unknown> & { id: string; code?: string; status: string };
export type CryptoMethod = Record<string, unknown> & { id: string; status: string };
export type TelegramBot = Record<string, unknown> & { id: string; status: string; version?: number; scope?: string };

type PageState = { page: number; totalPages: number; total: number };

type ShopState = {
  overview: Record<string, any> | null;
  products: ProductRow[];
  productsPage: PageState;
  categories: CategoryRow[];
  inventory: InventoryRow[];
  inventoryCryptoReady: boolean;
  orders: OrderRow[];
  ordersPage: PageState;
  ordersQuery: string;
  discounts: DiscountRow[];
  affiliates: Array<Record<string, unknown>>;
  commissions: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  paymentAttention: Array<Record<string, unknown>>;
  fulfillment: Array<Record<string, unknown>>;
  outbox: Array<Record<string, unknown>>;
  paymentProvider: Record<string, any> | null;
  cryptoMethods: CryptoMethod[];
  cryptoRuntime: Record<string, any> | null;
  pricing: Record<string, any> | null;
  notion: Record<string, any> | null;
  telegram: Record<string, any> | null;
  telegramBots: TelegramBot[];
  telegramEvents: Array<Record<string, unknown>>;
  telegramEncryptionConfigured: boolean;
  telegramRegistryManaged: boolean;
  selectedProducts: Set<string>;
  loading: boolean;
};

type ShopContextValue = ShopState & {
  setSelectedProducts: (next: Set<string>) => void;
  loadOverview: () => Promise<void>;
  loadProducts: (page?: number) => Promise<void>;
  loadCategories: () => Promise<CategoryRow[]>;
  loadInventory: () => Promise<void>;
  loadOrders: (page?: number, query?: string) => Promise<void>;
  loadDiscounts: () => Promise<void>;
  loadAffiliates: () => Promise<void>;
  loadPayments: () => Promise<void>;
  loadFulfillment: () => Promise<void>;
  loadTelegramBots: () => Promise<void>;
  loadSettingsTab: () => Promise<void>;
  setTab: (tab: string) => void;
  tab: string;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside ShopWorkspace");
  return value;
}

const emptyPage: PageState = { page: 1, totalPages: 1, total: 0 };

export function ShopProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShopState>({
    overview: null,
    products: [], productsPage: emptyPage, categories: [], inventory: [], inventoryCryptoReady: false,
    orders: [], ordersPage: emptyPage, ordersQuery: "", discounts: [], affiliates: [], commissions: [],
    payments: [], paymentAttention: [], fulfillment: [], outbox: [],
    paymentProvider: null, cryptoMethods: [], cryptoRuntime: null, pricing: null, notion: null,
    telegram: null, telegramBots: [], telegramEvents: [], telegramEncryptionConfigured: false,
    telegramRegistryManaged: false, selectedProducts: new Set(), loading: false,
  });
  const [tab, setTab] = useState("overview");

  const patch = useCallback((next: Partial<ShopState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  const loadOverview = useCallback(async () => {
    const data = await shopApi<{ counts?: Record<string, unknown>; ops?: unknown; inventoryAlerts?: unknown[]; ordersSeries?: Array<{ date: string; orders: number; paidOrders: number; revenueMinor: number }> }>("overview");
    patch({ overview: data });
    const [orders, inventory] = await Promise.all([
      shopApi<{ orders?: OrderRow[] }>("orders?limit=6"),
      shopApi<{ inventory?: InventoryRow[]; cryptoReady?: boolean }>("inventory").catch(() => ({ inventory: [], cryptoReady: false })),
    ]);
    patch({
      orders: orders.orders || [],
      inventory: inventory.inventory || [],
      inventoryCryptoReady: inventory.cryptoReady === true,
    });
  }, [patch]);

  const loadCategories = useCallback(async () => {
    const data = await shopApi<{ categories?: CategoryRow[] }>("categories");
    patch({ categories: data.categories || [] });
    return data.categories || [];
  }, [patch]);

  const loadProducts = useCallback(async (page = 1) => {
    const [basic, storefront, categories, inventory] = await Promise.all([
      shopApi<{ products?: ProductRow[]; total?: number; pagination?: PageState }>(`products?page=${page}&limit=20`),
      shopApi<{ products?: Array<Record<string, unknown> & { id: string }> }>("products?locale=vi").catch(() => ({ products: [] })),
      loadCategories(),
      shopApi<{ inventory?: InventoryRow[]; cryptoReady?: boolean }>("inventory").catch(() => ({ inventory: [], cryptoReady: false })),
    ]);
    const publicById = new Map((storefront.products || []).map((item) => [item.id, item]));
    patch({
      products: (basic.products || []).map((item) => ({ ...item, publicProduct: publicById.get(item.id) || null })),
      productsPage: {
        page: basic.pagination?.page ?? page,
        totalPages: basic.pagination?.totalPages ?? 1,
        total: basic.total ?? (basic.products || []).length,
      },
      inventory: inventory.inventory || [],
      inventoryCryptoReady: inventory.cryptoReady === true,
    });
  }, [loadCategories, patch]);

  const loadInventory = useCallback(async () => {
    const data = await shopApi<{ inventory?: InventoryRow[]; cryptoReady?: boolean }>("inventory");
    patch({ inventory: data.inventory || [], inventoryCryptoReady: data.cryptoReady === true });
  }, [patch]);

  const loadOrders = useCallback(async (page = 1, query = "") => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (query.trim()) params.set("q", query.trim());
    const data = await shopApi<{ orders?: OrderRow[]; total?: number; pagination?: PageState }>(`orders?${params.toString()}`);
    patch({
      orders: data.orders || [],
      ordersPage: {
        page: data.pagination?.page ?? page,
        totalPages: data.pagination?.totalPages ?? 1,
        total: data.total ?? (data.orders || []).length,
      },
      ordersQuery: query,
    });
  }, [patch]);

  const loadDiscounts = useCallback(async () => {
    const data = await shopApi<{ discounts?: DiscountRow[] }>("discounts");
    patch({ discounts: data.discounts || [] });
  }, [patch]);

  const loadAffiliates = useCallback(async () => {
    try {
      const data = await shopApi<{ partners?: Array<Record<string, unknown>>; commissions?: Array<Record<string, unknown>> }>("affiliates");
      patch({ affiliates: data.partners || [], commissions: data.commissions || [] });
    } catch {
      patch({ affiliates: [], commissions: [] });
    }
  }, [patch]);

  const loadPayments = useCallback(async () => {
    const [data, provider, crypto] = await Promise.all([
      shopApi<{ payments?: Array<Record<string, unknown>>; attentionEvents?: Array<Record<string, unknown>>; cryptoAttempts?: Array<Record<string, unknown>>; cryptoEvents?: Array<Record<string, unknown>>; cryptoRuntime?: Record<string, any> }>("payment"),
      shopApi<{ provider: Record<string, any> | null }>("payment/providers"),
      shopApi<{ methods?: CryptoMethod[]; runtime?: Record<string, any> }>("payment/crypto-methods"),
    ]);
    patch({
      payments: [...(data.payments || []), ...(data.cryptoAttempts || [])],
      paymentAttention: [...(data.attentionEvents || []), ...(data.cryptoEvents || []).filter((event) => ["needs_review", "unmatched"].includes(String((event as { matchState?: string }).matchState)))],
      cryptoMethods: crypto.methods || [],
      cryptoRuntime: crypto.runtime || data.cryptoRuntime || null,
      paymentProvider: provider.provider || null,
    });
  }, [patch]);

  const loadFulfillment = useCallback(async () => {
    const data = await shopApi<{ fulfillment?: Array<Record<string, unknown>>; outbox?: Array<Record<string, unknown>> }>("fulfillment");
    patch({ fulfillment: data.fulfillment || [], outbox: data.outbox || [] });
  }, [patch]);

  const loadTelegramBots = useCallback(async () => {
    try {
      const data = await shopApi<{ bots?: TelegramBot[]; items?: TelegramBot[]; events?: Array<Record<string, unknown>>; encryptionConfigured?: boolean; registryManaged?: boolean; registryUnavailable?: boolean; activeBot?: Record<string, any>; telegram?: Record<string, any>; integration?: Record<string, any> }>("telegram/bots");
      patch({
        telegramBots: (data.bots || data.items || []) as TelegramBot[],
        telegramEvents: data.events || [],
        telegramEncryptionConfigured: data.encryptionConfigured === true,
        telegramRegistryManaged: data.registryManaged === true,
        telegram: data.activeBot || data.telegram || data.integration || null,
      });
    } catch {
      // Fail closed: credential actions stay disabled until the registry can
      // prove encryption readiness (mirrors the old fallback behavior).
      try {
        const legacy = await shopApi<{ telegram?: Record<string, any>; integration?: Record<string, any> }>("telegram");
        patch({
          telegram: legacy.telegram || legacy.integration || null,
          telegramBots: [],
          telegramEvents: [],
          telegramEncryptionConfigured: false,
        });
      } catch {
        patch({ telegram: { configured: false, webhookConfigured: false, statusError: true }, telegramEncryptionConfigured: false });
      }
    }
  }, [patch]);

  const loadSettingsTab = useCallback(async () => {
    const [pricing, provider, crypto, notion, telegram, siteSettings] = await Promise.all([
      shopApi<{ pricing?: Record<string, any> }>("pricing"),
      shopApi<{ provider: Record<string, any> | null }>("payment/providers"),
      shopApi<{ methods?: CryptoMethod[]; runtime?: Record<string, any> }>("payment/crypto-methods"),
      shopApi<{ integration?: Record<string, any> }>("integrations/notion"),
      shopApi<{ telegram?: Record<string, any>; integration?: Record<string, any> }>("telegram").catch(() => null),
      api<{ settings?: { config?: Record<string, unknown> } }>("settings").catch(() => null),
    ]);
    void siteSettings;
    patch({
      pricing: pricing.pricing || null,
      paymentProvider: provider.provider || null,
      cryptoMethods: crypto.methods || [],
      cryptoRuntime: crypto.runtime || null,
      notion: notion.integration || null,
      telegram: (telegram?.telegram || telegram?.integration || null) as Record<string, any> | null,
    });
  }, [patch]);

  const setSelectedProducts = useCallback((next: Set<string>) => {
    setState((current) => ({ ...current, selectedProducts: next }));
  }, []);

  const value = useMemo<ShopContextValue>(() => ({
    ...state,
    setSelectedProducts,
    loadOverview,
    loadProducts,
    loadCategories,
    loadInventory,
    loadOrders,
    loadDiscounts,
    loadAffiliates,
    loadPayments,
    loadFulfillment,
    loadTelegramBots,
    loadSettingsTab,
    setTab,
    tab,
  }), [state, setSelectedProducts, loadOverview, loadProducts, loadCategories, loadInventory, loadOrders, loadDiscounts, loadAffiliates, loadPayments, loadFulfillment, loadTelegramBots, loadSettingsTab, tab]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
