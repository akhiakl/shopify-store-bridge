/**
 * StoreBridge's plans (#111): Free, and one paid plan billed every 30 days
 * through Shopify's Billing API. Shared with the UI, so not `.server`.
 */
export const PRO_PLAN = "StoreBridge Pro";
export const PRO_PRICE_USD = 9.99;
/** No trial for now; set a number of days to offer one. */
export const PRO_TRIAL_DAYS = 0;

/** Free stores can have this many connections as the source (pending or
 * approved; declined ones don't count). */
export const FREE_CONNECTION_LIMIT = 1;

/** Selection-key kinds a free source can sync: metafields, metaobjects and
 * collections, definitions and data. Everything else (policies, menus,
 * locations, shipping, checkout styling, pages and blogs) needs Pro. */
const FREE_KINDS = new Set([
  "metafield",
  "metafieldValues",
  "metaobject",
  "metaobjectEntries",
  "collection",
]);

export function isFreeSelectionKey(key: string): boolean {
  return FREE_KINDS.has(key.split(":")[0]);
}
