import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { storeAdminUrl } from "~/utils/storeAdminUrl";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { CheckoutStylingSection } from "./components/CheckoutStylingSection";
import { getCheckoutOverview } from "./utils/getCheckoutOverview.server";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    targetShop: connection.target.shop,
    overview: await getCheckoutOverview({ connection, sourceAdmin }),
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
  };
};

export const action = connectionPageAction;

export default function CheckoutStylingPage() {
  const { connectionId, isApproved, targetShop, overview, apiKey } =
    useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
        confirm={{
          heading: "Change the live checkout?",
          body: `This changes ${targetShop}'s live checkout, customer accounts and sign-in styling right away. Shopify has no draft to preview it in first.`,
        }}
      />
      <s-section heading="Checkout styling">
        {overview.blocked !== null ? (
          <s-banner tone="warning" heading="Checkout styling isn't available">
            {overview.blocked}
            {overview.approveIn?.map((shop) => (
              <s-button
                key={shop}
                slot="secondary-actions"
                href={storeAdminUrl(
                  shop,
                  apiKey,
                  `/app/connections/${connectionId}/checkout`,
                )}
                target="_blank"
              >
                {`Open StoreBridge in ${shop}`}
              </s-button>
            ))}
          </s-banner>
        ) : (
          <CheckoutStylingSection
            summary={overview.summary}
            status={overview.status}
            targetShop={targetShop}
            selected={selected}
            onToggle={toggleKeys}
          />
        )}
      </s-section>
    </>
  );
}
