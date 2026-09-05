import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type {
  MetafieldDefinitionRow,
  MetaobjectDefinitionRow,
} from "./definitions.server";
import {
  metafieldDefinitionKey,
  metaobjectDefinitionKey,
} from "./definitionKey";
import {
  METAFIELD_DEFINITION_CREATE_MUTATION,
  METAFIELDS_SET_MUTATION,
  METAOBJECT_DEFINITION_CREATE_MUTATION,
  SHOP_ID_QUERY,
  SHOP_METAFIELD_VALUE_QUERY,
} from "./syncQueries.server";

type CreateResult =
  { ok: true; skipped?: boolean } | { ok: false; error: string };

/** Top-level GraphQL `errors` (a bad query, a missing scope) joined into one
 * message, or `undefined` when the response carried none. Shared by every
 * caller below that reads a raw `admin.graphql(...).then(r => r.json())`
 * response — `admin.graphql`'s return type only declares `data` on the
 * parsed body, but the runtime response can carry this too, so it's cast
 * the same loose way `payload` in `createOne` is (this codebase doesn't
 * have generated types wired into these hand-written calls yet — see
 * shopify.app.toml's TODO on that). */
function readTopLevelErrors(body: unknown): string | undefined {
  const { errors } = body as { errors?: { message: string }[] };
  if (!errors) return undefined;
  return Array.isArray(errors)
    ? errors.map((e: { message: string }) => e.message).join("; ")
    : String(errors);
}

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
  const body = (await response.json()) as { data?: Record<string, unknown> };
  const errorMessage = readTopLevelErrors(body);
  if (errorMessage) {
    return { ok: false, error: errorMessage };
  }
  const payload = Object.values(body.data ?? {})[0] as
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

  return { tallies, items };
}
