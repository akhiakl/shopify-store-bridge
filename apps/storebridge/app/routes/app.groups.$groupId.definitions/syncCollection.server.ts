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

/** Rule columns whose condition needs a `conditionObjectId` pointing at a
 * metafield definition on the *source* store — there's no mapping to the
 * target's equivalent definition yet, so these can't be recreated. */
const UNSUPPORTED_RULE_COLUMNS = new Set([
  "PRODUCT_METAFIELD_DEFINITION",
  "VARIANT_METAFIELD_DEFINITION",
]);

function toCollectionInput(collection: CollectionRow) {
  return {
    handle: collection.handle,
    title: collection.title,
    descriptionHtml: collection.descriptionHtml,
    sortOrder: collection.sortOrder,
    templateSuffix: collection.templateSuffix,
    seo: collection.seo,
    ...(collection.ruleSet && { ruleSet: collection.ruleSet }),
  };
}

/**
 * Upserts one collection's shell (title, description, SEO, sort order,
 * smart-collection rules) onto a target, matched by handle. A manual
 * collection lands as an empty shell — its product list is cross-store
 * record matching (#63), not something this can resolve.
 */
export async function syncCollection(
  targetAdmin: AdminApiContext,
  collection: CollectionRow,
): Promise<CreateResult> {
  const unsupported = collection.ruleSet?.rules.find((rule) =>
    UNSUPPORTED_RULE_COLUMNS.has(rule.column),
  );
  if (unsupported) {
    return {
      ok: false,
      error: `Rule on ${unsupported.column} references a metafield definition, which can't be synced yet.`,
    };
  }

  const response = await targetAdmin.graphql(COLLECTION_BY_HANDLE_QUERY, {
    variables: { handle: collection.handle },
  });
  const body = (await response.json()) as {
    data?: { collectionByIdentifier?: { id: string } | null };
  };
  const errorMessage = readTopLevelErrors(body);
  if (errorMessage) return { ok: false, error: errorMessage };

  const existingId = body.data?.collectionByIdentifier?.id;
  const input = toCollectionInput(collection);
  return existingId
    ? createOne(targetAdmin, COLLECTION_UPDATE_MUTATION, {
        input: { ...input, id: existingId },
      })
    : createOne(targetAdmin, COLLECTION_CREATE_MUTATION, { input });
}
