import { waitUntil } from "@vercel/functions";
import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "~/shopify.server";
import { triggerAutoSync } from "~/utils/sync/autoSync.server";
import { driveSyncJob } from "~/utils/sync/syncQueue.server";

/**
 * Something StoreBridge syncs changed on this shop (a metafield
 * definition, collection, location or shipping profile: see shopify.app.toml's
 * subscription for the topics). Re-runs the last
 * sync of each of the shop's auto-sync connections (#65). The payload
 * isn't needed: every job re-reads the source. Jobs start after the
 * response, so Shopify gets its 200 at once.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  for (const jobId of await triggerAutoSync(shop)) {
    waitUntil(driveSyncJob(jobId));
  }
  return new Response();
};
