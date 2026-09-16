import type { DefinitionStatusSummary } from "../syncStatus.server";

interface SyncStatusBadgeProps {
  summary: DefinitionStatusSummary | undefined;
}

const TARGET_STATUS_TONE = {
  IN_SYNC: "success",
  OUT_OF_SYNC: "warning",
  NOT_SYNCED: "critical",
} as const;

/** Renders nothing until a status check has actually run (see
 * CheckStatusButton) — an aggregate badge (e.g. "2/3 in sync") plus a
 * native `<details>` disclosure for the per-target breakdown, so a
 * definition's row stays compact regardless of how many targets exist;
 * the breakdown only takes space when a merchant asks for it. */
export function SyncStatusBadge({ summary }: SyncStatusBadgeProps) {
  if (!summary || summary.totalTargets === 0) return null;

  const { inSyncCount, totalTargets, perTarget } = summary;
  const tone =
    inSyncCount === totalTargets
      ? "success"
      : perTarget.some((t) => t.status === "OUT_OF_SYNC")
        ? "warning"
        : "critical";

  return (
    <details>
      <summary>
        <s-badge
          tone={tone}
        >{`${inSyncCount}/${totalTargets} in sync`}</s-badge>
      </summary>
      <s-stack gap="small-100">
        {perTarget.map((target) => (
          <s-stack
            key={target.targetId}
            direction="inline"
            gap="small-100"
            alignItems="center"
          >
            <s-paragraph>{target.shop}</s-paragraph>
            <s-badge tone={TARGET_STATUS_TONE[target.status]}>
              {target.status}
            </s-badge>
          </s-stack>
        ))}
      </s-stack>
    </details>
  );
}
