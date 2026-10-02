import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type { CollectionRow } from "./collections.server";
import {
  createOne,
  readTopLevelErrors,
  type CreateResult,
} from "./runMutation.server";
import {
  COLLECTION_BY_HANDLE_QUERY,
  COLLECTION_CREATE_MUTATION,
  COLLECTION_UPDATE_MUTATION,
} from "./syncQueries.server";

/**
 * Upserts one collection's shell (title, description, SEO, sort order,
 * template) onto a target, matched by handle. Products and smart-collection
 * conditions aren't carried over, so the target collection starts empty.
 */
export async function syncCollection(
  targetAdmin: AdminApiContext,
  collection: CollectionRow,
): Promise<CreateResult> {
  const response = await targetAdmin.graphql(COLLECTION_BY_HANDLE_QUERY, {
    variables: { handle: collection.handle },
  });
  const body = (await response.json()) as {
    data?: { collectionByIdentifier?: { id: string } | null };
  };
  const errorMessage = readTopLevelErrors(body);
  if (errorMessage) return { ok: false, error: errorMessage };

  const existingId = body.data?.collectionByIdentifier?.id;
  return existingId
    ? createOne(targetAdmin, COLLECTION_UPDATE_MUTATION, {
        collection: { ...collection, id: existingId },
      })
    : createOne(targetAdmin, COLLECTION_CREATE_MUTATION, { collection });
}
