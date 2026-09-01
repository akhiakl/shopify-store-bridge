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
 * `failed`, so a clean re-run doesn't read as an error in job history.
 * Top-level GraphQL `errors` (a bad query, a missing scope) and a missing
 * response payload are both real failures — treating them as an empty
 * `userErrors` array (the pre-existing bug here) silently marked a job
 * SUCCEEDED when the mutation never actually ran. */
async function createOne(
  admin: AdminApiContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<CreateResult> {
  const response = await admin.graphql(query, { variables });
  // `admin.graphql`'s return type only declares `data` on the parsed body,
  // but the raw GraphQL response can carry a top-level `errors` array too
  // (a bad query, a missing scope) — this codebase doesn't have generated
  // types wired into these hand-written calls yet (see shopify.app.toml's
  // TODO on that), so this is cast the same loose way `payload` below is.
  const { data, errors } = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };
  if (errors) {
    const messages = Array.isArray(errors)
      ? errors.map((e: { message: string }) => e.message).join("; ")
      : String(errors);
    return { ok: false, error: messages };
  }
  const payload = Object.values(data ?? {})[0] as
    { userErrors: { message: string; code?: string }[] } | undefined;
  if (!payload) {
    return { ok: false, error: "Shopify returned an unexpected response." };
  }
  const userErrors = payload.userErrors ?? [];
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

/** One definition (or value-sync) attempt's outcome — persisted verbatim
 * as a `SyncJobItem` row by runSyncJob, so job history can show which
 * item failed, not just how many. `key` reuses the same
 * `metaobject:<type>` / `metafield:<ownerType>:<namespace>:<key>` format
 * the checkbox UI and sync.server.ts's parseSelection already use. */
export interface SyncItemResult {
  key: string;
  kind: "DEFINITION" | "VALUE";
  status: "SUCCEEDED" | "SKIPPED" | "FAILED";
  errorMessage: string | null;
}

function metaobjectKey(def: MetaobjectDefinitionRow): string {
  return `metaobject:${def.type}`;
}

function metafieldKey(def: MetafieldDefinitionRow): string {
  return `metafield:${def.ownerType}:${def.namespace}:${def.key}`;
}

function tally({
  tallies,
  items,
  key,
  kind,
  result,
}: {
  tallies: SyncTally;
  items: SyncItemResult[];
  key: string;
  kind: SyncItemResult["kind"];
  result: CreateResult;
}): void {
  if (!result.ok) {
    tallies.itemsFailed++;
    items.push({ key, kind, status: "FAILED", errorMessage: result.error });
  } else if (result.skipped) {
    tallies.itemsSkipped++;
    items.push({ key, kind, status: "SKIPPED", errorMessage: null });
  } else {
    tallies.itemsSynced++;
    items.push({ key, kind, status: "SUCCEEDED", errorMessage: null });
  }
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
}): Promise<{ tallies: SyncTally; items: SyncItemResult[] }> {
  const tallies: SyncTally = {
    itemsSynced: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
  const items: SyncItemResult[] = [];

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
    tally({
      tallies,
      items,
      key: metaobjectKey(def),
      kind: "DEFINITION",
      result,
    });
  }

  const shopOwnedDefs = metafieldDefinitions.filter(
    (def) => def.ownerType === "SHOP",
  );
  const targetShopId = await resolveTargetShopId(targetAdmin, shopOwnedDefs);

  for (const def of metafieldDefinitions) {
    const key = metafieldKey(def);
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
    tally({ tallies, items, key, kind: "DEFINITION", result });

    // Definition confirmed on the target (created or already there) — now
    // ride the value along, SHOP owner only (see syncShopMetafieldValue).
    // A missing targetShopId (the resolveTargetShopId call above failed —
    // permissions, a bad response) used to just skip this silently, which
    // let the job report SUCCEEDED even though the value never copied;
    // record it as a failed VALUE item instead so tallies/history show it.
    if (result.ok && def.ownerType === "SHOP") {
      const valueResult: CreateResult = targetShopId
        ? await syncShopMetafieldValue({
            sourceAdmin,
            targetAdmin,
            targetShopId,
            def,
          })
        : {
            ok: false,
            error: "Could not resolve the target store's Shop id.",
          };
      tally({ tallies, items, key, kind: "VALUE", result: valueResult });
    }
  }

  return { tallies, items };
}
