import { useFetcher } from "react-router";

import type { DashboardData } from "../pairing.server";

interface IncomingRequestsListProps {
  requests: DashboardData["incomingRequests"];
}

/**
 * Pending pairing invites for the current store — visibility only.
 * Approving requires the one-time link the source shared out-of-band (see
 * app.stores.authorize.tsx and pairing.server.ts's requestPairing) rather
 * than a button here, since anyone who can see this list could otherwise
 * approve a pairing for a store they don't actually run. Declining stays
 * available here — it's harmless either way.
 */
export function IncomingRequestsList({ requests }: IncomingRequestsListProps) {
  return (
    <s-stack gap="base">
      {requests.map((request) => (
        <RequestRow key={request.id} request={request} />
      ))}
    </s-stack>
  );
}

function RequestRow({
  request,
}: {
  request: DashboardData["incomingRequests"][number];
}) {
  const declineFetcher = useFetcher();
  const isDeclining = declineFetcher.state !== "idle";

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-paragraph>
          {request.group.source.shop}
          {request.group.name ? ` — ${request.group.name}` : ""} — waiting for
          the pairing link sent to you to be opened and confirmed
        </s-paragraph>
        <declineFetcher.Form method="post">
          <input type="hidden" name="intent" value="decline" />
          <input type="hidden" name="targetId" value={request.id} />
          <s-button type="submit" tone="critical" loading={isDeclining}>
            Decline
          </s-button>
        </declineFetcher.Form>
      </s-stack>
    </s-box>
  );
}
