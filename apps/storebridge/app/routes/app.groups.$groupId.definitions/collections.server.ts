import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/**
 * Confirmed via `validate_graphql_codeblocks`: valid query shape, required
 * scope read_products (covered by write_products, see shopify.app.toml).
 * Product membership is deliberately not read — a manual collection's
 * product list is cross-store record matching (#63), and a smart
 * collection's membership is computed from `ruleSet` on the target anyway.
 */
const COLLECTIONS_QUERY = `#graphql
  query CollectionsList {
    collections(first: 250) {
      nodes {
        handle
        title
        descriptionHtml
        sortOrder
        templateSuffix
        seo { title description }
        ruleSet {
          appliedDisjunctively
          rules { column relation condition }
        }
      }
    }
  }
`;

export interface CollectionRule {
  column: string;
  relation: string;
  condition: string;
}

export interface CollectionRow {
  handle: string;
  title: string;
  descriptionHtml: string;
  sortOrder: string;
  templateSuffix: string | null;
  seo: { title: string | null; description: string | null };
  /** `null` for a manual collection. */
  ruleSet: { appliedDisjunctively: boolean; rules: CollectionRule[] } | null;
}

export async function getCollections(
  admin: AdminApiContext,
): Promise<CollectionRow[]> {
  const response = await admin.graphql(COLLECTIONS_QUERY);
  const { data } = await response.json();
  return data?.collections?.nodes ?? [];
}
