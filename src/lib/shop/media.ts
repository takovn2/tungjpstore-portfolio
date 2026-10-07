export const SHOP_IMAGE_REVISION = "20260805-teal";

export function versionShopImageUrl(url: string) {
  if (!url.startsWith("/images/shop/") || /[?&]v=/.test(url)) return url;
  const [resource, fragment] = url.split("#", 2);
  return `${resource}${resource.includes("?") ? "&" : "?"}v=${SHOP_IMAGE_REVISION}${fragment ? `#${fragment}` : ""}`;
}
