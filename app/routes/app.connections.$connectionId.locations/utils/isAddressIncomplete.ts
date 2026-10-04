import type { LocationAddressRow } from "~/utils/sync/locations.server";

/**
 * True when Shopify will reject this address on the target: `locationAdd`/
 * `locationEdit` fail without a street and city (a store's default "Shop
 * location" often has only a country). Postal code is deliberately not
 * checked: some countries don't use one, and blocking a valid location
 * is worse than letting Shopify's own error name a missing code at sync.
 */
export function isAddressIncomplete(address: LocationAddressRow): boolean {
  return !address.address1?.trim() || !address.city?.trim();
}
