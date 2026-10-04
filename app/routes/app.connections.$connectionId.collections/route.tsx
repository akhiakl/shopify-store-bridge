import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { getCollections } from "~/utils/sync/collections.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { CollectionsSection } from "./components/CollectionsSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    collections: await getCollections(sourceAdmin),
  };
};

export const action = connectionPageAction;

export default function CollectionsPage() {
  const { connectionId, isApproved, collections } =
    useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Collections">
        <CollectionsSection
          collections={collections}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>
    </>
  );
}
