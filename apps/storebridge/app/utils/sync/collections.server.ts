import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/**
 * Required scope read_products (covered by write_products, see
 * shopify.app.toml). Only the collection's shell is listed here; its
 * rules (the `sources` model) are read when a job is planned, by
 * collectionRules.server.ts.
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
      }
    }
  }
`;

export interface CollectionRow {
  handle: string;
  title: string;
  descriptionHtml: string;
  sortOrder: string;
  templateSuffix: string | null;
  seo: { title: string | null; description: string | null };
}

export async function getCollections(
  admin: AdminApiContext,
): Promise<CollectionRow[]> {
  const response = await admin.graphql(COLLECTIONS_QUERY);
  const { data } = await response.json();
  return data?.collections?.nodes ?? [];
}
