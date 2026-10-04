import { useFetcher } from "react-router";

import { CONNECTION_STATUS } from "~/utils/connectionStatus";
import type { DashboardData } from "~/utils/dashboard.server";

import { PairingLinkPanel } from "./PairingLinkPanel";

type Connection = DashboardData["outgoing"][number];

type RegenerateActionData =
  { ok: true; authorizeUrl: string } | { ok: false; error: string };

/** One store this store syncs to: its status, a way in, and "Resend
 * link" while pending (see pairing.server.ts's regeneratePairingRequest
 * for why that's source-, not target-authorized). */
function ConnectionRow({ connection }: { connection: Connection }) {
  const fetcher = useFetcher<RegenerateActionData>();
  const data = fetcher.data;
  const status = CONNECTION_STATUS[connection.status];

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack gap="small-200">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">{connection.target.shop}</s-text>
            <s-badge tone={status.tone}>{status.label}</s-badge>
          </s-stack>
          <s-stack direction="inline" gap="small-200">
            {connection.status === "PENDING" && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="regenerate" />
                <input
                  type="hidden"
                  name="connectionId"
                  value={connection.id}
                />
                <s-button type="submit" loading={fetcher.state !== "idle"}>
                  Resend link
                </s-button>
              </fetcher.Form>
            )}
            <s-button href={`/app/connections/${connection.id}`}>Open</s-button>
          </s-stack>
        </s-grid>
        {data && !data.ok && (
          <s-banner tone="critical" heading={data.error}></s-banner>
        )}
        {data?.ok && (
          <s-banner tone="success" heading="New link generated">
            <s-paragraph>
              The old link no longer works: send this one instead.
            </s-paragraph>
            <PairingLinkPanel authorizeUrl={data.authorizeUrl} />
          </s-banner>
        )}
      </s-stack>
    </s-box>
  );
}

/** Stores the current store syncs to (it's the source), in any status. */
export function OutgoingConnectionsList({
  connections,
}: {
  connections: DashboardData["outgoing"];
}) {
  if (connections.length === 0) {
    return (
      <s-paragraph>
        You haven&apos;t connected to any stores yet. Send a pairing request
        above to start.
      </s-paragraph>
    );
  }
  return (
    <s-stack gap="base">
      {connections.map((connection) => (
        <ConnectionRow key={connection.id} connection={connection} />
      ))}
    </s-stack>
  );
}
