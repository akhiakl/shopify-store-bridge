import { and, eq, inArray, like } from "drizzle-orm";

import db from "~/db.server";
import { connections, stores } from "~/db/schema.server";
import { syncJobItems, syncJobs } from "~/db/syncJobsSchema.server";

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
  const sourceJobs = db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .innerJoin(connections, eq(connections.id, syncJobs.connectionId))
    .innerJoin(stores, eq(stores.id, connections.sourceStoreId))
    .where(eq(stores.shop, shop));

  return and(
    like(
      syncJobItems.key,
      `metafieldValue:CUSTOMER:%:gid://shopify/Customer/${customerId}`,
    ),
    inArray(syncJobItems.jobId, sourceJobs),
  );
}
