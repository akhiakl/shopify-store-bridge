import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type {
  MetafieldDefinitionRow,
  MetaobjectDefinitionRow,
} from "./definitions.server";

/**
 * Mutation shapes confirmed via Shopify's Admin GraphQL schema
 * (`graphql_schema` on `MetaobjectDefinitionCreateInput` /
 * `MetafieldDefinitionInput`) and `search_docs_chunks` for required scopes:
 * `write_metaobject_definitions` for the metaobject mutation (confirmed);
 * metafield definitions need the write scope matching their owner type
 * (e.g. `write_products`) — same "confirm per owner type as it's actually
 * used" stance `definitions.server.ts` already takes for the read side.
 */
const METAOBJECT_DEFINITION_CREATE_MUTATION = `#graphql
  mutation MetaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id }
      userErrors { field message code }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE_MUTATION = `#graphql
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
const SHOP_METAFIELD_VALUE_QUERY = `#graphql
  query ShopMetafieldValue($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) {
        value
        type
      }
    }
  }
`;

const SHOP_ID_QUERY = `#graphql
  query ShopId {
    shop { id }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message code }
    }
  }
`;

type CreateResult =
  { ok: true; skipped?: boolean } | { ok: false; error: string };

/** Runs one create mutation. A `TAKEN` userError code — confirmed via
 * `MetaobjectUserErrorCode`/`MetafieldDefinitionCreateUserErrorCode` — means
 * the definition already exists on the target; that's `skipped`, not
 * `failed`, so a clean re-run doesn't read as an error in job history. */
async function createOne(
  admin: AdminApiContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<CreateResult> {
  const response = await admin.graphql(query, { variables });
  const { data } = await response.json();
  const payload = Object.values(data ?? {})[0] as
    { userErrors: { message: string; code?: string }[] } | undefined;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length === 0) return { ok: true };
  if (userErrors.some((e) => e.code === "TAKEN")) {
    return { ok: true, skipped: true };
  }
  return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
}

/** Copies one SHOP metafield's current value from source to target — a
 * no-op (not a failure) if the source has no value set yet for it. */
async function syncShopMetafieldValue({
  sourceAdmin,
  targetAdmin,
  targetShopId,
  def,
}: {
  sourceAdmin: AdminApiContext;
  targetAdmin: AdminApiContext;
  targetShopId: string;
  def: MetafieldDefinitionRow;
}): Promise<CreateResult> {
  const sourceResponse = await sourceAdmin.graphql(SHOP_METAFIELD_VALUE_QUERY, {
    variables: { namespace: def.namespace, key: def.key },
  });
  const { data: sourceData } = await sourceResponse.json();
  const metafield = sourceData?.shop?.metafield as
    { value: string; type: string } | null | undefined;
  if (!metafield) return { ok: true, skipped: true };

  return createOne(targetAdmin, METAFIELDS_SET_MUTATION, {
    metafields: [
      {
        ownerId: targetShopId,
        namespace: def.namespace,
        key: def.key,
        value: metafield.value,
        type: metafield.type,
      },
    ],
  });
}

export interface SyncTally {
  itemsSynced: number;
  itemsSkipped: number;
  itemsFailed: number;
}

function tally(tallies: SyncTally, result: CreateResult): void {
  if (!result.ok) tallies.itemsFailed++;
  else if (result.skipped) tallies.itemsSkipped++;
  else tallies.itemsSynced++;
}

/** Only fetched when there's actually a SHOP-owned definition selected —
 * one extra query per target, not per item. */
async function resolveTargetShopId(
  targetAdmin: AdminApiContext,
  shopOwnedDefs: MetafieldDefinitionRow[],
): Promise<string | undefined> {
  if (shopOwnedDefs.length === 0) return undefined;
  const response = await targetAdmin.graphql(SHOP_ID_QUERY);
  const { data } = await response.json();
  return data?.shop?.id;
}

/** Pushes the given definitions (and, for SHOP-owned metafields, their
 * current value) from source to one target. Called once per approved
 * target by runSyncJob. */
export async function syncToTarget({
  sourceAdmin,
  targetAdmin,
  metaobjectDefinitions,
  metafieldDefinitions,
}: {
  sourceAdmin: AdminApiContext;
  targetAdmin: AdminApiContext;
  metaobjectDefinitions: MetaobjectDefinitionRow[];
  metafieldDefinitions: MetafieldDefinitionRow[];
}): Promise<SyncTally> {
  const tallies: SyncTally = {
    itemsSynced: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  for (const def of metaobjectDefinitions) {
    const result = await createOne(
      targetAdmin,
      METAOBJECT_DEFINITION_CREATE_MUTATION,
      {
        definition: {
          type: def.type,
          name: def.name,
          fieldDefinitions: def.fieldDefinitions.map((field) => ({
            key: field.key,
            name: field.name,
            type: field.type,
            required: field.required,
          })),
        },
      },
    );
    tally(tallies, result);
  }

  const shopOwnedDefs = metafieldDefinitions.filter(
    (def) => def.ownerType === "SHOP",
  );
  const targetShopId = await resolveTargetShopId(targetAdmin, shopOwnedDefs);

  for (const def of metafieldDefinitions) {
    const result = await createOne(
      targetAdmin,
      METAFIELD_DEFINITION_CREATE_MUTATION,
      {
        definition: {
          namespace: def.namespace,
          key: def.key,
          name: def.name,
          description: def.description ?? undefined,
          type: def.type,
          ownerType: def.ownerType,
        },
      },
    );
    tally(tallies, result);

    // Definition confirmed on the target (created or already there) — now
    // ride the value along, SHOP owner only (see syncShopMetafieldValue).
    if (result.ok && def.ownerType === "SHOP" && targetShopId) {
      const valueResult = await syncShopMetafieldValue({
        sourceAdmin,
        targetAdmin,
        targetShopId,
        def,
      });
      tally(tallies, valueResult);
    }
  }

  return tallies;
}
