import { useFetcher } from "react-router";

import type { DashboardData } from "../pairing.server";

interface IncomingRequestsListProps {
  requests: DashboardData["incomingRequests"];
}

/**
 * Pending pairing invites for the current store, approved/declined from
 * inside this store's own authenticated session — never via a code typed
 * elsewhere, see AGENTS.md's store-pairing notes.
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
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-paragraph>
          {request.group.source.shop}
          {request.group.name ? ` — ${request.group.name}` : ""}
        </s-paragraph>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="approve" />
          <input type="hidden" name="targetId" value={request.id} />
          <s-button type="submit" variant="primary" loading={isSubmitting}>
            Approve
          </s-button>
        </fetcher.Form>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="decline" />
          <input type="hidden" name="targetId" value={request.id} />
          <s-button type="submit" tone="critical" loading={isSubmitting}>
            Decline
          </s-button>
        </fetcher.Form>
      </s-stack>
    </s-box>
  );
}
