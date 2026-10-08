import { deliveryProfileSelectionKey } from "~/utils/sync/definitionKey";
import type { DeliveryProfileRow } from "~/utils/sync/deliveryProfiles.server";

interface DeliveryProfilesSectionProps {
  profiles: DeliveryProfileRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function profileDetails(profile: DeliveryProfileRow): string {
  const reach = `${plural(profile.zoneCountryCount, "country", "countries")}, ${plural(profile.activeMethodDefinitionsCount, "active rate")}.`;
  if (profile.default)
    return `${reach} Covers every product not in another profile.`;
  const products = profile.productVariantsCount?.count ?? 0;
  return `${reach} ${plural(products, "variant")}, matched by product handle.`;
}

export function DeliveryProfilesSection({
  profiles,
  selected,
  onToggle,
}: DeliveryProfilesSectionProps) {
  if (profiles.length === 0) {
    return <s-paragraph>No shipping profiles found.</s-paragraph>;
  }

  const keys = profiles.map((profile) =>
    deliveryProfileSelectionKey(profile.id),
  );
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-paragraph>
        The general profile replaces the target&apos;s general profile; a custom
        profile replaces the target&apos;s profile with the same name, or is
        created. Zones and flat or conditional rates are replaced. Locations
        match by name, so sync them first. Carrier-calculated rates, and
        locations or products missing on the target, are skipped and listed in
        job history.
      </s-paragraph>
      <s-checkbox
        label={`Select all (${keys.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {profiles.map((profile) => {
        const key = deliveryProfileSelectionKey(profile.id);
        return (
          <s-checkbox
            key={key}
            label={profile.default ? `${profile.name} (general)` : profile.name}
            details={profileDetails(profile)}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
