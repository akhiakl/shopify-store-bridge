/**
 * A store's Shopify admin (`a.myshopify.com` →
 * `https://admin.shopify.com/store/a`), or this app inside it when given
 * the app's API key (the admin resolves `/apps/<client id>` to the app),
 * optionally at one of the app's own paths, e.g. `/app/connections/1`.
 */
export function storeAdminUrl(
  shop: string,
  apiKey?: string,
  appPath = "",
): string {
  const base = `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, "")}`;
  return apiKey ? `${base}/apps/${apiKey}${appPath}` : base;
}
