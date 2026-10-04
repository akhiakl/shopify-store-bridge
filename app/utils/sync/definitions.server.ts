import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/**
 * Metafield definitions are queried per `MetafieldOwnerType`, not as one
 * flat list: this is a reduced set of the most common owner types, not
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
 * particular query: Shopify's own docs say reading definitions needs
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
        metafieldsCount
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
        metaobjectsCount
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
  /** How many records on the source have a value for this definition:
   * shown so a merchant can see when value sync's per-job cap applies. */
  valueCount: number;
}

export interface MetaobjectFieldDefinition {
  name: string;
  key: string;
  required: boolean;
  type: string;
}

/**
 * Confirmed via `validate_graphql_codeblocks`: valid query shape, required
 * scope read_legal_policies (see shopify.app.toml). `ShopPolicy.id` isn't
 * needed here: `type` is the stable identifier `shopPolicyKey` and the
 * update mutation both key off.
 */
const SHOP_POLICIES_QUERY = `#graphql
  query ShopPoliciesList {
    shop {
      shopPolicies {
        type
        title
        body
      }
    }
  }
`;

export interface ShopPolicyRow {
  type: string;
  title: string;
  body: string;
}

export interface MetaobjectDefinitionRow {
  id: string;
  type: string;
  name: string;
  /** Full field list: needed to recreate this type on a target store
   * (sync.server.ts); `fieldCount` below is just its length, kept so the
   * browse-only UI (MetaobjectDefinitionsSection) doesn't need to know
   * that. */
  fieldDefinitions: MetaobjectFieldDefinition[];
  fieldCount: number;
  /** How many entries of this type exist on the source: shown so a
   * merchant can see when entry sync's per-run cap applies. */
  entryCount: number;
}

/** One `metafieldDefinitions` call per owner type: the API has no single
 * "all owner types" query (see the note above `METAFIELD_OWNER_TYPES`). */
export async function fetchMetafieldDefinitions(
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
          metafieldsCount: number | null;
          type: { name: string };
        }) => ({
          id: node.id,
          name: node.name,
          namespace: node.namespace,
          key: node.key,
          description: node.description,
          type: node.type.name,
          ownerType,
          valueCount: node.metafieldsCount ?? 0,
        }),
      );
    }),
  );
  return results.flat();
}

export async function fetchMetaobjectDefinitions(
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
      metaobjectsCount: number | null;
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
      entryCount: node.metaobjectsCount ?? 0,
    }),
  );
}

async function fetchShopPolicies(
  admin: AdminApiContext,
): Promise<ShopPolicyRow[]> {
  const response = await admin.graphql(SHOP_POLICIES_QUERY);
  const { data } = await response.json();
  return data?.shop?.shopPolicies ?? [];
}

export async function getDefinitionCatalog(admin: AdminApiContext) {
  const [metafieldDefinitions, metaobjectDefinitions] = await Promise.all([
    fetchMetafieldDefinitions(admin),
    fetchMetaobjectDefinitions(admin),
  ]);
  return { metafieldDefinitions, metaobjectDefinitions };
}

/** Kept separate from `getDefinitionCatalog`: shop policies are a distinct
 * sync category (no cross-store record reference, unlike metaobjects/
 * metafields) with their own section in the UI, not another field on the
 * same catalog shape. */
export async function getShopPolicies(
  admin: AdminApiContext,
): Promise<ShopPolicyRow[]> {
  return fetchShopPolicies(admin);
}
