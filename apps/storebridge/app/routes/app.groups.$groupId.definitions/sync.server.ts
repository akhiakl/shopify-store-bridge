import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { desc, eq } from "drizzle-orm";

import db from "~/db.server";
import {
  syncJobItems,
  syncJobs,
  syncJobTargets,
} from "~/db/syncJobsSchema.server";
import { unauthenticated } from "~/shopify.server";

import { getDefinitionCatalog, type getOwnedGroup } from "./definitions.server";
import { syncToTarget } from "./syncTarget.server";

interface ParsedSelection {
  metaobjectTypes: string[];
  metafieldSelectors: { ownerType: string; namespace: string; key: string }[];
}

/** Inverse of the `definitionKey` helpers in the checkbox components
 * (`metaobject:<type>`, `metafield:<ownerType>:<namespace>:<key>`) — safe
 * to split on ":" since Shopify's own validation rules for type/namespace/
 * key (alphanumeric, hyphen, underscore only) rule out embedded colons. */
export function parseSelection(keys: string[]): ParsedSelection {
  const metaobjectTypes: string[] = [];
  const metafieldSelectors: ParsedSelection["metafieldSelectors"] = [];
  for (const key of keys) {
    const [kind, ...rest] = key.split(":");
    if (kind === "metaobject") {
      metaobjectTypes.push(rest[0]);
    } else if (kind === "metafield") {
      const [ownerType, namespace, fieldKey] = rest;
      metafieldSelectors.push({ ownerType, namespace, key: fieldKey });
    }
  }
  return { metaobjectTypes, metafieldSelectors };
}

/** Never trusts the browser for the actual definition shape — only the
 * selection *keys* cross the wire; the definitions themselves are always
 * re-read from the source store right before syncing. */
async function resolveSelectedDefinitions(
  sourceAdmin: AdminApiContext,
  selection: ParsedSelection,
) {
  const catalog = await getDefinitionCatalog(sourceAdmin);
  const metaobjectDefinitions = catalog.metaobjectDefinitions.filter((def) =>
    selection.metaobjectTypes.includes(def.type),
  );
  const metafieldDefinitions = catalog.metafieldDefinitions.filter((def) =>
    selection.metafieldSelectors.some(
      (sel) =>
        sel.ownerType === def.ownerType &&
        sel.namespace === def.namespace &&
        sel.key === def.key,
    ),
  );
  return { metaobjectDefinitions, metafieldDefinitions };
}

type OwnedGroup = NonNullable<Awaited<ReturnType<typeof getOwnedGroup>>>;

/**
 * Runs one "Sync now" click: pushes the selected definitions from the
 * group's source (read via `sourceAdmin`, the caller's own authenticated
 * session) to each APPROVED target. Each target is reached with
 * `unauthenticated.admin(shop)` — a server-initiated admin context loaded
 * from that shop's own stored offline session, since this isn't a request
 * that shop made (see `@shopify/shopify-app-react-router`'s own docs on
 * `unauthenticated.admin`). No queue/worker involved — see
 * docs/architecture/definition-sync.md for why synchronous is fine here.
 * Per-target mutation logic (creating definitions, syncing SHOP metafield
 * values) lives in syncTarget.server.ts — this file is just orchestration
 * and persistence.
 */
export async function runSyncJob({
  group,
  selection,
  sourceAdmin,
}: {
  group: OwnedGroup;
  selection: string[];
  sourceAdmin: AdminApiContext;
}) {
  const approvedTargets = group.targets.filter(
    (target) => target.status === "APPROVED",
  );

  const [job] = await db
    .insert(syncJobs)
    .values({ groupId: group.id, selection })
    .returning();

  const parsed = parseSelection(selection);
  const { metaobjectDefinitions, metafieldDefinitions } =
    await resolveSelectedDefinitions(sourceAdmin, parsed);

  const targetStatuses: ("SUCCEEDED" | "FAILED" | "SKIPPED")[] = [];

  for (const target of approvedTargets) {
    try {
      const { admin: targetAdmin } = await unauthenticated.admin(
        target.store.shop,
      );
      const { tallies, items } = await syncToTarget({
        sourceAdmin,
        targetAdmin,
        metaobjectDefinitions,
        metafieldDefinitions,
      });
      const status = tallies.itemsFailed === 0 ? "SUCCEEDED" : "FAILED";
      targetStatuses.push(status);
      const [jobTarget] = await db
        .insert(syncJobTargets)
        .values({ jobId: job.id, storeId: target.storeId, status, ...tallies })
        .returning();
      if (items.length > 0) {
        await db
          .insert(syncJobItems)
          .values(
            items.map((item) => ({ jobTargetId: jobTarget.id, ...item })),
          );
      }
    } catch (error) {
      targetStatuses.push("FAILED");
      await db.insert(syncJobTargets).values({
        jobId: job.id,
        storeId: target.storeId,
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Couldn't reach this store.",
      });
    }
  }

  const finalStatus =
    targetStatuses.length === 0
      ? "SUCCEEDED"
      : targetStatuses.every((s) => s === "SUCCEEDED")
        ? "SUCCEEDED"
        : targetStatuses.every((s) => s === "FAILED")
          ? "FAILED"
          : "PARTIAL";

  await db
    .update(syncJobs)
    .set({ status: finalStatus, finishedAt: new Date() })
    .where(eq(syncJobs.id, job.id));

  return { id: job.id, status: finalStatus };
}

export async function getJobHistory(groupId: string) {
  return db.query.syncJobs.findMany({
    where: eq(syncJobs.groupId, groupId),
    with: { targets: { with: { store: true, items: true } } },
    orderBy: [desc(syncJobs.startedAt)],
    limit: 20,
  });
}
