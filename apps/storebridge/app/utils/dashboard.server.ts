import { and, desc, eq, inArray } from "drizzle-orm";

import db from "~/db.server";
import { stores, syncGroups, syncGroupTargets } from "~/db/schema.server";
import { syncJobs } from "~/db/syncJobsSchema.server";

// Promoted out of app.stores/pairing.server.ts once App Home (app._index.tsx)
// became a second consumer of `getDashboardData` — it's no longer specific
// to the "Connected stores" route. `pairing.server.ts` keeps the pairing
// *mutations* (requestPairing, approve/decline/regenerate) and imports
// `getOrCreateStore` from here.

/** Upsert-by-shop — the update is a no-op (self-assign) purely to make the
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

export async function getDashboardData(shop: string) {
  const store = await getOrCreateStore(shop);

  const [ownedGroups, incomingRequests, memberships] = await Promise.all([
    db.query.syncGroups.findMany({
      where: eq(syncGroups.sourceId, store.id),
      with: { targets: { with: { store: true } } },
      orderBy: [desc(syncGroups.createdAt)],
    }),
    db.query.syncGroupTargets.findMany({
      where: and(
        eq(syncGroupTargets.storeId, store.id),
        eq(syncGroupTargets.status, "PENDING"),
      ),
      with: { group: { with: { source: true } } },
      orderBy: [desc(syncGroupTargets.requestedAt)],
    }),
    db.query.syncGroupTargets.findMany({
      where: and(
        eq(syncGroupTargets.storeId, store.id),
        inArray(syncGroupTargets.status, ["APPROVED", "DECLINED"]),
      ),
      with: { group: { with: { source: true } } },
      orderBy: [desc(syncGroupTargets.respondedAt)],
    }),
  ]);

  return { ownedGroups, incomingRequests, memberships };
}

/** Most recent sync jobs across every group this shop owns as a source —
 * for App Home's "recent activity" list, which has no single group to
 * scope to (unlike JobHistoryList, which is per-group). Takes the owned
 * group ids directly (from a `getDashboardData` call the caller already
 * made) rather than re-deriving them, so the two don't run
 * `getOrCreateStore`/the owned-groups query twice on one page load. Empty
 * `ownedGroupIds` short-circuits before the `inArray` call, since some
 * drivers reject an empty `IN (...)` list. */
export async function getRecentJobs(ownedGroupIds: string[], limit = 10) {
  if (ownedGroupIds.length === 0) return [];

  return db.query.syncJobs.findMany({
    where: inArray(syncJobs.groupId, ownedGroupIds),
    with: { group: true },
    orderBy: [desc(syncJobs.startedAt)],
    limit,
  });
}
