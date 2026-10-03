import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";

import { NavButtons } from "~/components/NavButtons";
import { CONNECTION_STATUS } from "~/utils/connectionStatus";
import { requireConnectionPage } from "~/utils/sync/connectionRoute.server";

/** One page per syncable type, so each loads only its own data from the
 * source (a single page fetched every catalog on every load). */
const PAGES = [
  { label: "Job history", path: "" },
  { label: "Metafields", path: "/metafields" },
  { label: "Metaobjects", path: "/metaobjects" },
  { label: "Shop policies", path: "/policies" },
  { label: "Collections", path: "/collections" },
  { label: "Menus", path: "/menus" },
  { label: "Locations", path: "/locations" },
  { label: "Checkout styling", path: "/checkout" },
] as const;

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, role } = await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    status: connection.status,
    role,
    sourceShop: connection.source.shop,
    targetShop: connection.target.shop,
  };
};

/** Layout for a connection: titled with the other store's name, a
 * breadcrumb back to Connected stores, which way data flows, and the page
 * nav. The page nav lives here rather than in the admin sidebar: the
 * sidebar is one flat level for the whole app and can't nest
 * per-connection pages. Each child page does its own access check (see
 * requireConnectionPage) and may slot a primary action (SyncButton) into
 * this `s-page`. */
export default function ConnectionLayout() {
  const { connectionId, status, role, sourceShop, targetShop } =
    useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const base = `/app/connections/${connectionId}`;
  const badge = CONNECTION_STATUS[status];

  return (
    <s-page heading={role === "source" ? targetShop : sourceShop}>
      <s-link slot="breadcrumb-actions" href="/app/stores">
        Connected stores
      </s-link>
      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone={badge.tone}>{badge.label}</s-badge>
            <s-paragraph>
              {role === "source"
                ? `Sync from this store to ${targetShop}.`
                : `Pull from ${sourceShop} into this store.`}
            </s-paragraph>
          </s-stack>
          <NavButtons
            items={PAGES.map((page) => ({
              label: page.label,
              href: `${base}${page.path}`,
              current: pathname.replace(/\/$/, "") === `${base}${page.path}`,
            }))}
          />
        </s-stack>
      </s-section>
      <Outlet />
    </s-page>
  );
}
