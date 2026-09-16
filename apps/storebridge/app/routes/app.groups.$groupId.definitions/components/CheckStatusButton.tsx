import type { FetcherWithComponents } from "react-router";

import type { StatusCheckResult } from "../route";

interface CheckStatusButtonProps {
  fetcher: FetcherWithComponents<StatusCheckResult>;
  approvedTargetCount: number;
}

/**
 * Triggers a live "checkStatus" run against every approved target —
 * deliberately on-demand (a button), not automatic on page load, since
 * checking multiplies the definitions-catalog fetch by the number of
 * approved targets (see syncStatus.server.ts). Disabled with no approved
 * targets, same guard SyncButton uses.
 */
export function CheckStatusButton({
  fetcher,
  approvedTargetCount,
}: CheckStatusButtonProps) {
  const isChecking = fetcher.state !== "idle";
  const data = fetcher.data;

  return (
    <s-stack gap="small-100">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="checkStatus" />
        <s-button
          type="submit"
          loading={isChecking}
          disabled={approvedTargetCount === 0}
        >
          Check sync status
        </s-button>
      </fetcher.Form>
      {data && !data.ok && (
        <s-banner tone="critical" heading={data.error}></s-banner>
      )}
    </s-stack>
  );
}
