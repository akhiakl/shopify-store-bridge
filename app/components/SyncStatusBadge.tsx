import { useId } from "react";

import type { DefinitionStatusSummary } from "~/utils/sync/syncStatus.server";

interface SyncStatusBadgeProps {
  summary: DefinitionStatusSummary | undefined;
}

const TARGET_STATUS = {
  IN_SYNC: { label: "In sync", tone: "success" },
  OUT_OF_SYNC: { label: "Out of sync", tone: "warning" },
  NOT_SYNCED: { label: "Not on target", tone: "critical" },
} as const;

/**
 * A definition's status from the last "Check sync status" run; renders
 * nothing until one has run. With one target, the badge says that
 * target's status outright. With several, it shows "2/3 in sync" plus an
 * info icon whose tooltip names each store's status, so the row stays one
 * line tall however many targets there are.
 */
export function SyncStatusBadge({ summary }: SyncStatusBadgeProps) {
  const tooltipId = useId();
  if (!summary || summary.totalTargets === 0) return null;

  const { inSyncCount, totalTargets, perTarget } = summary;
  if (perTarget.length === 1) {
    const status = TARGET_STATUS[perTarget[0].status];
    return <s-badge tone={status.tone}>{status.label}</s-badge>;
  }

  const tone =
    inSyncCount === totalTargets
      ? "success"
      : perTarget.some((t) => t.status === "OUT_OF_SYNC")
        ? "warning"
        : "critical";

  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-badge tone={tone}>{`${inSyncCount}/${totalTargets} in sync`}</s-badge>
      <s-icon type="info" tone="neutral" interestFor={tooltipId}></s-icon>
      <s-tooltip id={tooltipId}>
        {perTarget
          .map((t) => `${t.shop}: ${TARGET_STATUS[t.status].label}`)
          .join(". ")}
      </s-tooltip>
    </s-stack>
  );
}
