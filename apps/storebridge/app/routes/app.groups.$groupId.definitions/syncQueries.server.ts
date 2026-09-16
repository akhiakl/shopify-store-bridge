/**
 * GraphQL documents for syncToTarget — split out of syncTarget.server.ts
 * once that file started pushing past the 300-line limit (AGENTS.md §5).
 * Purely data (tagged template strings); no logic lives here.
 *
 * Mutation shapes confirmed via Shopify's Admin GraphQL schema
 * (`graphql_schema` on `MetaobjectDefinitionCreateInput` /
 * `MetafieldDefinitionInput`) and `search_docs_chunks` for required scopes:
 * `write_metaobject_definitions` for the metaobject mutation (confirmed);
 * metafield definitions need the write scope matching their owner type
 * (e.g. `write_products`) — same "confirm per owner type as it's actually
 * used" stance `definitions.server.ts` already takes for the read side.
 */
export const METAOBJECT_DEFINITION_CREATE_MUTATION = `#graphql
  mutation MetaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id }
      userErrors { field message code }
    }
  }
`;

export const METAFIELD_DEFINITION_CREATE_MUTATION = `#graphql
  mutation MetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

/**
 * Shop metafield value sync: once a SHOP-owned metafield definition exists
 * on a target (created or already there), also copy its current value —
 * there's exactly one Shop per store, so unlike Product/Customer/Order
 * metafields there's no cross-store record to match up first. Confirmed
 * via schema: `Shop.metafield(namespace, key)`, `MetafieldsSetInput`/
 * `MetafieldsSetPayload`. `metafieldsSet` is itself an upsert — no
 * `TAKEN`-style duplicate error exists for it, so it needs no idempotency
 * handling of its own.
 */
export const SHOP_METAFIELD_VALUE_QUERY = `#graphql
  query ShopMetafieldValue($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) {
        value
        type
      }
    }
  }
`;

export const SHOP_ID_QUERY = `#graphql
  query ShopId {
    shop { id }
  }
`;

export const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message code }
    }
  }
`;
