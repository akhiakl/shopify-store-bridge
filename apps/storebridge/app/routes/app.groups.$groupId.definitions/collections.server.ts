import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/**
 * Required scope read_products (covered by write_products, see
 * shopify.app.toml). Only the collection's own shell is read: product
 * membership is cross-store record matching (#63), and smart-collection
 * conditions live in the 2026-07 `sources` model, which isn't synced yet
 * (`ruleSet` is deprecated there and has no write-side equivalent).
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
