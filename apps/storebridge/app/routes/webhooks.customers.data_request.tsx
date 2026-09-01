import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook (customers/data_request) — required before
 * public App Store submission, see
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance.
 * A customer asked the store owner for the data an app holds on them.
 *
 * StoreBridge never reads or stores customer records — it only ever deals
 * with metaobject/metafield *definitions* and SHOP-level metafield values
 * (see docs/architecture/definition-sync.md's "Scope" section); the
 * `stores`/`syncGroups`/`syncJobs` tables key everything off `shop`, not a
 * customer id. There's nothing to hand back for this shop's customers, so
 * this just acknowledges receipt — `authenticate.webhook` itself verifies
 * the HMAC and returns a 401 for an invalid one before this code runs.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
