import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type { LocationRow } from "./locations.server";
import {
  createOne,
  readTopLevelErrors,
  type CreateResult,
} from "./runMutation.server";

/** Scope read_locations. Inactive locations are included so a match is
 * edited rather than duplicated; fulfillment-service ones are too, so
 * their names are never claimed. */
const TARGET_LOCATIONS_QUERY = `#graphql
  query TargetLocations {
    locations(first: 250, includeInactive: true, includeLegacy: true) {
      nodes { id name isFulfillmentService }
    }
  }
`;

/** Scope write_locations. */
const LOCATION_ADD_MUTATION = `#graphql
  mutation LocationAdd($input: LocationAddInput!) {
    locationAdd(input: $input) {
      location { id }
      userErrors { field message code }
    }
  }
`;

const LOCATION_EDIT_MUTATION = `#graphql
  mutation LocationEdit($id: ID!, $input: LocationEditInput!) {
    locationEdit(id: $id, input: $input) {
      location { id }
      userErrors { field message code }
    }
  }
`;

/** Only the fields an address input accepts, without nulls. */
function addressInput(address: LocationRow["address"]) {
  return Object.fromEntries(
    Object.entries(address).filter(([, value]) => value !== null),
  );
}

/**
 * Upserts one location by exact name, which Shopify keeps unique per
 * store: a match gets the source's address and online-order setting, and
 * no match is created. Active state is left to each store. A name held by
 * a fulfillment service's location can't be edited, so that fails.
 */
export async function syncLocation(
  targetAdmin: AdminApiContext,
  location: LocationRow,
): Promise<CreateResult> {
  const response = await targetAdmin.graphql(TARGET_LOCATIONS_QUERY);
  const body = (await response.json()) as {
    data?: {
      locations?: {
        nodes: { id: string; name: string; isFulfillmentService: boolean }[];
      };
    };
  };
  const error = readTopLevelErrors(body);
  if (error) return { ok: false, error };

  const match = body.data?.locations?.nodes.find(
    (node) => node.name === location.name,
  );
  if (match?.isFulfillmentService) {
    return {
      ok: false,
      error: "A fulfillment service's location on this store has this name.",
    };
  }
  const fields = {
    fulfillsOnlineOrders: location.fulfillsOnlineOrders,
    address: addressInput(location.address),
  };
  return match
    ? createOne(targetAdmin, LOCATION_EDIT_MUTATION, {
        id: match.id,
        input: fields,
      })
    : createOne(targetAdmin, LOCATION_ADD_MUTATION, {
        input: { name: location.name, ...fields },
      });
}
