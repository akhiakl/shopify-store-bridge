import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type {
  DefinitionRef,
  PlannedCondition,
  PlannedGroup,
  PlannedSource,
} from "./collectionRules.server";
import { targetIdFor, type RecordRef } from "./metafieldReferences.server";
import { readTopLevelErrors } from "./runMutation.server";

/** Scope: the definition owner's read scope (read_products for product
 * definitions, covered by write_products). */
const METAFIELD_DEFINITION_ID_QUERY = `#graphql
  query MetafieldDefinitionId($identifier: MetafieldDefinitionIdentifierInput!) {
    metafieldDefinition(identifier: $identifier) { id }
  }
`;

/** A rule references something the target doesn't have. */
class MissingOnTarget extends Error {}

interface Lookup {
  targetAdmin: AdminApiContext;
  cache: Map<string, string>;
}

async function definitionId(
  { targetAdmin, cache }: Lookup,
  def: DefinitionRef,
): Promise<string> {
  const cacheKey = `Definition/${def.ownerType}/${def.namespace}/${def.key}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const response = await targetAdmin.graphql(METAFIELD_DEFINITION_ID_QUERY, {
    variables: { identifier: def },
  });
  const body = (await response.json()) as {
    data?: { metafieldDefinition?: { id: string } | null };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  const id = body.data?.metafieldDefinition?.id;
  if (!id) {
    throw new MissingOnTarget(
      `Its rules use the ${def.namespace}.${def.key} metafield definition, which isn't on this store.`,
    );
  }
  cache.set(cacheKey, id);
  return id;
}

async function recordId(lookup: Lookup, ref: RecordRef): Promise<string> {
  const id = await targetIdFor(lookup.targetAdmin, ref, lookup.cache);
  if (!id) {
    const what =
      ref.kind === "Metaobject"
        ? `the ${ref.type} entry ${ref.handle}`
        : ref.kind === "Customer"
          ? "a customer"
          : `${ref.kind.toLowerCase()} ${ref.handle}`;
    throw new MissingOnTarget(
      `Its rules use ${what}, which isn't on this store.`,
    );
  }
  return id;
}

async function conditionInput(lookup: Lookup, condition: PlannedCondition) {
  const input: Record<string, unknown> = { ...condition.input };
  if (condition.definition) {
    input.definitionId = await definitionId(lookup, condition.definition);
  }
  if (condition.metaobjects) {
    const ids: string[] = [];
    for (const { type, handle } of condition.metaobjects) {
      ids.push(await recordId(lookup, { kind: "Metaobject", type, handle }));
    }
    if (condition.metaobjectList) input.values = ids;
    else input.value = ids[0];
  }
  if (condition.collections) {
    const ids: string[] = [];
    for (const handle of condition.collections) {
      ids.push(await recordId(lookup, { kind: "Collection", handle }));
    }
    input.values = ids;
  }
  return { [condition.field]: input };
}

async function groupInput(lookup: Lookup, group: PlannedGroup) {
  const conditions = [];
  for (const condition of group.conditions) {
    conditions.push(await conditionInput(lookup, condition));
  }
  const selections = [];
  for (const handle of group.products) {
    // Inclusion and exclusion picks share this shape.
    selections.push({
      productId: await recordId(lookup, { kind: "Product", handle }),
    });
  }
  return {
    ...(group.matchType ? { matchType: group.matchType } : {}),
    conditions,
    selections,
  };
}

async function sourceInput(lookup: Lookup, source: PlannedSource) {
  if (source.kind === "subCollections") {
    const collectionIds: string[] = [];
    for (const handle of source.collections) {
      collectionIds.push(
        await recordId(lookup, { kind: "Collection", handle }),
      );
    }
    return {
      subCollections: {
        title: source.title,
        description: source.description,
        collectionIds,
      },
    };
  }
  return {
    source: {
      title: source.title,
      description: source.description,
      targetType: source.targetType,
      inclusion: await groupInput(lookup, source.inclusion),
      ...(source.exclusion
        ? { exclusion: await groupInput(lookup, source.exclusion) }
        : {}),
    },
  };
}

/**
 * The target's `CollectionCreateSourceTargetInput`s for a planned rule
 * set, or the reason they can't be built because something a rule points
 * at isn't on the target. Throws on a GraphQL error during a lookup.
 */
export async function buildSourceInputs(
  lookup: Lookup,
  sources: PlannedSource[],
): Promise<{ inputs: Record<string, unknown>[] } | { skipped: string }> {
  try {
    const inputs = [];
    for (const source of sources) {
      inputs.push(await sourceInput(lookup, source));
    }
    return { inputs };
  } catch (err) {
    if (err instanceof MissingOnTarget) return { skipped: err.message };
    throw err;
  }
}
