import { collectionRulesKey } from "./definitionKey";
import { buildSourceInputs } from "./collectionRuleInputs.server";
import type { PlannedRules } from "./collectionRules.server";
import { createOne, readTopLevelErrors } from "./runMutation.server";
import { COLLECTION_UPDATE_MUTATION } from "./syncQueries.server";
import type { SyncItemResult, SyncStep } from "./syncTarget.server";

/** Scope read_products. Shareable sources belong to other apps, so
 * they're kept when the rules are replaced. */
const TARGET_COLLECTION_SOURCES_QUERY = `#graphql
  query TargetCollectionSources($handle: String!) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id
      sources {
        id
        ... on CollectionConditionsSource { shareable }
      }
    }
  }
`;

interface TargetCollection {
  id: string;
  sources: { id: string; shareable?: boolean }[];
}

/**
 * Replaces one collection's rules on the target with the source's, in a
 * single `collectionUpdate` (`sourcesToDelete` + `sourcesToCreate`). Runs
 * after every collection shell and metaobject entry in the job, so rules
 * pointing at them resolve. When something a rule points at isn't on the
 * target, the target's rules are left alone and the reason is recorded.
 */
export function collectionRulesStep(
  handle: string,
  rules: PlannedRules,
): SyncStep {
  return async (ctx) => {
    const key = collectionRulesKey(handle);
    const item = (
      status: SyncItemResult["status"],
      errorMessage: string | null = null,
    ): SyncItemResult[] => [{ key, kind: "DEFINITION", status, errorMessage }];
    if ("skipped" in rules) return item("SKIPPED", rules.skipped);

    try {
      const response = await ctx.targetAdmin.graphql(
        TARGET_COLLECTION_SOURCES_QUERY,
        { variables: { handle } },
      );
      const body = (await response.json()) as {
        data?: { collectionByIdentifier?: TargetCollection | null };
      };
      const error = readTopLevelErrors(body);
      if (error) return item("FAILED", error);
      const target = body.data?.collectionByIdentifier;
      if (!target) {
        return item("FAILED", "The collection isn't on this store.");
      }

      const built = await buildSourceInputs(
        { targetAdmin: ctx.targetAdmin, cache: ctx.targetIds },
        rules.sources,
      );
      if ("skipped" in built) return item("SKIPPED", built.skipped);

      const result = await createOne(
        ctx.targetAdmin,
        COLLECTION_UPDATE_MUTATION,
        {
          collection: {
            id: target.id,
            sourcesToDelete: target.sources
              .filter((source) => !source.shareable)
              .map((source) => source.id),
            sourcesToCreate: built.inputs,
          },
        },
      );
      return result.ok ? item("SUCCEEDED") : item("FAILED", result.error);
    } catch (err) {
      return item("FAILED", err instanceof Error ? err.message : String(err));
    }
  };
}
