import { desc, eq } from "drizzle-orm";

import db from "~/db.server";
import { customerDataRequests } from "~/db/complianceSchema.server";
import { stores } from "~/db/schema.server";
import {
  syncJobItems,
  syncJobs,
  syncJobTargets,
} from "~/db/syncJobsSchema.server";
import { customerSyncItemsWhere } from "~/utils/compliance/customerSyncItems.server";

/** One job-history row held on the customer, in the shape it's shown and
 * exported. */
export interface CustomerDataRow {
  syncedAt: Date;
  targetShop: string;
  /** `namespace.key` of the customer metafield whose value was synced. */
  metafield: string;
  status: string;
  errorMessage: string | null;
}

export interface DataRequestView {
  id: string;
  customerId: string;
  receivedAt: Date;
  rows: CustomerDataRow[];
}

/** `metafieldValue:CUSTOMER:<namespace>:<key>:<gid>` → `namespace.key`. */
function metafieldOf(key: string): string {
  const [, , namespace, metafieldKey] = key.split(":");
  return `${namespace}.${metafieldKey}`;
}

async function rowsFor(
  shop: string,
  customerId: string,
): Promise<CustomerDataRow[]> {
  const rows = await db
    .select({
      key: syncJobItems.key,
      status: syncJobItems.status,
      errorMessage: syncJobItems.errorMessage,
      syncedAt: syncJobs.startedAt,
      targetShop: stores.shop,
    })
    .from(syncJobItems)
    .innerJoin(syncJobTargets, eq(syncJobTargets.id, syncJobItems.jobTargetId))
    .innerJoin(syncJobs, eq(syncJobs.id, syncJobTargets.jobId))
    .innerJoin(stores, eq(stores.id, syncJobTargets.storeId))
    .where(customerSyncItemsWhere(shop, customerId))
    .orderBy(desc(syncJobs.startedAt));
  return rows.map(({ key, ...row }) => ({
    ...row,
    metafield: metafieldOf(key),
  }));
}

/** This shop's data requests, newest first, each with the rows
 * StoreBridge holds on that customer right now. */
export async function getDataRequests(
  shop: string,
): Promise<DataRequestView[]> {
  const requests = await db
    .select()
    .from(customerDataRequests)
    .where(eq(customerDataRequests.shop, shop))
    .orderBy(desc(customerDataRequests.receivedAt));
  return Promise.all(
    requests.map(async (request) => ({
      id: request.id,
      customerId: request.customerId,
      receivedAt: request.receivedAt,
      rows: await rowsFor(shop, request.customerId),
    })),
  );
}
