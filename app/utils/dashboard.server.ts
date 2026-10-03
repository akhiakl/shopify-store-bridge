import { and, desc, eq, inArray } from "drizzle-orm";

import db from "~/db.server";
import { connections, stores } from "~/db/schema.server";
import { syncJobs } from "~/db/syncJobsSchema.server";

// Promoted out of app.stores/pairing.server.ts once App Home (app._index.tsx)
// became a second consumer of `getDashboardData`: it's no longer specific
// to the "Connected stores" route. `pairing.server.ts` keeps the pairing
// *mutations* (requestPairing, approve/decline/regenerate) and imports
// `getOrCreateStore` from here.

/** Upsert-by-shop: the update is a no-op (self-assign) purely to make the
 * insert return the existing row on conflict, mirroring Prisma's upsert. */
export async function getOrCreateStore(shop: string) {
  const [store] = await db
    .insert(stores)
    .values({ shop })
    .onConflictDoUpdate({ target: stores.shop, set: { shop } })
    .returning();
  return store;
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

/** The shop's connections from both sides: `outgoing` where it's the
 * source (any status, so it can see pending/declined invites),
 * `incomingRequests` still waiting on it as target, and `incoming` it has
 * already approved or declined. */
export async function getDashboardData(shop: string) {
  const store = await getOrCreateStore(shop);

  const [outgoing, incomingRequests, incoming] = await Promise.all([
    db.query.connections.findMany({
      where: eq(connections.sourceStoreId, store.id),
      with: { target: true },
      orderBy: [desc(connections.requestedAt)],
    }),
    db.query.connections.findMany({
      where: and(
        eq(connections.targetStoreId, store.id),
        eq(connections.status, "PENDING"),
      ),
      with: { source: true },
      orderBy: [desc(connections.requestedAt)],
    }),
    db.query.connections.findMany({
      where: and(
        eq(connections.targetStoreId, store.id),
        inArray(connections.status, ["APPROVED", "DECLINED"]),
      ),
      with: { source: true },
      orderBy: [desc(connections.respondedAt)],
    }),
  ]);

  return { outgoing, incomingRequests, incoming };
}

/** Most recent sync jobs across the given connections: for App Home's
 * "recent activity" list, which has no single connection to scope to
 * (unlike JobHistoryList). Takes connection ids from a `getDashboardData`
 * call the caller already made. Empty `connectionIds` short-circuits
 * before the `inArray` call, since some drivers reject an empty
 * `IN (...)` list. */
export async function getRecentJobs(connectionIds: string[], limit = 10) {
  if (connectionIds.length === 0) return [];

  return db.query.syncJobs.findMany({
    where: inArray(syncJobs.connectionId, connectionIds),
    // A running job's plan can be thousands of entries; never ship it.
    columns: { plan: false },
    with: { connection: { with: { source: true, target: true } } },
    orderBy: [desc(syncJobs.startedAt)],
    limit,
  });
}
