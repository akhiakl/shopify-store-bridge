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
 * as a `SyncJobItem` row by the sync worker, so job history can show which
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

function toItem(
  key: string,
  kind: SyncItemResult["kind"],
  result: CreateResult,
): SyncItemResult {
  if (!result.ok) {
    return { key, kind, status: "FAILED", errorMessage: result.error };
  }
  return {
    key,
    kind,
    status: result.skipped ? "SKIPPED" : "SUCCEEDED",
    errorMessage: null,
  };
}

export function tallyItems(items: SyncItemResult[]): SyncTally {
  return {
    itemsSynced: items.filter((i) => i.status === "SUCCEEDED").length,
    itemsSkipped: items.filter((i) => i.status === "SKIPPED").length,
    itemsFailed: items.filter((i) => i.status === "FAILED").length,
  };
}

/** Everything one sync job pushes, read from the source once. Persisted on
 * the job, so it must stay plain JSON. */
export interface SyncPlan {
  metaobjectDefinitions: MetaobjectDefinitionRow[];
  metafieldDefinitions: MetafieldDefinitionRow[];
  shopPolicies: ShopPolicyRow[];
  collections: CollectionRow[];
  metaobjectEntries: MetaobjectEntryRow[];
}

/** Per-target state shared by that target's steps within one run. */
export interface StepContext {
  sourceAdmin: AdminApiContext;
  targetAdmin: AdminApiContext;
  targetIds: TargetIdCache;
  /** Fetched at most once, and only if a SHOP metafield value needs it. */
  targetShopId: () => Promise<string | undefined>;
}

async function fetchTargetShopId(
  targetAdmin: AdminApiContext,
): Promise<string | undefined> {
  const response = await targetAdmin.graphql(SHOP_ID_QUERY);
  const { data } = await response.json();
  return data?.shop?.id;
}

export function createStepContext(
  sourceAdmin: AdminApiContext,
  targetAdmin: AdminApiContext,
): StepContext {
  let shopId: Promise<string | undefined> | undefined;
  return {
    sourceAdmin,
    targetAdmin,
    targetIds: new Map(),
    targetShopId: () => (shopId ??= fetchTargetShopId(targetAdmin)),
  };
}

/** One unit of resumable work: usually one item, two for a SHOP metafield
 * (definition, then its value). */
export type SyncStep = (ctx: StepContext) => Promise<SyncItemResult[]>;

function metaobjectDefinitionStep(def: MetaobjectDefinitionRow): SyncStep {
  return async (ctx) => {
    const result = await createOne(
      ctx.targetAdmin,
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
    return [toItem(metaobjectDefinitionKey(def), "DEFINITION", result)];
  };
}

/** A SHOP-owned definition also carries its value once the definition is
 * confirmed on the target (created or already there). A missing target
 * Shop id is recorded as a failed VALUE item rather than skipped silently,
 * so the job can't report SUCCEEDED when the value never copied. */
function metafieldDefinitionStep(def: MetafieldDefinitionRow): SyncStep {
  return async (ctx) => {
    const key = metafieldDefinitionKey(def);
    const result = await createOne(
      ctx.targetAdmin,
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
    const items = [toItem(key, "DEFINITION", result)];
    if (!result.ok || def.ownerType !== "SHOP") return items;

    const targetShopId = await ctx.targetShopId();
    const valueResult: CreateResult = targetShopId
      ? await syncShopMetafieldValue({
          sourceAdmin: ctx.sourceAdmin,
          targetAdmin: ctx.targetAdmin,
          targetShopId,
          def,
        })
      : { ok: false, error: "Could not resolve the target store's Shop id." };
    return [...items, toItem(key, "VALUE", valueResult)];
  };
}

/**
 * The plan as an ordered list of steps. The order must be deterministic:
 * the background worker saves how many steps a target has finished and
 * resumes from that index in a later run. Definitions come before entries,
 * so a definition created in this job exists before its entries; entries
 * arrive dependency-ordered from getMetaobjectEntries.
 *
 * Shop policies are tallied as VALUE (their body is content) and
 * collections as DEFINITION (a collection shell is structure).
 */
export function buildSyncSteps(plan: SyncPlan): SyncStep[] {
  return [
    ...plan.metaobjectDefinitions.map(metaobjectDefinitionStep),
    ...plan.metafieldDefinitions.map(metafieldDefinitionStep),
    ...plan.shopPolicies.map((policy): SyncStep => async (ctx) => [
      toItem(
        shopPolicyKey(policy.type),
        "VALUE",
        await createOne(ctx.targetAdmin, SHOP_POLICY_UPDATE_MUTATION, {
          shopPolicy: { type: policy.type, body: policy.body },
        }),
      ),
    ]),
    ...plan.collections.map((collection): SyncStep => async (ctx) => [
      toItem(
        collectionKey(collection.handle),
        "DEFINITION",
        await syncCollection(ctx.targetAdmin, collection),
      ),
    ]),
    ...plan.metaobjectEntries.map((entry): SyncStep => async (ctx) => [
      toItem(
        metaobjectEntryKey(entry),
        "VALUE",
        await syncMetaobjectEntry(ctx.targetAdmin, entry, ctx.targetIds),
      ),
    ]),
  ];
}

/** Runs `steps` from index `from` until they're done or `deadline` (epoch
 * ms) passes. The deadline is checked between steps, so a step that has
 * started always finishes. Returns the index to resume from. */
export async function runSyncSteps({
  steps,
  ctx,
  from = 0,
  deadline = Infinity,
}: {
  steps: SyncStep[];
  ctx: StepContext;
  from?: number;
  deadline?: number;
}): Promise<{ items: SyncItemResult[]; next: number }> {
  const items: SyncItemResult[] = [];
  let next = from;
  while (next < steps.length && Date.now() < deadline) {
    items.push(...(await steps[next](ctx)));
    next++;
  }
  return { items, next };
}
