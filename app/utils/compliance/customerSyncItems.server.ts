import { and, eq, inArray, like } from "drizzle-orm";

import db from "~/db.server";
import { stores, syncGroups } from "~/db/schema.server";
import {
  syncJobItems,
  syncJobs,
  syncJobTargets,
} from "~/db/syncJobsSchema.server";

/**
 * The job-history rows StoreBridge holds on one customer of `shop`: items
 * from customer metafield value syncs, keyed by the customer's GID on the
 * source store (see utils/sync/syncMetafieldValues.server.ts), in jobs
 * whose source is `shop`. Target-store customers are only looked up by
 * email at sync time and never recorded, so a target shop matches
 * nothing. Shared by customers/redact (delete) and the data-request page
 * (read).
 */
export function customerSyncItemsWhere(
  shop: string,
  customerId: string | number,
) {
  const sourceJobTargets = db
    .select({ id: syncJobTargets.id })
    .from(syncJobTargets)
    .innerJoin(syncJobs, eq(syncJobs.id, syncJobTargets.jobId))
    .innerJoin(syncGroups, eq(syncGroups.id, syncJobs.groupId))
    .innerJoin(stores, eq(stores.id, syncGroups.sourceId))
    .where(eq(stores.shop, shop));

  return and(
    like(
      syncJobItems.key,
      `metafieldValue:CUSTOMER:%:gid://shopify/Customer/${customerId}`,
    ),
    inArray(syncJobItems.jobTargetId, sourceJobTargets),
  );
}
