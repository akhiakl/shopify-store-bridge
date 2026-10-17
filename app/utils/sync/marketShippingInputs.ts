import type { PlannedOption, PlannedRateGroup } from "./marketShipping.server";

/** Target IDs by the shared key: locations by name, collections by
 * handle. */
export interface TargetIds {
  locations: Map<string, string>;
  collections: Map<string, string>;
}

export type Skip = { item: string; reason: string };

function resolve(
  keys: string[],
  ids: Map<string, string>,
  { onMissing }: { onMissing: (key: string) => void },
): string[] {
  const found = keys.filter((key) => ids.has(key));
  keys.filter((key) => !ids.has(key)).forEach(onMissing);
  return found.map((key) => ids.get(key) as string);
}

/** A group's conditions with target IDs. Null when a condition the source
 * set matched nothing on the target: dropping it would widen the rate to
 * every location or product. */
function conditionsInput(
  group: PlannedRateGroup,
  ids: TargetIds,
  { option, skips }: { option: string; skips: Skip[] },
) {
  const originLocationsToAdd = resolve(group.locations, ids.locations, {
    onMissing: (name) =>
      skips.push({
        item: `${option} > Location ${name}`,
        reason: "No location with this name on this store. Sync it first.",
      }),
  });
  const collectionsToAdd = resolve(group.collections, ids.collections, {
    onMissing: (handle) =>
      skips.push({
        item: `${option} > Collection ${handle}`,
        reason: "No collection with this handle on this store. Sync it first.",
      }),
  });
  if (group.locations.length > 0 && originLocationsToAdd.length === 0) {
    return null;
  }
  if (group.collections.length > 0 && collectionsToAdd.length === 0) {
    return null;
  }
  return {
    ...(originLocationsToAdd.length ? { originLocationsToAdd } : {}),
    ...(collectionsToAdd.length ? { collectionsToAdd } : {}),
  };
}

/**
 * A `DeliveryOptionDefinitionCreateInput` for one planned option, its rate
 * groups pointed at the target's locations and collections. Missing ones
 * are added to `skips`; a group whose conditions match nothing is dropped,
 * and an option left with no groups (it had some) returns null.
 */
export function optionCreateInput(
  option: PlannedOption,
  ids: TargetIds,
  skips: Skip[],
) {
  const rateGroups = option.rateGroups.flatMap((group): object[] => {
    const conditions = conditionsInput(group, ids, {
      option: option.name,
      skips,
    });
    if (!conditions) return [];
    return option.type === "flatRate"
      ? [{ conditions, rate: group.rates[0] }]
      : [{ conditions, rates: group.rates }];
  });
  if (option.rateGroups.length > 0 && rateGroups.length === 0) {
    skips.push({
      item: option.name,
      reason:
        "None of its rates' locations or collections are on this store. Sync them first.",
    });
    return null;
  }
  return {
    [option.type]: {
      name: option.name,
      description: option.description,
      isActive: option.isActive,
      currency: option.currency,
      freeDeliveryMinimumValue: option.freeDeliveryMinimumValue,
      rateGroups,
    },
  };
}
