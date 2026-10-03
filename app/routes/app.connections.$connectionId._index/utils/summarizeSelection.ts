/** Plural labels for the key prefixes a selection can contain (the
 * checkboxes' keys, not job-item keys like `menuItem:`). */
const SELECTION_TYPES: Record<string, string> = {
  metaobject: "Metaobject definitions",
  metaobjectEntries: "Metaobject entries",
  metafield: "Metafield definitions",
  metafieldValues: "Metafield values",
  policy: "Shop policies",
  collection: "Collections",
  location: "Locations",
  menu: "Menus",
};

/** What a job covered at a glance, e.g. "Menus, Shop policies" or
 * "Metafield definitions + 2 more". */
export function summarizeSelection(selection: string[]): string {
  const types = [
    ...new Set(
      selection.map((key) => {
        const prefix = key.split(":")[0];
        return SELECTION_TYPES[prefix] ?? "Other";
      }),
    ),
  ];
  return types.length > 2
    ? `${types[0]} + ${types.length - 1} more`
    : types.join(", ");
}
