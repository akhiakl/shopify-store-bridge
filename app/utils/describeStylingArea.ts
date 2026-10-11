/** Where in checkout an area applies, by its path prefix. */
const SECTIONS: [prefix: string, label: string][] = [
  ["designTokens", "Design tokens"],
  ["components", "All pages"],
  ["surfaces.checkout", "Checkout"],
  ["surfaces.customerAccounts", "Customer accounts"],
  ["surfaces.signIn", "Sign-in"],
];

/** "orderSummary" → "Order summary", "headingLevel1" → "Heading level 1". */
function humanize(segment: string): string {
  const words = segment.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A checkout styling area (see utils/sync/checkoutStylingAreas.ts) as the
 * page and job history name it, e.g. `surfaces.checkout.components.orderSummary`
 * → { section: "Checkout", name: "Order summary" }. With `setting`, a
 * path within the area, e.g. `colors.base.background` → "Colors › Base ›
 * Background".
 */
export function describeStylingArea(
  area: string,
  setting?: string,
): { section: string; name: string } {
  const section =
    SECTIONS.find(
      ([prefix]) => area === prefix || area.startsWith(`${prefix}.`),
    )?.[1] ?? "Other";
  const path = setting ? setting.split(".") : [area.split(".").pop() ?? area];
  return { section, name: path.map(humanize).join(" › ") };
}
