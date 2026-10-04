import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { getLocations } from "~/utils/sync/locations.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { LocationsSection } from "./components/LocationsSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    locations: await getLocations(sourceAdmin),
  };
};

export const action = connectionPageAction;

export default function LocationsPage() {
  const { connectionId, isApproved, locations } =
    useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Locations">
        <LocationsSection
          locations={locations}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>
    </>
  );
}
