import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/**
 * Scope read_locations (covered by write_locations, see
 * shopify.app.toml). `locations` leaves out inactive locations and
 * fulfillment-service ("legacy") ones by default: active state isn't
 * synced, and a fulfillment service's location belongs to that app.
 */
const LOCATIONS_QUERY = `#graphql
  query LocationsList {
    locations(first: 250) {
      nodes {
        name
        isFulfillmentService
        fulfillsOnlineOrders
        address {
          address1
          address2
          city
          provinceCode
          countryCode
          zip
          phone
        }
      }
    }
  }
`;

export interface LocationAddressRow {
  address1: string | null;
  address2: string | null;
  city: string | null;
  provinceCode: string | null;
  countryCode: string | null;
  zip: string | null;
  phone: string | null;
}

export interface LocationRow {
  name: string;
  fulfillsOnlineOrders: boolean;
  address: LocationAddressRow;
}

export async function getLocations(
  admin: AdminApiContext,
): Promise<LocationRow[]> {
  const response = await admin.graphql(LOCATIONS_QUERY);
  const { data } = await response.json();
  const nodes: (LocationRow & { isFulfillmentService: boolean })[] =
    data?.locations?.nodes ?? [];
  return nodes
    .filter((node) => !node.isFulfillmentService)
    .map(({ name, fulfillsOnlineOrders, address }) => ({
      name,
      fulfillsOnlineOrders,
      address,
    }));
}
