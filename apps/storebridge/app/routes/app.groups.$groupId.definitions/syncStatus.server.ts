import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { unauthenticated } from "~/shopify.server";
import {
  metafieldDefinitionKey,
  metaobjectDefinitionKey,
} from "./definitionKey";
import {
  getDefinitionCatalog,
  type getOwnedGroup,
  type MetafieldDefinitionRow,
  type MetaobjectDefinitionRow,
} from "./definitions.server";

export type DefinitionSyncStatus = "IN_SYNC" | "OUT_OF_SYNC" | "NOT_SYNCED";

/** True if two metaobject field-definition lists are equivalent — same set
 * of keys, each with matching name/type/required — compared as a map so
 * field order never matters (Shopify doesn't guarantee it, and neither
 * does a merchant hand-editing one). */
function fieldsMatch(
  a: MetaobjectDefinitionRow["fieldDefinitions"],
  b: MetaobjectDefinitionRow["fieldDefinitions"],
): boolean {
  if (a.length !== b.length) return false;
  const byKey = new Map(b.map((field) => [field.key, field]));
  return a.every((field) => {
    const other = byKey.get(field.key);
    return (
      other !== undefined &&
      other.name === field.name &&
      other.type === field.type &&
      other.required === field.required
    );
  });
}

/** Compares one source metaobject definition against a target's full
 * catalog. `NOT_SYNCED` when no definition with the same `type` exists on
 * the target — Shopify enforces `type` as unique per store, so it's the
 * natural identity to match on, same as `syncTarget.server.ts`'s create
 * mutation relies on for its `TAKEN` idempotency check. */
export function diffMetaobjectDefinition(
  source: MetaobjectDefinitionRow,
  targetDefinitions: MetaobjectDefinitionRow[],
): DefinitionSyncStatus {
  const target = targetDefinitions.find((def) => def.type === source.type);
  if (!target) return "NOT_SYNCED";
  if (
    target.name === source.name &&
    fieldsMatch(source.fieldDefinitions, target.fieldDefinitions)
  ) {
    return "IN_SYNC";
  }
  return "OUT_OF_SYNC";
}

/** Same idea for metafield definitions, matched on `(ownerType, namespace,
 * key)` — the triple Shopify enforces uniqueness on. Definition shape
 * only (name/description/type) — not the SHOP metafield's synced value,
 * which is a separate, not-yet-covered comparison (see the plan this
 * shipped under). */
export function diffMetafieldDefinition(
  source: MetafieldDefinitionRow,
  targetDefinitions: MetafieldDefinitionRow[],
): DefinitionSyncStatus {
  const target = targetDefinitions.find(
    (def) =>
      def.ownerType === source.ownerType &&
      def.namespace === source.namespace &&
      def.key === source.key,
  );
  if (!target) return "NOT_SYNCED";
  if (
    target.name === source.name &&
    target.description === source.description &&
    target.type === source.type
  ) {
    return "IN_SYNC";
  }
  return "OUT_OF_SYNC";
}

export interface TargetStatus {
  targetId: string;
  shop: string;
  status: DefinitionSyncStatus;
}

export interface DefinitionStatusSummary {
  inSyncCount: number;
  totalTargets: number;
  perTarget: TargetStatus[];
}

type OwnedGroup = NonNullable<Awaited<ReturnType<typeof getOwnedGroup>>>;

/**
 * Live sync-status check, triggered on demand (not on every page load —
 * see the plan this shipped under for why) by the "Check sync status"
 * button. Re-fetches the source's catalog fresh and every APPROVED
 * target's catalog concurrently, mirroring sync.server.ts's runSyncJob
 * pattern for reaching a target (`unauthenticated.admin`), then diffs each
 * source definition against each target — this is what makes the result
 * trustworthy even when a target's definition was hand-edited or
 * hand-created directly in Shopify Admin, since our own SyncJob* rows
 * would never reflect that.
 */
export async function runStatusCheck({
  group,
  sourceAdmin,
}: {
  group: OwnedGroup;
  sourceAdmin: AdminApiContext;
}): Promise<Record<string, DefinitionStatusSummary>> {
  const approvedTargets = group.targets.filter(
    (target) => target.status === "APPROVED",
  );

  const [sourceCatalog, targetCatalogs] = await Promise.all([
    getDefinitionCatalog(sourceAdmin),
    Promise.all(
      approvedTargets.map(async (target) => {
        const { admin: targetAdmin } = await unauthenticated.admin(
          target.store.shop,
        );
        return {
          targetId: target.id,
          shop: target.store.shop,
          catalog: await getDefinitionCatalog(targetAdmin),
        };
      }),
    ),
  ]);

  const statuses: Record<string, DefinitionStatusSummary> = {};

  for (const def of sourceCatalog.metaobjectDefinitions) {
    const perTarget = targetCatalogs.map(({ targetId, shop, catalog }) => ({
      targetId,
      shop,
      status: diffMetaobjectDefinition(def, catalog.metaobjectDefinitions),
    }));
    statuses[metaobjectDefinitionKey(def)] = {
      inSyncCount: perTarget.filter((t) => t.status === "IN_SYNC").length,
      totalTargets: perTarget.length,
      perTarget,
    };
  }

  for (const def of sourceCatalog.metafieldDefinitions) {
    const perTarget = targetCatalogs.map(({ targetId, shop, catalog }) => ({
      targetId,
      shop,
      status: diffMetafieldDefinition(def, catalog.metafieldDefinitions),
    }));
    statuses[metafieldDefinitionKey(def)] = {
      inSyncCount: perTarget.filter((t) => t.status === "IN_SYNC").length,
      totalTargets: perTarget.length,
      perTarget,
    };
  }

  return statuses;
}
