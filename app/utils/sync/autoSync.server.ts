import { and, desc, eq, inArray } from "drizzle-orm";

import db from "~/db.server";
import { connections } from "~/db/schema.server";
import { syncJobs } from "~/db/syncJobsSchema.server";

import { enqueueSyncJob } from "./syncQueue.server";

type Edge = { id: string; sourceStoreId: string; targetStoreId: string };

/** Every approved connection with auto-sync on. Small: it's opt-in. */
function autoSyncConnections() {
  return db.query.connections.findMany({
    where: and(
      eq(connections.autoSync, true),
      eq(connections.status, "APPROVED"),
    ),
    with: { source: true },
  });
}

/**
 * Whether turning auto-sync on for `connection` would close a loop: a
 * sync's writes to the target fire the target's webhooks, so if a chain
 * of auto-syncing connections leads from the target back to the source,
 * the stores would keep re-syncing each other forever.
 */
export async function wouldLoop(connection: Edge): Promise<boolean> {
  const edges: Edge[] = await autoSyncConnections();
  const seen = new Set<string>();
  const queue = [connection.targetStoreId];
  while (queue.length > 0) {
    const store = queue.shift() as string;
    if (store === connection.sourceStoreId) return true;
    if (seen.has(store)) continue;
    seen.add(store);
    for (const edge of edges) {
      if (edge.id !== connection.id && edge.sourceStoreId === store) {
        queue.push(edge.targetStoreId);
      }
    }
  }
  return false;
}

/**
 * Called when a source store's synced data changes (webhooks.source-
 * changed.tsx). Re-queues the last sync of each of its auto-sync
 * connections, unless that connection already has a job queued or
 * running: one is enough, since every job re-reads the source. A
 * connection that has never been synced has nothing to repeat. Returns
 * the new jobs' IDs for the caller to start.
 */
export async function triggerAutoSync(shop: string): Promise<string[]> {
  const started: string[] = [];
  for (const connection of await autoSyncConnections()) {
    if (connection.source.shop !== shop) continue;
    const active = await db.query.syncJobs.findFirst({
      where: and(
        eq(syncJobs.connectionId, connection.id),
        inArray(syncJobs.status, ["QUEUED", "RUNNING"]),
      ),
      columns: { id: true },
    });
    if (active) continue;
    const last = await db.query.syncJobs.findFirst({
      where: eq(syncJobs.connectionId, connection.id),
      columns: { selection: true },
      orderBy: [desc(syncJobs.startedAt)],
    });
    const selection = last?.selection as string[] | undefined;
    if (!selection?.length) continue;
    const job = await enqueueSyncJob(connection.id, selection);
    started.push(job.id);
  }
  return started;
}

export type AutoSyncResult = { ok: true } | { ok: false; error: string };

/**
 * Turns auto-sync on or off for a connection, from its source's side.
 * Turning it on needs a previous sync to repeat, and is refused when it
 * would close a loop (see wouldLoop).
 */
export async function setAutoSync(
  connection: Edge,
  enabled: boolean,
): Promise<AutoSyncResult> {
  if (enabled) {
    const last = await db.query.syncJobs.findFirst({
      where: eq(syncJobs.connectionId, connection.id),
      columns: { id: true },
    });
    if (!last) {
      return {
        ok: false,
        error: "Run a sync first: auto-sync repeats the last one.",
      };
    }
    if (await wouldLoop(connection)) {
      return {
        ok: false,
        error:
          "Another auto-syncing connection already syncs back into this store, so the two would keep re-syncing each other. Turn auto-sync off there first.",
      };
    }
  }
  await db
    .update(connections)
    .set({ autoSync: enabled })
    .where(eq(connections.id, connection.id));
  return { ok: true };
}
