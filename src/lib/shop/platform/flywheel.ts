/**
 * F10 Portfolio × Shop flywheel — CTA map between brand surfaces.
 */

export type FlywheelCta = {
  id: string;
  from: "portfolio" | "shop" | "case" | "contact";
  href: string;
  title: string;
  body: string;
  badge?: string;
};

// Note: surface "contact" reuses shop→build style CTAs toward shop/work.

export function getFlywheelCtas(locale: string, localizePath: (path: string, locale: string) => string): FlywheelCta[] {
  const shop = localizePath("/shop", locale);
  const contact = localizePath("/contact", locale);
  const work = localizePath("/work", locale);
  const pricing = localizePath("/pricing", locale);

  if (locale === "vi") {
    return [
      {
        id: "portfolio-to-shop",
        from: "portfolio",
        href: shop,
        title: "Cần AI tools ngay?",
        body: "Mua gói ChatGPT, Canva, Cursor… giá rõ, giao key sau xác minh.",
        badge: "Shop",
      },
      {
        id: "shop-to-build",
        from: "shop",
        href: contact,
        title: "Cần build shop / SaaS như TUNG?",
        body: "Tư vấn website, checkout, inventory và miniapp Telegram cho doanh nghiệp.",
        badge: "Dịch vụ",
      },
      {
        id: "shop-to-work",
        from: "shop",
        href: work,
        title: "Xem proof LogiVN & Fball",
        body: "Sản phẩm thật đang chạy — cùng phong cách vận hành với shop này.",
        badge: "Portfolio",
      },
      {
        id: "case-to-pricing",
        from: "case",
        href: pricing,
        title: "Báo giá dự án",
        body: "Landing, SME website, SaaS — phạm vi và mốc thanh toán rõ.",
        badge: "Pricing",
      },
      {
        id: "contact-to-shop",
        from: "contact",
        href: shop,
        title: "Mua tool trong lúc chờ reply?",
        body: "Shop tài khoản AI & phần mềm — thanh toán QR, giao sau xác minh.",
        badge: "Shop",
      },
      {
        id: "contact-to-work",
        from: "contact",
        href: work,
        title: "Xem dự án đã ship",
        body: "LogiVN, Fball — proof vận hành thật trước khi bắt đầu brief.",
        badge: "Portfolio",
      },
    ];
  }

  return [
    {
      id: "portfolio-to-shop",
      from: "portfolio",
      href: shop,
      title: "Need AI tools now?",
      body: "Buy ChatGPT, Canva, Cursor plans with clear pricing and verified delivery.",
      badge: "Shop",
    },
    {
      id: "shop-to-build",
      from: "shop",
      href: contact,
      title: "Want a shop/SaaS like this?",
      body: "Talk about websites, checkout, inventory, and Telegram mini apps.",
      badge: "Services",
    },
    {
      id: "shop-to-work",
      from: "shop",
      href: work,
      title: "See LogiVN & Fball proof",
      body: "Live products with the same operational discipline as this store.",
      badge: "Portfolio",
    },
    {
      id: "case-to-pricing",
      from: "case",
      href: pricing,
      title: "Project pricing",
      body: "Landing pages, SME sites, SaaS — clear scope and milestones.",
      badge: "Pricing",
    },
    {
      id: "contact-to-shop",
      from: "contact",
      href: shop,
      title: "Browse the shop while you wait",
      body: "AI accounts & digital tools with QR payment and verified delivery.",
      badge: "Shop",
    },
    {
      id: "contact-to-work",
      from: "contact",
      href: work,
      title: "See shipped products",
      body: "LogiVN, Fball — live operational proof before the project brief.",
      badge: "Portfolio",
    },
  ];
}
