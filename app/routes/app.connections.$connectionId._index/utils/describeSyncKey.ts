/** "PRIVACY_POLICY" → "Privacy policy"; "PRODUCT" → "Product". */
function humanize(constant: string): string {
  const words = constant.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Splits off the key's type prefix only: names after it (location
 * names, menu item paths) can contain ":" themselves. */
function splitKey(key: string): [string, string[]] {
  const [prefix, ...rest] = key.split(":");
  return [prefix, rest];
}

/** Joins whatever's left after the fixed parts, so a ":" inside a name
 * survives. */
const tail = (parts: string[], from: number) => parts.slice(from).join(":");

/**
 * A selection or job-item key (see utils/sync/definitionKey.ts) as a type
 * and a name a merchant can read, e.g. `menuItem:main-menu:Shop > Shoes`
 * → { type: "Menu item", name: "main-menu › Shop › Shoes" }. Unknown keys
 * fall back to the raw key, so a new key type still shows something.
 */
export function describeSyncKey(key: string): { type: string; name: string } {
  const [prefix, parts] = splitKey(key);
  const field = (from: number) =>
    `${humanize(parts[from])} · ${parts[from + 1]}.${parts[from + 2]}`;

  switch (prefix) {
    case "metaobject":
      return { type: "Metaobject definition", name: tail(parts, 0) };
    case "metaobjectEntries":
      return { type: "Metaobject entries", name: tail(parts, 0) };
    case "metaobjectEntry":
      return {
        type: "Metaobject entry",
        name: `${parts[0]} › ${tail(parts, 1)}`,
      };
    case "metafield":
      return { type: "Metafield definition", name: field(0) };
    case "metafieldValues":
      return { type: "Metafield values", name: field(0) };
    case "metafieldValue":
      return {
        type: "Metafield value",
        name: `${field(0)} on ${tail(parts, 3)}`,
      };
    case "policy":
      return { type: "Shop policy", name: humanize(tail(parts, 0)) };
    case "collection":
      return { type: "Collection", name: tail(parts, 0) };
    case "collectionRules":
      return { type: "Collection rules", name: tail(parts, 0) };
    case "location":
      return { type: "Location", name: tail(parts, 0) };
    case "menu":
      return { type: "Menu", name: tail(parts, 0) };
    case "menuItem":
      return {
        type: "Menu item",
        name: `${parts[0]} › ${tail(parts, 1).replace(/ > /g, " › ")}`,
      };
    default:
      return { type: "Item", name: key };
  }
}
