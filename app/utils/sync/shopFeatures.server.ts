import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { readTopLevelErrors } from "./runMutation.server";

const MARKET_DRIVEN_SHIPPING_QUERY = `#graphql
  query MarketDrivenShipping {
    shop { features { marketDrivenShipping } }
  }
`;

/** Whether the store sets shipping rates per market (market-driven
 * shipping) rather than in delivery profiles. Throws on a GraphQL error. */
export async function usesMarketDrivenShipping(
  admin: AdminApiContext,
): Promise<boolean> {
  const response = await admin.graphql(MARKET_DRIVEN_SHIPPING_QUERY);
  const body = (await response.json()) as {
    data?: { shop?: { features: { marketDrivenShipping: boolean } } };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  return body.data?.shop?.features.marketDrivenShipping ?? false;
}
