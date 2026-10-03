import { and, eq } from "drizzle-orm";
import type { ActionFunctionArgs } from "react-router";

import db from "~/db.server";
import { customerDataRequests } from "~/db/complianceSchema.server";
import { syncJobItems } from "~/db/syncJobsSchema.server";
import { authenticate } from "~/shopify.server";
import { customerSyncItemsWhere } from "~/utils/compliance/customerSyncItems.server";

/**
 * Mandatory compliance webhook (customers/redact) — required before public
 * App Store submission, see
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance.
 * A store owner asked to delete a customer's data on their behalf.
 *
 * StoreBridge holds two traces of a customer: job-history rows from
 * customer metafield value syncs (keyed by source-store GID, never email
 * or value; see customerSyncItems.server.ts), and any data requests made
 * for them (app.data-requests). Both are deleted for this shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customerId = (payload as { customer?: { id?: number | string } })
    .customer?.id;
  if (customerId === undefined) return new Response();

  await db.delete(syncJobItems).where(customerSyncItemsWhere(shop, customerId));
  await db
    .delete(customerDataRequests)
    .where(
      and(
        eq(customerDataRequests.shop, shop),
        eq(customerDataRequests.customerId, String(customerId)),
      ),
    );

  return new Response();
};
