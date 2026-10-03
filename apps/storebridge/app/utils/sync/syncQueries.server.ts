/**
 * GraphQL documents for the sync steps — split out of syncTarget.server.ts
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

/**
 * Shop policy sync: pure text content (no cross-store record reference,
 * unlike Product/Customer/Order-owned data), so unlike menus it needs no
 * record-matching story — `shopPolicyUpdate` is itself an upsert keyed by
 * `type`. Confirmed via `validate_graphql_codeblocks` against Shopify's
 * live schema: `ShopPolicyInput`/`ShopPolicyUpdatePayload`, required scopes
 * write_legal_policies + read_legal_policies (see shopify.app.toml).
 */
/**
 * Collection sync is an upsert keyed by `handle` (the only identifier the
 * two stores share): look the handle up on the target, then update the
 * match or create a new one. `collectionCreate` has no `TAKEN`-style error
 * for a duplicate handle — Shopify silently suffixes it — so create-only
 * would duplicate collections on every re-run. Uses the 2026-07
 * `collection:` argument — the older `input: CollectionInput` is deprecated
 * there and codegen rejects it; the new inputs carry no `ruleSet` (smart
 * conditions moved to `sources`, not synced yet). Scopes: read_products /
 * write_products.
 */
export const COLLECTION_BY_HANDLE_QUERY = `#graphql
  query CollectionByHandle($handle: String!) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id
    }
  }
`;

export const COLLECTION_CREATE_MUTATION = `#graphql
  mutation CollectionCreate($collection: CollectionCreateInput!) {
    collectionCreate(collection: $collection) {
      collection { id }
      userErrors { field message }
    }
  }
`;

export const COLLECTION_UPDATE_MUTATION = `#graphql
  mutation CollectionUpdate($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id }
      userErrors { field message }
    }
  }
`;

export const SHOP_POLICY_UPDATE_MUTATION = `#graphql
  mutation ShopPolicyUpdate($shopPolicy: ShopPolicyInput!) {
    shopPolicyUpdate(shopPolicy: $shopPolicy) {
      shopPolicy { id }
      userErrors { field message }
    }
  }
`;

/**
 * Metaobject entry sync: upsert keyed by (type, handle), the identity both
 * stores share. The `metaobject` argument updates only the fields given;
 * the alternative `values` argument is a full replacement, but its JSON
 * shape per field type isn't described by the schema, so it isn't used.
 * Checked against the pinned 2026-10 schema: write_metaobjects.
 */
export const METAOBJECT_UPSERT_MUTATION = `#graphql
  mutation MetaobjectUpsert(
    $handle: MetaobjectHandleInput!
    $metaobject: MetaobjectUpsertInput!
  ) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message code }
    }
  }
`;

export const METAOBJECT_ID_BY_HANDLE_QUERY = `#graphql
  query MetaobjectIdByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) { id }
  }
`;

/**
 * Metafield value sync (#63 phase 2). The source is read per batch when a
 * step runs, so handles, emails and values never sit in the persisted
 * plan. Owners are matched on the target by natural key: products and
 * collections by handle, customers by email. Checked against the pinned
 * 2026-10 schema; scopes read_products / read_customers (covered by the
 * declared write_* scopes). Customer email is protected customer data and
 * needs the app's Partner Dashboard access approval.
 */
export const METAFIELD_VALUE_SOURCES_QUERY = `#graphql
  query MetafieldValueSources($ids: [ID!]!, $namespace: String!, $key: String!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        handle
        metafield(namespace: $namespace, key: $key) { type value }
      }
      ... on Collection {
        id
        handle
        metafield(namespace: $namespace, key: $key) { type value }
      }
      ... on Customer {
        id
        defaultEmailAddress { emailAddress }
        metafield(namespace: $namespace, key: $key) { type value }
      }
    }
  }
`;

export const METAFIELD_REFERENCES_QUERY = `#graphql
  query MetafieldReferences($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Product { id handle }
      ... on Collection { id handle }
      ... on Metaobject { id type handle }
    }
  }
`;

export const PRODUCT_ID_BY_HANDLE_QUERY = `#graphql
  query ProductIdByHandle($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) { id }
  }
`;

export const CUSTOMER_ID_BY_EMAIL_QUERY = `#graphql
  query CustomerIdByEmail($emailAddress: String!) {
    customerByIdentifier(identifier: { emailAddress: $emailAddress }) { id }
  }
`;
