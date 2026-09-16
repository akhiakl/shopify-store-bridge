import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { eq } from "drizzle-orm";

import db from "~/db.server";
import { syncGroups } from "~/db/schema.server";

/**
 * Metafield definitions are queried per `MetafieldOwnerType`, not as one
 * flat list — this is a reduced set of the most common owner types, not
 * the full enum. Extend as needed; each entry is one extra query, not a
 * schema change.
 */
const METAFIELD_OWNER_TYPES = [
  "PRODUCT",
  "PRODUCTVARIANT",
  "COLLECTION",
  "CUSTOMER",
  "ORDER",
  "PAGE",
  "BLOG",
  "ARTICLE",
  "SHOP",
] as const;

/**
 * Query shape confirmed via `validate_graphql_codeblocks` against
 * Shopify's live schema. It reported no required-scope line for this
 * particular query — Shopify's own docs say reading definitions needs
 * scope appropriate to the owner type, so that's not treated as "no scope
 * needed"; see shopify.app.toml's comment for what's actually declared.
 */
const METAFIELD_DEFINITIONS_QUERY = `#graphql
  query MetafieldDefinitionsByOwner($ownerType: MetafieldOwnerType!) {
    metafieldDefinitions(ownerType: $ownerType, first: 250) {
      nodes {
        id
        name
        namespace
        key
        description
        type { name }
      }
    }
  }
`;

/**
 * Confirmed via `validate_graphql_codeblocks`: valid query shape,
 * required scope read_metaobject_definitions (see shopify.app.toml).
 */
const METAOBJECT_DEFINITIONS_QUERY = `#graphql
  query MetaobjectDefinitionsList {
    metaobjectDefinitions(first: 250) {
      nodes {
        id
        type
        name
        fieldDefinitions {
          name
          key
          required
          type { name }
        }
      }
    }
  }
`;

export interface MetafieldDefinitionRow {
  id: string;
  name: string;
  namespace: string;
  key: string;
  description: string | null;
  type: string;
  ownerType: (typeof METAFIELD_OWNER_TYPES)[number];
}

export interface MetaobjectFieldDefinition {
  name: string;
  key: string;
  required: boolean;
  type: string;
}

export interface MetaobjectDefinitionRow {
  id: string;
  type: string;
  name: string;
  /** Full field list — needed to recreate this type on a target store
   * (sync.server.ts); `fieldCount` below is just its length, kept so the
   * browse-only UI (MetaobjectDefinitionsSection) doesn't need to know
   * that. */
  fieldDefinitions: MetaobjectFieldDefinition[];
  fieldCount: number;
}

/** One `metafieldDefinitions` call per owner type — the API has no single
 * "all owner types" query (see the note above `METAFIELD_OWNER_TYPES`). */
async function fetchMetafieldDefinitions(
  admin: AdminApiContext,
): Promise<MetafieldDefinitionRow[]> {
  const results = await Promise.all(
    METAFIELD_OWNER_TYPES.map(async (ownerType) => {
      const response = await admin.graphql(METAFIELD_DEFINITIONS_QUERY, {
        variables: { ownerType },
      });
      const { data } = await response.json();
      const nodes = data?.metafieldDefinitions?.nodes ?? [];
      return nodes.map(
        (node: {
          id: string;
          name: string;
          namespace: string;
          key: string;
          description: string | null;
          type: { name: string };
        }) => ({
          id: node.id,
          name: node.name,
          namespace: node.namespace,
          key: node.key,
          description: node.description,
          type: node.type.name,
          ownerType,
        }),
      );
    }),
  );
  return results.flat();
}

async function fetchMetaobjectDefinitions(
  admin: AdminApiContext,
): Promise<MetaobjectDefinitionRow[]> {
  const response = await admin.graphql(METAOBJECT_DEFINITIONS_QUERY);
  const { data } = await response.json();
  const nodes = data?.metaobjectDefinitions?.nodes ?? [];
  return nodes.map(
    (node: {
      id: string;
      type: string;
      name: string;
      fieldDefinitions: {
        name: string;
        key: string;
        required: boolean;
        type: { name: string };
      }[];
    }) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      fieldDefinitions: node.fieldDefinitions.map((field) => ({
        name: field.name,
        key: field.key,
        required: field.required,
        type: field.type.name,
      })),
      fieldCount: node.fieldDefinitions.length,
    }),
  );
}

/** Confirms `groupId` is a sync group the current shop actually owns as
 * source, before letting it browse (and later, migrate into) that group. */
export async function getOwnedGroup(groupId: string, shop: string) {
  const group = await db.query.syncGroups.findFirst({
    where: eq(syncGroups.id, groupId),
    with: { source: true, targets: { with: { store: true } } },
  });
  return group && group.source.shop === shop ? group : null;
}

export async function getDefinitionCatalog(admin: AdminApiContext) {
  const [metafieldDefinitions, metaobjectDefinitions] = await Promise.all([
    fetchMetafieldDefinitions(admin),
    fetchMetaobjectDefinitions(admin),
  ]);
  return { metafieldDefinitions, metaobjectDefinitions };
}
