import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { readTopLevelErrors } from "./runMutation.server";

/** Scope read_shipping (covered by write_shipping, see shopify.app.toml).
 * `merchantOwnedOnly` leaves out profiles other apps own. */
const DELIVERY_PROFILES_QUERY = `#graphql
  query DeliveryProfilesList {
    deliveryProfiles(first: 50, merchantOwnedOnly: true) {
      nodes {
        id
        name
        default
        zoneCountryCount
        activeMethodDefinitionsCount
        productVariantsCount { count }
      }
    }
  }
`;

/**
 * One profile in full. Location groups are read by location name, the
 * key locations match on across stores (#123); products by handle (#63).
 */
const DELIVERY_PROFILE_DETAIL_QUERY = `#graphql
  query DeliveryProfileDetail($id: ID!) {
    deliveryProfile(id: $id) {
      name
      default
      profileItems(first: 250) {
        nodes { product { handle } }
        pageInfo { hasNextPage }
      }
      profileLocationGroups {
        locationGroup {
          locations(first: 250, includeInactive: true) { nodes { name } }
        }
        locationGroupZones(first: 250) {
          nodes {
            zone {
              name
              countries {
                code { countryCode restOfWorld }
                provinces { code }
              }
            }
            methodDefinitions(first: 250) {
              nodes {
                name
                description
                active
                rateProvider {
                  __typename
                  ... on DeliveryRateDefinition { price { amount currencyCode } }
                }
                methodConditions {
                  field
                  operator
                  conditionCriteria {
                    __typename
                    ... on MoneyV2 { amount currencyCode }
                    ... on Weight { unit value }
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

export interface DeliveryProfileRow {
  id: string;
  name: string;
  default: boolean;
  zoneCountryCount: number;
  activeMethodDefinitionsCount: number;
  productVariantsCount: { count: number } | null;
}

type Money = { amount: string; currencyCode: string };
type Weight = { unit: string; value: number };

/** A rate as `DeliveryMethodDefinitionInput` takes it. */
export interface PlannedMethod {
  name: string;
  description: string | null;
  active: boolean;
  price: Money;
  priceConditions: { operator: string; criteria: Money }[];
  weightConditions: { operator: string; criteria: Weight }[];
}

export interface PlannedZone {
  name: string;
  /** `DeliveryCountryInput`s: country and province codes are global. */
  countries: Record<string, unknown>[];
  methods: PlannedMethod[];
}

export interface PlannedLocationGroup {
  locations: string[];
  zones: PlannedZone[];
}

/** A profile with every store-specific ID replaced by a shared key. */
export interface PlannedDeliveryProfile {
  name: string;
  isDefault: boolean;
  products: string[];
  locationGroups: PlannedLocationGroup[];
  /** What can't sync, shown as SKIPPED rows: carrier-calculated rates
   * depend on carrier accounts set up per store. */
  skipped: { item: string; reason: string }[];
}

export async function getDeliveryProfiles(
  admin: AdminApiContext,
): Promise<DeliveryProfileRow[]> {
  const response = await admin.graphql(DELIVERY_PROFILES_QUERY);
  const { data } = await response.json();
  return data?.deliveryProfiles?.nodes ?? [];
}

type RawCountry = {
  code: { countryCode: string | null; restOfWorld: boolean };
  provinces: { code: string }[];
};

function countryInput({ code, provinces }: RawCountry) {
  if (code.restOfWorld) return { restOfWorld: true };
  return provinces.length > 0
    ? { code: code.countryCode, provinces }
    : { code: code.countryCode, includeAllProvinces: true };
}

type RawMethod = {
  name: string;
  description: string | null;
  active: boolean;
  rateProvider: { __typename: string; price?: Money };
  methodConditions: {
    field: string;
    operator: string;
    conditionCriteria: { __typename: string } & Partial<Money & Weight>;
  }[];
};

function planMethod(method: RawMethod): PlannedMethod {
  const conditions = method.methodConditions;
  return {
    name: method.name,
    description: method.description,
    active: method.active,
    price: method.rateProvider.price as Money,
    priceConditions: conditions
      .filter((c) => c.field === "TOTAL_PRICE")
      .map(({ operator, conditionCriteria: { amount, currencyCode } }) => ({
        operator,
        criteria: { amount: amount as string, currencyCode: currencyCode! },
      })),
    weightConditions: conditions
      .filter((c) => c.field === "TOTAL_WEIGHT")
      .map(({ operator, conditionCriteria: { unit, value } }) => ({
        operator,
        criteria: { unit: unit as string, value: value as number },
      })),
  };
}

type RawGroup = {
  locationGroup: { locations: { nodes: { name: string }[] } };
  locationGroupZones: {
    nodes: {
      zone: { name: string; countries: RawCountry[] };
      methodDefinitions: { nodes: RawMethod[] };
    }[];
  };
};

/**
 * Reads one source profile and turns it into a portable plan: locations
 * and products by name and handle, zones and flat or conditional rates as
 * their input. Carrier-calculated rates are left out and listed in
 * `skipped`. Throws on a GraphQL error.
 */
export async function planDeliveryProfile(
  admin: AdminApiContext,
  id: string,
): Promise<PlannedDeliveryProfile | null> {
  const response = await admin.graphql(DELIVERY_PROFILE_DETAIL_QUERY, {
    variables: { id },
  });
  const body = (await response.json()) as {
    data?: {
      deliveryProfile?: {
        name: string;
        default: boolean;
        profileItems: {
          nodes: { product: { handle: string } }[];
          pageInfo: { hasNextPage: boolean };
        };
        profileLocationGroups: RawGroup[];
      } | null;
    };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  const profile = body.data?.deliveryProfile;
  if (!profile) return null;

  const skipped: PlannedDeliveryProfile["skipped"] = [];
  if (profile.profileItems.pageInfo.hasNextPage) {
    skipped.push({
      item: "Products",
      reason: "Only the first 250 products in this profile sync.",
    });
  }
  const locationGroups = profile.profileLocationGroups.map((group) => ({
    locations: group.locationGroup.locations.nodes.map((l) => l.name),
    zones: group.locationGroupZones.nodes.map(({ zone, methodDefinitions }) => {
      const methods = methodDefinitions.nodes.filter((method) => {
        if (method.rateProvider.__typename === "DeliveryRateDefinition") {
          return true;
        }
        skipped.push({
          item: `${zone.name} > ${method.name}`,
          reason:
            "It's a carrier-calculated rate. Set up the carrier on this store, then add the rate there.",
        });
        return false;
      });
      return {
        name: zone.name,
        countries: zone.countries.map(countryInput),
        methods: methods.map(planMethod),
      };
    }),
  }));
  return {
    name: profile.name,
    isDefault: profile.default,
    products: profile.default
      ? []
      : profile.profileItems.nodes.map((item) => item.product.handle),
    locationGroups,
    skipped,
  };
}
