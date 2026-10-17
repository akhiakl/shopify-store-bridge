import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { marketShippingItemKey, marketShippingKey } from "./definitionKey";
import type { PlannedMarketShipping } from "./marketShipping.server";
import {
  optionCreateInput,
  type Skip,
  type TargetIds,
} from "./marketShippingInputs";
import { createOne, readTopLevelErrors } from "./runMutation.server";
import type { SyncItemResult, SyncStep } from "./syncTarget.server";

/** Scope read_markets. */
const TARGET_MARKETS_QUERY = `#graphql
  query TargetMarketShipping {
    shop { features { marketDrivenShipping } }
    markets(first: 50) {
      nodes {
        id
        handle
        delivery {
          shipping { optionDefinitions(first: 50) { nodes { id } } }
        }
      }
    }
  }
`;

/** Scope read_locations. */
const TARGET_LOCATIONS_QUERY = `#graphql
  query MarketShippingTargetLocations {
    locations(first: 250, includeInactive: true) { nodes { id name } }
  }
`;

/** Scope read_products. */
const TARGET_COLLECTION_QUERY = `#graphql
  query MarketShippingTargetCollection($handle: String!) {
    collectionByIdentifier(identifier: { handle: $handle }) { id }
  }
`;

/** Scope write_markets. */
const MARKET_UPDATE_MUTATION = `#graphql
  mutation MarketShippingUpdate($id: ID!, $input: MarketUpdateInput!) {
    marketUpdate(id: $id, input: $input) {
      market { id }
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

type TargetMarkets = {
  shop: { features: { marketDrivenShipping: boolean } };
  markets: {
    nodes: {
      id: string;
      handle: string;
      delivery: {
        shipping: { optionDefinitions: { nodes: { id: string }[] } } | null;
      };
    }[];
  };
};

/** Target IDs for every location and collection the plan's rate groups
 * name. Only the collections used are looked up, one by one. */
async function targetIds(
  admin: AdminApiContext,
  shipping: PlannedMarketShipping,
): Promise<TargetIds> {
  const groups = shipping.options.flatMap((o) => o.rateGroups);
  const locations = new Map<string, string>();
  if (groups.some((g) => g.locations.length > 0)) {
    const data = await read<{
      locations?: { nodes: { id: string; name: string }[] };
    }>(admin, TARGET_LOCATIONS_QUERY);
    data?.locations?.nodes.forEach((l) => locations.set(l.name, l.id));
  }
  const collections = new Map<string, string>();
  for (const handle of new Set(groups.flatMap((g) => g.collections))) {
    const data = await read<{
      collectionByIdentifier?: { id: string } | null;
    }>(admin, TARGET_COLLECTION_QUERY, { handle });
    const id = data?.collectionByIdentifier?.id;
    if (id) collections.set(handle, id);
  }
  return { locations, collections };
}

/**
 * Syncs one market's shipping onto the target's market with the same
 * handle, for stores on market-driven shipping. Source is authoritative:
 * the target market's delivery options are replaced, in one update, so a
 * failure leaves the target as it was. A target not on market-driven
 * shipping, or without the market, is reported as SKIPPED; so is whatever
 * can't sync (carrier-calculated rates, locations or collections missing
 * on the target).
 */
export function marketShippingStep(shipping: PlannedMarketShipping): SyncStep {
  return async (ctx) => {
    const key = marketShippingKey(shipping.handle);
    const row = (
      status: SyncItemResult["status"],
      errorMessage: string | null = null,
    ): SyncItemResult => ({ key, kind: "DEFINITION", status, errorMessage });
    const skips: Skip[] = [...shipping.skipped];
    try {
      const admin = ctx.targetAdmin;
      const data = await read<TargetMarkets>(admin, TARGET_MARKETS_QUERY);
      if (!data?.shop.features.marketDrivenShipping) {
        return [
          row(
            "SKIPPED",
            "This store sets shipping in delivery profiles, not per market. Switch it to market-driven shipping, or sync from a store that uses profiles.",
          ),
        ];
      }
      const market = data.markets.nodes.find(
        (m) => m.handle === shipping.handle,
      );
      if (!market) {
        return [
          row(
            "SKIPPED",
            "No market with this handle on this store. Create it first.",
          ),
        ];
      }
      const ids = await targetIds(admin, shipping);
      const optionDefinitionsToCreate = shipping.options.flatMap((option) => {
        const input = optionCreateInput(option, ids, skips);
        return input ? [input] : [];
      });
      const current = market.delivery.shipping?.optionDefinitions.nodes ?? [];
      const result = await createOne(admin, MARKET_UPDATE_MUTATION, {
        id: market.id,
        input: {
          delivery: {
            shipping: {
              isEnabled: shipping.isEnabled,
              optionDefinitionsToDelete: current.map((o) => o.id),
              optionDefinitionsToCreate,
            },
          },
        },
      });
      if (!result.ok) return [row("FAILED", result.error)];
    } catch (err) {
      return [row("FAILED", err instanceof Error ? err.message : String(err))];
    }
    return [
      row("SUCCEEDED"),
      ...skips.map(({ item, reason }): SyncItemResult => ({
        key: marketShippingItemKey(shipping.handle, item),
        kind: "DEFINITION",
        status: "SKIPPED",
        errorMessage: reason,
      })),
    ];
  };
}
