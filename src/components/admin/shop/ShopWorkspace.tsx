import { useCallback, useEffect, useState } from "react";
import { ShopProvider, useShop } from "./useShop";
import { Tabs } from "../ui/primitives";
import { OverviewTab } from "./OverviewTab";
import { CatalogTab } from "./CatalogTab";
import { InventoryTab } from "./InventoryTab";
import { OrdersTab } from "./OrdersTab";
import { PaymentsTab } from "./PaymentsTab";
import { FulfillmentTab } from "./FulfillmentTab";
import { TelegramTab } from "./TelegramTab";
import { DiscountsTab } from "./DiscountsTab";
import { SettingsTab } from "./SettingsTab";

const TAB_ITEMS = [
  { key: "overview", label: "Tổng quan" },
  { key: "catalog", label: "Sản phẩm" },
  { key: "inventory", label: "Kho key" },
  { key: "orders", label: "Đơn hàng" },
  { key: "payments", label: "Thanh toán" },
  { key: "fulfillment", label: "Giao hàng" },
  { key: "telegram", label: "Telegram" },
  { key: "discounts", label: "Khuyến mãi" },
  { key: "settings", label: "Cấu hình" },
];

function Workspace() {
  const { tab, setTab, overview, orders, outbox, paymentAttention } = useShop();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
  }, [initialized]);

  const loadForTab = useCallback((nextTab: string) => {
    setTab(nextTab);
  }, [setTab]);

  const counts = overview?.counts || {};
  const attentionCount = Number(counts.paymentAttention ?? paymentAttention.length ?? 0) + Number(counts.fulfillmentQueue ?? outbox.filter((item) => ["pending", "failed"].includes(String(item.status))).length ?? 0);

  return (
    <section id="shop-view" data-shop-workspace>
      <header className="view-heading shop-heading">
        <div>
          <p className="eyebrow">Vận hành · Shop</p>
          <h1 tabIndex={-1}>Shop control desk</h1>
          <div className="system-health">
            <span className="health-chip"><span className="system-dot" data-state="healthy" /> Storefront</span>
            <span className="health-chip"><span className="system-dot" data-state="healthy" /> Inventory</span>
            <span className="health-chip"><span className="system-dot" data-state={attentionCount > 0 ? "warning" : "healthy"} /> {attentionCount > 0 ? `${attentionCount} cảnh báo` : "Không cảnh báo"}</span>
          </div>
        </div>
      </header>
      <Tabs
        label="Khu vực shop"
        active={tab}
        onChange={loadForTab}
        items={TAB_ITEMS.map((item) => ({
          key: item.key,
          label: item.key === "orders" ? `${item.label}${orders.length ? ` · ${orders.length}` : ""}` : item.label,
        }))}
      />
      <div className="shop-panels">
        {tab === "overview" ? <OverviewTab /> : null}
        {tab === "catalog" ? <CatalogTab /> : null}
        {tab === "inventory" ? <InventoryTab /> : null}
        {tab === "orders" ? <OrdersTab /> : null}
        {tab === "payments" ? <PaymentsTab /> : null}
        {tab === "fulfillment" ? <FulfillmentTab /> : null}
        {tab === "telegram" ? <TelegramTab /> : null}
        {tab === "discounts" ? <DiscountsTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
      </div>
    </section>
  );
}

export function ShopWorkspace() {
  return (
    <ShopProvider>
      <Workspace />
    </ShopProvider>
  );
}
