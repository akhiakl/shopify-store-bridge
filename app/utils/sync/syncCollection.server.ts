import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type { PlannedRules } from "./collectionRules.server";
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

/** A collection's shell plus, once planned, its rules. Plans queued
 * before rule sync existed carry no `rules`. */
export type PlannedCollection = CollectionRow & { rules?: PlannedRules };

/**
 * Upserts one collection's shell (title, description, SEO, sort order,
 * template) onto a target, matched by handle. Its rules sync in a later
 * step (syncCollectionRules.server.ts), once every collection and entry
 * they can point at exists on the target.
 */
export async function syncCollection(
  targetAdmin: AdminApiContext,
  planned: PlannedCollection,
): Promise<CreateResult> {
  // Only the shell fields: the collection inputs reject anything else.
  const { handle, title, descriptionHtml, sortOrder, templateSuffix, seo } =
    planned;
  const collection = {
    handle,
    title,
    descriptionHtml,
    sortOrder,
    templateSuffix,
    seo,
  };
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
