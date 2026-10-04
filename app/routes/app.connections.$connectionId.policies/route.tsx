import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { getShopPolicies } from "~/utils/sync/definitions.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { ShopPoliciesSection } from "./components/ShopPoliciesSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    policies: await getShopPolicies(sourceAdmin),
  };
};

export const action = connectionPageAction;

export default function ShopPoliciesPage() {
  const { connectionId, isApproved, policies } = useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Shop policies">
        <ShopPoliciesSection
          policies={policies}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>
    </>
  );
}
