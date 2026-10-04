import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { AppVersion } from "~/components/AppVersion";
import { authenticate } from "~/shopify.server";
import { DataRequestCard } from "./components/DataRequestCard";
import { getDataRequests } from "./dataRequests.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { requests: await getDataRequests(session.shop) };
};

/** Customer data requests Shopify forwarded (customers/data_request), so
 * the merchant can answer each within Shopify's 30-day window. */
export default function DataRequests() {
  const { requests } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Customer data requests">
      <s-section>
        <s-paragraph>
          When a customer asks your store for their data, Shopify tells
          StoreBridge. Each request is listed here with everything StoreBridge
          holds on that customer, which is only the history of syncing their
          metafield values. StoreBridge never stores emails or the values
          themselves. Send the export to the customer within 30 days of the
          request.
        </s-paragraph>
      </s-section>
      <s-section heading="Requests">
        {requests.length === 0 ? (
          <s-paragraph>No customer data requests yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {requests.map((request) => (
              <DataRequestCard key={request.id} request={request} />
            ))}
          </s-stack>
        )}
      </s-section>
      <AppVersion />
    </s-page>
  );
}
