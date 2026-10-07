declare namespace App {
  interface Locals {
    /**
     * The visitor's market, resolved once per request by the middleware.
     *
     * Stored here rather than re-resolved by each page so prices, payment rails
     * and catalogue visibility all come from one decision. Read it with
     * `Astro.locals.market`.
     *
     * Null when D1 is unavailable; callers fall back to the built-in defaults.
     */
    market: import("./lib/shop/market").MarketResolution | null;
    /**
     * Markets loaded from D1 for this request, or null when unavailable. Lets
     * the storefront offer a market switcher without another query.
     */
    markets: import("./lib/shop/market").Market[] | null;
  }
}
