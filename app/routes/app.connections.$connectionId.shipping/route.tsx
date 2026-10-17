import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { getDeliveryProfiles } from "~/utils/sync/deliveryProfiles.server";
import { getMarketShipping } from "~/utils/sync/marketShipping.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { DeliveryProfilesSection } from "./components/DeliveryProfilesSection";
import { MarketShippingSection } from "./components/MarketShippingSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  // A store on market-driven shipping sets rates per market; Shopify
  // deprecates its merchant delivery profiles.
  const { marketDrivenShipping, markets } =
    await getMarketShipping(sourceAdmin);
  return {
    connectionId: connection.id,
    isApproved,
    marketDrivenShipping,
    markets,
    profiles: marketDrivenShipping
      ? []
      : await getDeliveryProfiles(sourceAdmin),
  };
};

export const action = connectionPageAction;

export default function ShippingPage() {
  const { connectionId, isApproved, marketDrivenShipping, markets, profiles } =
    useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      {marketDrivenShipping ? (
        <s-section heading="Market shipping">
          <MarketShippingSection
            markets={markets}
            selected={selected}
            onToggle={toggleKeys}
          />
        </s-section>
      ) : (
        <s-section heading="Shipping profiles">
          <DeliveryProfilesSection
            profiles={profiles}
            selected={selected}
            onToggle={toggleKeys}
          />
        </s-section>
      )}
    </>
  );
}
