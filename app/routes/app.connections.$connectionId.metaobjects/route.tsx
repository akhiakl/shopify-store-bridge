import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";

import { CheckStatusButton } from "~/components/CheckStatusButton";
import { NavButtons } from "~/components/NavButtons";
import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { useStatusCheck } from "~/hooks/useStatusCheck";
import { fetchMetaobjectDefinitions } from "~/utils/sync/definitions.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { MetaobjectDefinitionsSection } from "./components/MetaobjectDefinitionsSection";
import { MetaobjectEntriesSection } from "./components/MetaobjectEntriesSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    definitions: await fetchMetaobjectDefinitions(sourceAdmin),
  };
};

export const action = connectionPageAction;

/** Metaobject definitions and their entries, as two tabs in one card. One selection
 * spans both tabs, so a definition and its entries can go in one sync. */
export default function MetaobjectsPage() {
  const { connectionId, isApproved, definitions } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "entries" ? "entries" : "definitions";
  const { selected, toggleKeys } = useSelection();
  const { fetcher, statuses, outOfDateKeys } = useStatusCheck("metaobject:");
  const base = `/app/connections/${connectionId}/metaobjects`;

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Metaobjects">
        <s-stack gap="base">
          <NavButtons
            appearance="tabs"
            items={[
              {
                label: "Definitions",
                href: base,
                current: tab === "definitions",
              },
              {
                label: "Entries",
                href: `${base}?tab=entries`,
                current: tab === "entries",
              },
            ]}
          />
          <s-divider />
          {tab === "definitions" ? (
            <>
              <CheckStatusButton fetcher={fetcher} isApproved={isApproved}>
                {statuses && (
                  <s-button onClick={() => toggleKeys(outOfDateKeys, true)}>
                    Select what needs syncing
                  </s-button>
                )}
              </CheckStatusButton>
              <MetaobjectDefinitionsSection
                definitions={definitions}
                selected={selected}
                onToggle={toggleKeys}
                statusByKey={statuses}
              />
            </>
          ) : (
            <MetaobjectEntriesSection
              definitions={definitions}
              selected={selected}
              onToggle={toggleKeys}
            />
          )}
        </s-stack>
      </s-section>
    </>
  );
}
