import { and, eq, inArray, like } from "drizzle-orm";
import type { ActionFunctionArgs } from "react-router";

import db from "~/db.server";
import { stores, syncGroups } from "~/db/schema.server";
import {
  syncJobItems,
  syncJobs,
  syncJobTargets,
} from "~/db/syncJobsSchema.server";
import { authenticate } from "~/shopify.server";

/**
 * Mandatory compliance webhook (customers/redact) — required before public
 * App Store submission, see
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance.
 * A store owner asked to delete a customer's data on their behalf.
 *
 * The only customer data StoreBridge keeps is in job history: syncing a
 * customer metafield's values records one `SyncJobItem` per customer,
 * keyed by that customer's GID on the *source* store (never their email
 * or the value itself — see utils/sync/syncMetafieldValues.server.ts).
 * So this deletes those rows from jobs whose source is the redacting
 * shop. A redact from a target store matches nothing: target customers
 * are looked up by email at sync time and never recorded.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customerId = (payload as { customer?: { id?: number | string } })
    .customer?.id;
  if (customerId === undefined) return new Response();

  const sourceJobTargets = db
    .select({ id: syncJobTargets.id })
    .from(syncJobTargets)
    .innerJoin(syncJobs, eq(syncJobs.id, syncJobTargets.jobId))
    .innerJoin(syncGroups, eq(syncGroups.id, syncJobs.groupId))
    .innerJoin(stores, eq(stores.id, syncGroups.sourceId))
    .where(eq(stores.shop, shop));

  await db
    .delete(syncJobItems)
    .where(
      and(
        like(
          syncJobItems.key,
          `metafieldValue:CUSTOMER:%:gid://shopify/Customer/${customerId}`,
        ),
        inArray(syncJobItems.jobTargetId, sourceJobTargets),
      ),
    );

  return new Response();
};
