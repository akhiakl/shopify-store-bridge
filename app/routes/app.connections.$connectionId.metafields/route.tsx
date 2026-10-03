import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";

import { CheckStatusButton } from "~/components/CheckStatusButton";
import { NavButtons } from "~/components/NavButtons";
import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { useStatusCheck } from "~/hooks/useStatusCheck";
import { fetchMetafieldDefinitions } from "~/utils/sync/definitions.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";

import { MetafieldDefinitionsSection } from "./components/MetafieldDefinitionsSection";
import { MetafieldValuesSection } from "./components/MetafieldValuesSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  return {
    connectionId: connection.id,
    isApproved,
    definitions: await fetchMetafieldDefinitions(sourceAdmin),
  };
};

export const action = connectionPageAction;

/** Metafield definitions and their values, as two tabs in one card. One selection
 * spans both tabs, so a definition and its values can go in one sync. */
export default function MetafieldsPage() {
  const { connectionId, isApproved, definitions } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "values" ? "values" : "definitions";
  const { selected, toggleKeys } = useSelection();
  const { fetcher, statuses, outOfDateKeys } = useStatusCheck("metafield:");
  const base = `/app/connections/${connectionId}/metafields`;

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Metafields">
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
                label: "Values",
                href: `${base}?tab=values`,
                current: tab === "values",
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
              <MetafieldDefinitionsSection
                definitions={definitions}
                selected={selected}
                onToggle={toggleKeys}
                statusByKey={statuses}
              />
            </>
          ) : (
            <MetafieldValuesSection
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
