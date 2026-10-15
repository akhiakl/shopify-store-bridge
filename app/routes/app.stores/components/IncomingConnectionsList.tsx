import { CONNECTION_STATUS } from "~/utils/connectionStatus";
import type { DashboardData } from "~/utils/dashboard.server";

import { staffNote } from "../utils/staffNote";

/** Stores the current store has approved or declined pulling from (it's
 * the target). An approved one opens its pages to pull from the source. */
export function IncomingConnectionsList({
  connections,
}: {
  connections: DashboardData["incoming"];
}) {
  return (
    <s-stack gap="base">
      {connections.map((connection) => {
        const status = CONNECTION_STATUS[connection.status];
        const note = staffNote(connection);
        return (
          <s-box
            key={connection.id}
            padding="base"
            border="base"
            borderRadius="base"
          >
            <s-grid
              gridTemplateColumns="1fr auto"
              gap="base"
              alignItems="center"
            >
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-text type="strong">{connection.source.shop}</s-text>
                  <s-badge tone={status.tone}>{status.label}</s-badge>
                </s-stack>
                {note && <s-text color="subdued">{note}</s-text>}
              </s-stack>
              {connection.status === "APPROVED" && (
                <s-button href={`/app/connections/${connection.id}`}>
                  Sync from source
                </s-button>
              )}
            </s-grid>
          </s-box>
        );
      })}
    </s-stack>
  );
}
