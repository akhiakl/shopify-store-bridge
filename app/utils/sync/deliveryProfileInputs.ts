import type { PlannedZone } from "./deliveryProfiles.server";

/** A `DeliveryLocationGroupZoneInput` that creates the zone and its rates. */
export function zoneInput(zone: PlannedZone) {
  return {
    name: zone.name,
    countries: zone.countries,
    methodDefinitionsToCreate: zone.methods.map((method) => ({
      name: method.name,
      description: method.description,
      active: method.active,
      rateDefinition: { price: method.price },
      priceConditionsToCreate: method.priceConditions,
      weightConditionsToCreate: method.weightConditions,
    })),
  };
}

/** A target location group: its ID, location names and zone IDs. */
export interface TargetGroup {
  id: string;
  locations: string[];
  zoneIds: string[];
}

/** A source group with the locations found on the target, by name and
 * target ID. */
export interface ResolvedGroup {
  locations: string[];
  locationIds: string[];
  zones: PlannedZone[];
}

const sameLocations = (a: string[], b: string[]) =>
  a.length === b.length &&
  [...a].sort().join("\n") === [...b].sort().join("\n");

/**
 * The location-group part of a `deliveryProfileUpdate` that replaces the
 * target profile's zones with the source's: every target zone is deleted,
 * a target group with exactly the source group's locations gets the
 * source zones, any other source group is created, and (custom profiles
 * only) target groups the source has no match for are removed. The
 * default profile's groups are kept: they hold every location the store
 * ships from.
 */
export function replaceGroupsInput(
  target: TargetGroup[],
  source: ResolvedGroup[],
  { isDefault }: { isDefault: boolean },
) {
  const matched = new Set<string>();
  const locationGroupsToUpdate = [];
  const locationGroupsToCreate = [];
  for (const group of source) {
    const match = target.find(
      (t) => !matched.has(t.id) && sameLocations(t.locations, group.locations),
    );
    const zonesToCreate = group.zones.map(zoneInput);
    if (match) {
      matched.add(match.id);
      locationGroupsToUpdate.push({ id: match.id, zonesToCreate });
    } else {
      locationGroupsToCreate.push({
        locations: group.locationIds,
        zonesToCreate,
      });
    }
  }
  const unmatched = target.filter((t) => !matched.has(t.id)).map((t) => t.id);
  return {
    zonesToDelete: target.flatMap((t) => t.zoneIds),
    locationGroupsToUpdate,
    locationGroupsToCreate,
    ...(isDefault ? {} : { locationGroupsToDelete: unmatched }),
  };
}
