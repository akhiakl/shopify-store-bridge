import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { getDeliveryProfiles } from "~/utils/sync/deliveryProfiles.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { DeliveryProfilesSection } from "./components/DeliveryProfilesSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    profiles: await getDeliveryProfiles(sourceAdmin),
  };
};

export const action = connectionPageAction;

export default function ShippingPage() {
  const { connectionId, isApproved, profiles } = useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Shipping profiles">
        <DeliveryProfilesSection
          profiles={profiles}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>
    </>
  );
}
