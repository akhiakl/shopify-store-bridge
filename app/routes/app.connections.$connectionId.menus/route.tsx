import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { getMenus } from "~/utils/sync/menus.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { MenusSection } from "./components/MenusSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    menus: await getMenus(sourceAdmin),
  };
};

export const action = connectionPageAction;

export default function MenusPage() {
  const { connectionId, isApproved, menus } = useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Navigation menus">
        <MenusSection menus={menus} selected={selected} onToggle={toggleKeys} />
      </s-section>
    </>
  );
}
