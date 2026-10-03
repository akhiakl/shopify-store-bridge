import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type { MetafieldDefinitionRow } from "./definitions.server";
import { VALUE_CAP_PER_DEFINITION } from "./syncCaps";
import { isValueOwnerType, type ValueOwnerType } from "./valueOwnerTypes";

/** Checked against the pinned 2026-07 schema. */
const VALUE_OWNERS_QUERY = `#graphql
  query MetafieldValueOwners(
    $identifier: MetafieldDefinitionIdentifierInput!
    $after: String
  ) {
    metafieldDefinition(identifier: $identifier) {
      metafields(first: 250, after: $after) {
        nodes {
          owner {
            ... on Product { id }
            ... on Collection { id }
            ... on Customer { id }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

/**
 * One definition's values to sync. Holds only the owners' IDs: each step
 * reads the current value and the owner's handle or email from the source
 * when it runs, so customer emails and metafield values are never written
 * to StoreBridge's database (the plan is persisted on the job).
 */
export interface MetafieldValueSet {
  definition: {
    ownerType: ValueOwnerType;
    namespace: string;
    key: string;
  };
  ownerIds: string[];
}

interface OwnersPage {
  nodes: { owner: { id?: string } | null }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

async function fetchOwnerIds(
  admin: AdminApiContext,
  def: MetafieldValueSet["definition"],
): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  while (ids.length < VALUE_CAP_PER_DEFINITION) {
    const response: Response = await admin.graphql(VALUE_OWNERS_QUERY, {
      variables: { identifier: def, after },
    });
    const body = (await response.json()) as {
      data?: { metafieldDefinition?: { metafields: OwnersPage } | null };
    };
    const page = body.data?.metafieldDefinition?.metafields;
    for (const node of page?.nodes ?? []) {
      if (node.owner?.id) ids.push(node.owner.id);
    }
    if (!page?.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return ids.slice(0, VALUE_CAP_PER_DEFINITION);
}

/** Lists, for each definition, the records on the source that have a
 * value for it (up to VALUE_CAP_PER_DEFINITION). Definitions with no
 * values are dropped. */
export async function getMetafieldValueSets(
  admin: AdminApiContext,
  definitions: MetafieldDefinitionRow[],
): Promise<MetafieldValueSet[]> {
  const sets = await Promise.all(
    definitions
      .filter((def) => isValueOwnerType(def.ownerType))
      .map(async (def) => {
        const definition = {
          ownerType: def.ownerType as ValueOwnerType,
          namespace: def.namespace,
          key: def.key,
        };
        return { definition, ownerIds: await fetchOwnerIds(admin, definition) };
      }),
  );
  return sets.filter((set) => set.ownerIds.length > 0);
}
