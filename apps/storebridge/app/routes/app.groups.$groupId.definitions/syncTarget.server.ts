import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type {
  MetafieldDefinitionRow,
  MetaobjectDefinitionRow,
  ShopPolicyRow,
} from "./definitions.server";
import type { CollectionRow } from "./collections.server";
import {
  collectionKey,
  metafieldDefinitionKey,
  metaobjectDefinitionKey,
  metaobjectEntryKey,
  shopPolicyKey,
} from "./definitionKey";
import type { MetaobjectEntryRow } from "./metaobjectEntries.server";
import {
  syncMetaobjectEntry,
  type TargetIdCache,
} from "./syncMetaobjectEntry.server";
import { syncCollection } from "./syncCollection.server";
import {
  METAFIELD_DEFINITION_CREATE_MUTATION,
  METAFIELDS_SET_MUTATION,
  METAOBJECT_DEFINITION_CREATE_MUTATION,
  SHOP_ID_QUERY,
  SHOP_METAFIELD_VALUE_QUERY,
  SHOP_POLICY_UPDATE_MUTATION,
} from "./syncQueries.server";
import {
  createOne,
  readTopLevelErrors,
  type CreateResult,
} from "./runMutation.server";

/** Copies one SHOP metafield's current value from source to target — a
 * no-op (not a failure) if the source has no value set yet for it. A
 * top-level GraphQL error reading the source (missing scope, bad query) is
 * a real failure, not "no value set" — reported the same way `createOne`
 * reports one on the write side, rather than silently recording SKIPPED. */
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
  const sourceBody = (await sourceResponse.json()) as {
    data?: { shop?: { metafield?: { value: string; type: string } | null } };
  };
  const errorMessage = readTopLevelErrors(sourceBody);
  if (errorMessage) {
    return { ok: false, error: errorMessage };
  }
  const metafield = sourceBody.data?.shop?.metafield;
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
 * the checkbox UI and sync.server.ts's parseSelection already use (see
 * definitionKey.ts). */
export interface SyncItemResult {
  key: string;
  kind: "DEFINITION" | "VALUE";
  status: "SUCCEEDED" | "SKIPPED" | "FAILED";
  errorMessage: string | null;
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
  shopPolicies = [],
  collections = [],
  metaobjectEntries = [],
}: {
  sourceAdmin: AdminApiContext;
  targetAdmin: AdminApiContext;
  metaobjectDefinitions: MetaobjectDefinitionRow[];
  metafieldDefinitions: MetafieldDefinitionRow[];
  shopPolicies?: ShopPolicyRow[];
  collections?: CollectionRow[];
  metaobjectEntries?: MetaobjectEntryRow[];
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
      key: metaobjectDefinitionKey(def),
      kind: "DEFINITION",
      result,
    });
  }

  const shopOwnedDefs = metafieldDefinitions.filter(
    (def) => def.ownerType === "SHOP",
  );
  const targetShopId = await resolveTargetShopId(targetAdmin, shopOwnedDefs);

  for (const def of metafieldDefinitions) {
    const key = metafieldDefinitionKey(def);
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

  // Shop policies are pure text (no cross-store record reference), and
  // `shopPolicyUpdate` is itself an upsert keyed by `type` — no separate
  // create-vs-update step, and no "already exists" case to treat as
  // skipped. Tallied as `kind: "VALUE"` (reusing the existing enum value
  // rather than adding a DB migration) since a policy's body is content,
  // not a schema/definition.
  for (const policy of shopPolicies) {
    const result = await createOne(targetAdmin, SHOP_POLICY_UPDATE_MUTATION, {
      shopPolicy: { type: policy.type, body: policy.body },
    });
    tally({
      tallies,
      items,
      key: shopPolicyKey(policy.type),
      kind: "VALUE",
      result,
    });
  }

  // A collection's shell is structure, not content — tallied as DEFINITION.
  for (const collection of collections) {
    const result = await syncCollection(targetAdmin, collection);
    tally({
      tallies,
      items,
      key: collectionKey(collection.handle),
      kind: "DEFINITION",
      result,
    });
  }

  // After definitions, so a definition created in this run exists before
  // its entries. Entries arrive dependency-ordered (getMetaobjectEntries).
  const targetIds: TargetIdCache = new Map();
  for (const entry of metaobjectEntries) {
    const result = await syncMetaobjectEntry(targetAdmin, entry, targetIds);
    tally({
      tallies,
      items,
      key: metaobjectEntryKey(entry),
      kind: "VALUE",
      result,
    });
  }

  return { tallies, items };
}
