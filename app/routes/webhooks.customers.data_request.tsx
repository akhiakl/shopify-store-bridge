import type { ActionFunctionArgs } from "react-router";

import db from "~/db.server";
import { customerDataRequests } from "~/db/complianceSchema.server";
import { authenticate } from "~/shopify.server";

/**
 * Mandatory compliance webhook (customers/data_request): required before
 * public App Store submission, see
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance.
 * A customer asked the store owner for the data an app holds on them.
 *
 * The request is recorded (customer ID only, never the email the payload
 * carries) so the merchant can see and export the matching job-history
 * rows on the app's Data requests page. Redeliveries are ignored by the
 * (shop, data request ID) unique key. `authenticate.webhook` verifies the
 * HMAC and returns a 401 for an invalid one before this code runs.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const { customer, data_request: dataRequest } = payload as {
    customer?: { id?: number | string };
    data_request?: { id?: number | string };
  };
  if (customer?.id === undefined || dataRequest?.id === undefined) {
    return new Response();
  }

  await db
    .insert(customerDataRequests)
    .values({
      shop,
      customerId: String(customer.id),
      dataRequestId: String(dataRequest.id),
    })
    .onConflictDoNothing();

  return new Response();
};
