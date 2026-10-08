import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { deliveryProfileItemKey, deliveryProfileKey } from "./definitionKey";
import {
  replaceGroupsInput,
  zoneInput,
  type ResolvedGroup,
  type TargetGroup,
} from "./deliveryProfileInputs";
import type { PlannedDeliveryProfile } from "./deliveryProfiles.server";
import { createOne, readTopLevelErrors } from "./runMutation.server";
import type { SyncItemResult, SyncStep } from "./syncTarget.server";

/** Scope read_locations. */
const TARGET_LOCATION_IDS_QUERY = `#graphql
  query TargetLocationIds {
    locations(first: 250, includeInactive: true) { nodes { id name } }
  }
`;

/** Scope read_products. */
const PRODUCT_VARIANT_IDS_QUERY = `#graphql
  query ProductVariantIds($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) {
      variants(first: 250) { nodes { id } }
    }
  }
`;

/** Scope read_shipping. Listed first, then the match read in detail, to
 * keep each query's cost low. */
const TARGET_PROFILES_QUERY = `#graphql
  query TargetDeliveryProfiles {
    deliveryProfiles(first: 50, merchantOwnedOnly: true) {
      nodes { id name default }
    }
  }
`;

const TARGET_PROFILE_DETAIL_QUERY = `#graphql
  query TargetDeliveryProfileDetail($id: ID!) {
    deliveryProfile(id: $id) {
      profileItems(first: 250) {
        nodes { variants(first: 250) { nodes { id } } }
      }
      profileLocationGroups {
        locationGroup {
          id
          locations(first: 250, includeInactive: true) { nodes { name } }
        }
        locationGroupZones(first: 250) { nodes { zone { id } } }
      }
    }
  }
`;

/** Scope write_shipping. */
const DELIVERY_PROFILE_CREATE_MUTATION = `#graphql
  mutation DeliveryProfileCreate($profile: DeliveryProfileInput!) {
    deliveryProfileCreate(profile: $profile) {
      profile { id }
      userErrors { field message }
    }
  }
`;

const DELIVERY_PROFILE_UPDATE_MUTATION = `#graphql
  mutation DeliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) {
    deliveryProfileUpdate(id: $id, profile: $profile) {
      profile { id }
      userErrors { field message }
    }
  }
`;

async function read<T>(
  admin: AdminApiContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | undefined> {
  const response = await admin.graphql(query, variables && { variables });
  const body = (await response.json()) as { data?: T };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  return body.data;
}

type Skip = { item: string; reason: string };

/** Source groups with their locations found on the target by name. A
 * location the target lacks is left out; a group left with none is
 * dropped. Both are reported. */
async function resolveGroups(
  admin: AdminApiContext,
  profile: PlannedDeliveryProfile,
  skips: Skip[],
): Promise<ResolvedGroup[]> {
  const data = await read<{
    locations?: { nodes: { id: string; name: string }[] };
  }>(admin, TARGET_LOCATION_IDS_QUERY);
  const ids = new Map(data?.locations?.nodes.map((l) => [l.name, l.id]));
  const groups: ResolvedGroup[] = [];
  for (const group of profile.locationGroups) {
    const found = group.locations.filter((name) => ids.has(name));
    for (const name of group.locations.filter((n) => !ids.has(n))) {
      skips.push({
        item: `Location ${name}`,
        reason: "No location with this name on this store. Sync it first.",
      });
    }
    if (found.length === 0) continue;
    groups.push({
      locations: found,
      locationIds: found.map((name) => ids.get(name) as string),
      zones: group.zones,
    });
  }
  return groups;
}

async function resolveVariants(
  admin: AdminApiContext,
  handles: string[],
  skips: Skip[],
): Promise<string[]> {
  const variantIds: string[] = [];
  for (const handle of handles) {
    const data = await read<{
      productByIdentifier?: { variants: { nodes: { id: string }[] } } | null;
    }>(admin, PRODUCT_VARIANT_IDS_QUERY, { handle });
    const product = data?.productByIdentifier;
    if (!product) {
      skips.push({
        item: `Product ${handle}`,
        reason: "No product with this handle on this store.",
      });
      continue;
    }
    variantIds.push(...product.variants.nodes.map((v) => v.id));
  }
  return variantIds;
}

type TargetDetail = {
  profileItems: { nodes: { variants: { nodes: { id: string }[] } }[] };
  profileLocationGroups: {
    locationGroup: { id: string; locations: { nodes: { name: string }[] } };
    locationGroupZones: { nodes: { zone: { id: string } }[] };
  }[];
};

/** Replaces an existing target profile's zones, rates and (custom
 * profiles) products with the source's, in one update. */
async function updateProfile(
  admin: AdminApiContext,
  {
    id,
    profile,
    groups,
    variantIds,
  }: {
    id: string;
    profile: PlannedDeliveryProfile;
    groups: ResolvedGroup[];
    variantIds: string[];
  },
) {
  const data = await read<{ deliveryProfile?: TargetDetail | null }>(
    admin,
    TARGET_PROFILE_DETAIL_QUERY,
    { id },
  );
  const detail = data?.deliveryProfile;
  const target: TargetGroup[] = (detail?.profileLocationGroups ?? []).map(
    (g) => ({
      id: g.locationGroup.id,
      locations: g.locationGroup.locations.nodes.map((l) => l.name),
      zoneIds: g.locationGroupZones.nodes.map((z) => z.zone.id),
    }),
  );
  const current = (detail?.profileItems.nodes ?? []).flatMap((item) =>
    item.variants.nodes.map((v) => v.id),
  );
  const wanted = new Set(variantIds);
  return createOne(admin, DELIVERY_PROFILE_UPDATE_MUTATION, {
    id,
    profile: {
      ...replaceGroupsInput(target, groups, { isDefault: profile.isDefault }),
      // The default profile covers every product not in another profile.
      ...(profile.isDefault
        ? {}
        : {
            variantsToAssociate: variantIds,
            variantsToDissociate: current.filter((v) => !wanted.has(v)),
          }),
    },
  });
}

/**
 * Syncs one shipping profile onto a target: the default profile onto the
 * target's default, a custom one onto the target's profile of the same
 * name (created if missing). Source is authoritative: zones and rates
 * replace the target's. Whatever can't sync (carrier-calculated rates,
 * locations or products missing on the target) is listed as SKIPPED rows;
 * a lookup or write error fails the profile and leaves the target as it
 * was, since the write is one mutation.
 */
export function deliveryProfileStep(profile: PlannedDeliveryProfile): SyncStep {
  return async (ctx) => {
    const key = deliveryProfileKey(profile.name);
    const skips: Skip[] = [...profile.skipped];
    const row = (
      status: SyncItemResult["status"],
      errorMessage: string | null = null,
    ): SyncItemResult => ({ key, kind: "DEFINITION", status, errorMessage });
    try {
      const admin = ctx.targetAdmin;
      const groups = await resolveGroups(admin, profile, skips);
      const variantIds = await resolveVariants(admin, profile.products, skips);
      const list = await read<{
        deliveryProfiles?: {
          nodes: { id: string; name: string; default: boolean }[];
        };
      }>(admin, TARGET_PROFILES_QUERY);
      const existing = list?.deliveryProfiles?.nodes.find((p) =>
        profile.isDefault ? p.default : !p.default && p.name === profile.name,
      );
      const result = existing
        ? await updateProfile(admin, {
            id: existing.id,
            profile,
            groups,
            variantIds,
          })
        : await createOne(admin, DELIVERY_PROFILE_CREATE_MUTATION, {
            profile: {
              name: profile.name,
              locationGroupsToCreate: groups.map((g) => ({
                locations: g.locationIds,
                zonesToCreate: g.zones.map(zoneInput),
              })),
              variantsToAssociate: variantIds,
            },
          });
      if (!result.ok) return [row("FAILED", result.error)];
    } catch (err) {
      return [row("FAILED", err instanceof Error ? err.message : String(err))];
    }
    return [
      row("SUCCEEDED"),
      ...skips.map(({ item, reason }): SyncItemResult => ({
        key: deliveryProfileItemKey(profile.name, item),
        kind: "DEFINITION",
        status: "SKIPPED",
        errorMessage: reason,
      })),
    ];
  };
}
