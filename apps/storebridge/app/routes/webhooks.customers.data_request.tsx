import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook (customers/data_request) — required before
 * public App Store submission, see
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance.
 * A customer asked the store owner for the data an app holds on them.
 *
 * StoreBridge stores no customer records, emails or metafield values. The
 * one trace of a customer it keeps is job history: syncing a customer
 * metafield's values records a `SyncJobItem` per customer, keyed by their
 * source-store GID, with only the sync outcome (see
 * webhooks.customers.redact.tsx, which deletes those rows). Answering a
 * data request with those rows isn't automated yet, so this still just
 * acknowledges receipt — `authenticate.webhook` itself verifies the HMAC
 * and returns a 401 for an invalid one before this code runs.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
