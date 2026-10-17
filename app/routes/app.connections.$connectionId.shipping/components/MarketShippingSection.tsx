import { marketShippingKey } from "~/utils/sync/definitionKey";
import type { MarketShippingRow } from "~/utils/sync/marketShipping.server";

interface MarketShippingSectionProps {
  markets: MarketShippingRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

function marketDetails({ handle, shipping }: MarketShippingRow): string {
  if (!shipping) return `${handle}. No shipping set up.`;
  const n = shipping.optionCount;
  const options = `${n} delivery ${n === 1 ? "option" : "options"}`;
  return `${handle}. ${options}${shipping.isEnabled ? "" : ", shipping off"}.`;
}

export function MarketShippingSection({
  markets,
  selected,
  onToggle,
}: MarketShippingSectionProps) {
  // A market without shipping has nothing to sync.
  const syncable = markets.filter((market) => market.shipping);
  if (syncable.length === 0) {
    return <s-paragraph>No markets with shipping found.</s-paragraph>;
  }

  const keys = syncable.map((market) => marketShippingKey(market.handle));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-paragraph>
        This store uses market-driven shipping. Each market&apos;s delivery
        options replace those of the target&apos;s market with the same handle,
        so create the markets there first. Rates match locations by name and
        collections by handle, so sync those first too. Carrier-calculated
        rates, and targets not on market-driven shipping, are skipped and listed
        in job history.
      </s-paragraph>
      <s-checkbox
        label={`Select all (${keys.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {markets.map((market) => {
        const key = marketShippingKey(market.handle);
        return (
          <s-checkbox
            key={key}
            label={market.name}
            details={marketDetails(market)}
            disabled={!market.shipping}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
