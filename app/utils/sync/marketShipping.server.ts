import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { readTopLevelErrors } from "./runMutation.server";

/**
 * Stores on market-driven shipping (opt-in from October 2026, every store
 * by July 2027) set rates per market instead of in delivery profiles, and
 * Shopify deprecates the merchant delivery profile APIs for them. Scope
 * read_markets for the markets.
 */
const MARKET_SHIPPING_LIST_QUERY = `#graphql
  query MarketShippingList {
    shop { features { marketDrivenShipping } }
    markets(first: 50) {
      nodes {
        id
        handle
        name
        delivery {
          shipping { isEnabled optionDefinitionsCount { count } }
        }
      }
    }
  }
`;

/** One market's shipping in full. Locations are read by name and
 * collections by handle: the keys they match on across stores. */
const MARKET_SHIPPING_DETAIL_QUERY = `#graphql
  query MarketShippingDetail($id: ID!) {
    market(id: $id) {
      handle
      name
      delivery {
        shipping {
          isEnabled
          optionDefinitions(first: 50) {
            nodes {
              __typename
              currency
              description
              isActive
              freeDeliveryMinimumValue { amount currencyCode }
              ... on DeliveryFlatRateOptionDefinition {
                name
                rateGroups(first: 25) {
                  nodes {
                    conditions {
                      originLocations(first: 50) { nodes { name } }
                      collections(first: 50) { nodes { handle } }
                    }
                    rate {
                      price { amount currencyCode }
                      transitTimeMinSeconds
                      transitTimeMaxSeconds
                    }
                  }
                }
              }
              ... on DeliveryValueBasedOptionDefinition {
                name
                rateGroups(first: 25) {
                  nodes {
                    conditions {
                      originLocations(first: 50) { nodes { name } }
                      collections(first: 50) { nodes { handle } }
                    }
                    rates(first: 50) {
                      nodes {
                        minValue { amount currencyCode }
                        maxValue { amount currencyCode }
                        price { amount currencyCode }
                        transitTimeMinSeconds
                        transitTimeMaxSeconds
                      }
                    }
                  }
                }
              }
              ... on DeliveryWeightBasedOptionDefinition {
                name
                rateGroups(first: 25) {
                  nodes {
                    conditions {
                      originLocations(first: 50) { nodes { name } }
                      collections(first: 50) { nodes { handle } }
                    }
                    rates(first: 50) {
                      nodes {
                        minWeight { unit value }
                        maxWeight { unit value }
                        price { amount currencyCode }
                        transitTimeMinSeconds
                        transitTimeMaxSeconds
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export interface MarketShippingRow {
  id: string;
  handle: string;
  name: string;
  shipping: { isEnabled: boolean; optionCount: number } | null;
}

export interface MarketShippingList {
  marketDrivenShipping: boolean;
  markets: MarketShippingRow[];
}

type Money = { amount: string; currencyCode: string };

export type OptionType = "flatRate" | "valueBased" | "weightBased";

/** A rate group with its conditions as shared keys. `rates` are already
 * in their create-input shape; a flat-rate group has exactly one. */
export interface PlannedRateGroup {
  locations: string[];
  collections: string[];
  rates: Record<string, unknown>[];
}

export interface PlannedOption {
  type: OptionType;
  name: string;
  description: string | null;
  isActive: boolean;
  currency: string;
  freeDeliveryMinimumValue: Money | null;
  rateGroups: PlannedRateGroup[];
}

/** A market's shipping with every store-specific ID replaced by a shared
 * key. The market itself matches on the target by handle. */
export interface PlannedMarketShipping {
  handle: string;
  name: string;
  isEnabled: boolean;
  options: PlannedOption[];
  /** Carrier-calculated options: carrier accounts are set up per store. */
  skipped: { item: string; reason: string }[];
}

const TYPES: Record<string, OptionType> = {
  DeliveryFlatRateOptionDefinition: "flatRate",
  DeliveryValueBasedOptionDefinition: "valueBased",
  DeliveryWeightBasedOptionDefinition: "weightBased",
};

/** Reads whether the store is on market-driven shipping, and its markets'
 * shipping at a glance. Throws on a GraphQL error. */
export async function getMarketShipping(
  admin: AdminApiContext,
): Promise<MarketShippingList> {
  const response = await admin.graphql(MARKET_SHIPPING_LIST_QUERY);
  const body = (await response.json()) as {
    data?: {
      shop: { features: { marketDrivenShipping: boolean } };
      markets: {
        nodes: {
          id: string;
          handle: string;
          name: string;
          delivery: {
            shipping: {
              isEnabled: boolean;
              optionDefinitionsCount: { count: number };
            } | null;
          };
        }[];
      };
    };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  return {
    marketDrivenShipping:
      body.data?.shop.features.marketDrivenShipping ?? false,
    markets: (body.data?.markets.nodes ?? []).map((m) => ({
      id: m.id,
      handle: m.handle,
      name: m.name,
      shipping: m.delivery.shipping && {
        isEnabled: m.delivery.shipping.isEnabled,
        optionCount: m.delivery.shipping.optionDefinitionsCount.count,
      },
    })),
  };
}

type RawGroup = {
  conditions: {
    originLocations: { nodes: { name: string }[] };
    collections: { nodes: { handle: string }[] } | null;
  };
  rate?: Record<string, unknown>;
  rates?: { nodes: Record<string, unknown>[] };
};

type RawOption = {
  __typename: string;
  currency: string;
  description: string | null;
  isActive: boolean;
  freeDeliveryMinimumValue: Money | null;
  name?: string;
  rateGroups?: { nodes: RawGroup[] } | null;
};

function planOption(raw: RawOption, type: OptionType): PlannedOption {
  return {
    type,
    name: raw.name as string,
    description: raw.description,
    isActive: raw.isActive,
    currency: raw.currency,
    freeDeliveryMinimumValue: raw.freeDeliveryMinimumValue,
    rateGroups: (raw.rateGroups?.nodes ?? []).map((group) => ({
      locations: group.conditions.originLocations.nodes.map((l) => l.name),
      collections: (group.conditions.collections?.nodes ?? []).map(
        (c) => c.handle,
      ),
      rates: group.rate ? [group.rate] : (group.rates?.nodes ?? []),
    })),
  };
}

/**
 * Reads one source market's shipping and turns it into a portable plan.
 * Carrier-calculated options are left out and listed in `skipped`.
 * Returns null for a market gone from the source, or one with no
 * shipping set up. Throws on a GraphQL error.
 */
export async function planMarketShipping(
  admin: AdminApiContext,
  id: string,
): Promise<PlannedMarketShipping | null> {
  const response = await admin.graphql(MARKET_SHIPPING_DETAIL_QUERY, {
    variables: { id },
  });
  const body = (await response.json()) as {
    data?: {
      market?: {
        handle: string;
        name: string;
        delivery: {
          shipping: {
            isEnabled: boolean;
            optionDefinitions: { nodes: RawOption[] };
          } | null;
        };
      } | null;
    };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  const market = body.data?.market;
  const shipping = market?.delivery.shipping;
  if (!market || !shipping) return null;

  const skipped: PlannedMarketShipping["skipped"] = [];
  const options: PlannedOption[] = [];
  for (const raw of shipping.optionDefinitions.nodes) {
    const type = TYPES[raw.__typename];
    if (type) {
      options.push(planOption(raw, type));
      continue;
    }
    skipped.push({
      item: raw.description ?? "Carrier-calculated rate",
      reason:
        "It's a carrier-calculated rate. Set up the carrier on this store, then add the rate there.",
    });
  }
  return {
    handle: market.handle,
    name: market.name,
    isEnabled: shipping.isEnabled,
    options,
    skipped,
  };
}
