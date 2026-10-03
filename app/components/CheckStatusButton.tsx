import type { ReactNode } from "react";
import type { FetcherWithComponents } from "react-router";

import type { StatusCheckResult } from "~/utils/sync/connectionRoute.server";

interface CheckStatusButtonProps {
  fetcher: FetcherWithComponents<StatusCheckResult>;
  isApproved: boolean;
  /** Extra actions shown on the same row, e.g. "Select what needs syncing". */
  children?: ReactNode;
}

/**
 * Triggers a live "checkStatus" run against the connection's target:
 * deliberately on-demand (a button), not automatic on page load, since
 * checking multiplies the definitions-catalog fetch by the number of
 * targets (see syncStatus.server.ts). Disabled until the connection is
 * approved, same guard SyncButton uses.
 */
export function CheckStatusButton({
  fetcher,
  isApproved,
  children,
}: CheckStatusButtonProps) {
  const isChecking = fetcher.state !== "idle";
  const data = fetcher.data;

  return (
    <s-stack gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="checkStatus" />
          <s-button type="submit" loading={isChecking} disabled={!isApproved}>
            Check sync status
          </s-button>
        </fetcher.Form>
        {children}
      </s-stack>
      {data && !data.ok && (
        <s-banner tone="critical" heading={data.error}></s-banner>
      )}
    </s-stack>
  );
}
