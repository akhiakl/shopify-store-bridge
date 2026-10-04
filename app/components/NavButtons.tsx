export interface NavItem {
  label: string;
  href: string;
  current: boolean;
}

/** "nav" is the group's page nav (current page filled in). "tabs" is the
 * lighter look for view tabs at the top of a card, like the views row on
 * Shopify's own index tables. */
const VARIANTS = {
  nav: { current: "primary", other: "secondary" },
  tabs: { current: "secondary", other: "tertiary" },
} as const;

/** A row of links styled as buttons, the current one highlighted. Stands
 * in for tabs, which Polaris App Home doesn't have as a component. */
export function NavButtons({
  items,
  appearance = "nav",
}: {
  items: NavItem[];
  appearance?: keyof typeof VARIANTS;
}) {
  const variants = VARIANTS[appearance];
  return (
    <s-stack direction="inline" gap="small-100">
      {items.map((item) => (
        <s-button
          key={item.href}
          href={item.href}
          variant={item.current ? variants.current : variants.other}
          accessibilityLabel={
            item.current ? `${item.label} (current)` : undefined
          }
        >
          {item.label}
        </s-button>
      ))}
    </s-stack>
  );
}
