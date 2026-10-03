import { locationKey } from "~/utils/sync/definitionKey";
import type { LocationRow } from "~/utils/sync/locations.server";

interface LocationsSectionProps {
  locations: LocationRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

function locationDetails(location: LocationRow): string {
  const { city, provinceCode, countryCode } = location.address;
  const place = [city, provinceCode, countryCode].filter(Boolean).join(", ");
  const online = location.fulfillsOnlineOrders
    ? "Fulfills online orders."
    : "Doesn't fulfill online orders.";
  return place ? `${place}. ${online}` : online;
}

export function LocationsSection({
  locations,
  selected,
  onToggle,
}: LocationsSectionProps) {
  if (locations.length === 0) {
    return <s-paragraph>No active locations found.</s-paragraph>;
  }

  const keys = locations.map((location) => locationKey(location.name));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-paragraph>
        A location updates the target location with the same name, or is
        created. Its address and online-order setting sync. Whether it&apos;s
        active stays up to each store, and inventory isn&apos;t moved.
      </s-paragraph>
      <s-checkbox
        label={`Select all (${locations.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {locations.map((location) => {
        const key = locationKey(location.name);
        return (
          <s-checkbox
            key={key}
            label={location.name}
            details={locationDetails(location)}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
