/** Owner types whose records have a natural key shared across stores:
 * products and collections by handle, customers by email. Variants,
 * orders, pages, blogs and articles don't (see #63), so their values
 * aren't offered. Shared with the UI, so not a `.server` file. */
export const VALUE_OWNER_TYPES = ["PRODUCT", "COLLECTION", "CUSTOMER"] as const;

export type ValueOwnerType = (typeof VALUE_OWNER_TYPES)[number];

export function isValueOwnerType(type: string): type is ValueOwnerType {
  return (VALUE_OWNER_TYPES as readonly string[]).includes(type);
}
