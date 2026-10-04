import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type {
  MetafieldDefinitionRow,
  MetaobjectDefinitionRow,
  ShopPolicyRow,
} from "./definitions.server";
import type { CheckoutStyling } from "./checkoutBrandingInput";
import { collectionRulesStep } from "./syncCollectionRules.server";
import {
  CHECKOUT_STYLING_KEY,
  collectionKey,
  locationKey,
  metafieldDefinitionKey,
  metafieldValuesKey,
  metaobjectDefinitionKey,
  metaobjectEntryKey,
  shopPolicyKey,
} from "./definitionKey";
import type { MetaobjectEntryRow } from "./metaobjectEntries.server";
import type { MetafieldValueSet } from "./metafieldValues.server";
import type { PlannedMenu } from "./menus.server";
import type { LocationRow } from "./locations.server";
import { syncCheckoutStyling } from "./syncCheckoutStyling.server";
import { syncLocation } from "./syncLocation.server";
import { menuStep } from "./syncMenu.server";
import { metafieldValueSteps } from "./syncMetafieldValues.server";
import {
  syncMetaobjectEntry,
  type TargetIdCache,
} from "./syncMetaobjectEntry.server";
import {
  syncCollection,
  type PlannedCollection,
} from "./syncCollection.server";
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

/** Copies one SHOP metafield's current value from source to target: a
 * no-op (not a failure) if the source has no value set yet for it. A
 * top-level GraphQL error reading the source (missing scope, bad query) is
 * a real failure, not "no value set": reported the same way `createOne`
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

/** One definition (or value-sync) attempt's outcome: persisted verbatim
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
  /** Absent unless selected, and from plans queued before it existed. */
  checkoutStyling?: CheckoutStyling;
  metaobjectDefinitions: MetaobjectDefinitionRow[];
  metafieldDefinitions: MetafieldDefinitionRow[];
  shopPolicies: ShopPolicyRow[];
  collections: PlannedCollection[];
  metaobjectEntries: MetaobjectEntryRow[];
  metafieldValues: MetafieldValueSet[];
  /** SHOP-owned definitions whose one value (the store's own) is
   * selected on the Values tab. Absent from plans queued before Shop
   * values were split from their definitions. */
  shopMetafieldValues?: MetafieldDefinitionRow[];
  menus: PlannedMenu[];
  locations: LocationRow[];
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

/** One unit of resumable work; most steps produce one item. */
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

/** Creates the definition only. Values, the Shop's included, are their
 * own selection on the Values tab, so picking a definition never copies
 * data along with it. */
function metafieldDefinitionStep(def: MetafieldDefinitionRow): SyncStep {
  return async (ctx) => {
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
    return [toItem(metafieldDefinitionKey(def), "DEFINITION", result)];
  };
}

/** Copies the store's own value for a SHOP-owned definition. A missing
 * target Shop id is recorded as a failed item rather than skipped
 * silently, so the job can't report SUCCEEDED when nothing copied. */
function shopMetafieldValueStep(def: MetafieldDefinitionRow): SyncStep {
  return async (ctx) => {
    const targetShopId = await ctx.targetShopId();
    const result: CreateResult = targetShopId
      ? await syncShopMetafieldValue({
          sourceAdmin: ctx.sourceAdmin,
          targetAdmin: ctx.targetAdmin,
          targetShopId,
          def,
        })
      : { ok: false, error: "Could not resolve the target store's Shop id." };
    return [toItem(metafieldValuesKey(def), "VALUE", result)];
  };
}

function checkoutStylingStep(styling: CheckoutStyling): SyncStep {
  return async (ctx) => [
    toItem(
      CHECKOUT_STYLING_KEY,
      "VALUE",
      await syncCheckoutStyling(ctx.targetAdmin, styling, ctx.targetIds),
    ),
  ];
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
    ...(plan.checkoutStyling
      ? [checkoutStylingStep(plan.checkoutStyling)]
      : []),
    ...plan.collections.map((collection): SyncStep => async (ctx) => [
      toItem(
        collectionKey(collection.handle),
        "DEFINITION",
        await syncCollection(ctx.targetAdmin, collection),
      ),
    ]),
    // Plans queued before location sync existed have no `locations`.
    ...(plan.locations ?? []).map((location): SyncStep => async (ctx) => [
      toItem(
        locationKey(location.name),
        "DEFINITION",
        await syncLocation(ctx.targetAdmin, location),
      ),
    ]),
    ...plan.metaobjectEntries.map((entry): SyncStep => async (ctx) => [
      toItem(
        metaobjectEntryKey(entry),
        "VALUE",
        await syncMetaobjectEntry(ctx.targetAdmin, entry, ctx.targetIds),
      ),
    ]),
    // Rules can point at any collection or entry synced above.
    ...plan.collections.flatMap(({ handle, rules }) =>
      rules ? [collectionRulesStep(handle, rules)] : [],
    ),
    // Last: values can reference entries and collections synced above.
    ...plan.metafieldValues.flatMap(metafieldValueSteps),
    ...(plan.shopMetafieldValues ?? []).map(shopMetafieldValueStep),
    // Menus link to policies, collections, entries and products. Plans
    // queued before menu sync existed have no `menus`.
    ...(plan.menus ?? []).map(menuStep),
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
