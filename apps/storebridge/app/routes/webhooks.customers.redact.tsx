import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook (customers/redact) — required before public
 * App Store submission, see
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance.
 * A store owner asked to delete a customer's data on their behalf.
 *
 * Same reasoning as webhooks.customers.data_request.tsx: StoreBridge holds
 * no customer records at all (only definition metadata and SHOP-level
 * metafield values), so there's nothing to redact here. Acknowledge
 * receipt so the 30-day compliance window closes cleanly.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
