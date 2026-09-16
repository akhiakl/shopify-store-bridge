import { JOB_STATUS_TONE } from "~/utils/syncJobStatusTone";

import type { getJobHistory } from "../sync.server";

type JobHistory = Awaited<ReturnType<typeof getJobHistory>>;

interface JobHistoryListProps {
  jobs: JobHistory;
}

const TARGET_STATUS_TONE = {
  SUCCEEDED: "success",
  FAILED: "critical",
  SKIPPED: "warning",
} as const;

/** Past "Sync now" runs for this group, newest first — each with its
 * per-target outcome, since a run can succeed for one target and fail for
 * another (see sync.server.ts's runSyncJob). Job status legible at a
 * glance per AGENTS.md §9. */
export function JobHistoryList({ jobs }: JobHistoryListProps) {
  if (jobs.length === 0) {
    return <s-paragraph>No syncs have been run yet.</s-paragraph>;
  }

  return (
    <s-stack gap="base">
      {jobs.map((job) => (
        <s-box key={job.id} padding="base" border="base" borderRadius="base">
          <s-stack gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-badge tone={JOB_STATUS_TONE[job.status]}>{job.status}</s-badge>
              <s-paragraph>
                {new Date(job.startedAt).toLocaleString()}
              </s-paragraph>
              <s-paragraph>
                {(job.selection as string[]).length} definition(s) requested
              </s-paragraph>
            </s-stack>
            {job.targets.map((target) => (
              <s-stack
                key={target.id}
                direction="inline"
                gap="small-100"
                alignItems="center"
              >
                <s-paragraph>{target.store.shop}</s-paragraph>
                <s-badge tone={TARGET_STATUS_TONE[target.status]}>
                  {target.status}
                </s-badge>
                <s-paragraph>
                  {target.itemsSynced} synced
                  {target.itemsSkipped > 0
                    ? `, ${target.itemsSkipped} already existed`
                    : ""}
                  {target.itemsFailed > 0
                    ? `, ${target.itemsFailed} failed`
                    : ""}
                </s-paragraph>
                {target.errorMessage && (
                  <s-paragraph>{target.errorMessage}</s-paragraph>
                )}
              </s-stack>
            ))}
            {job.targets
              .flatMap((target) =>
                target.items
                  .filter((item) => item.status === "FAILED")
                  .map((item) => ({ ...item, shop: target.store.shop })),
              )
              .map((item) => (
                <s-paragraph key={`${item.shop}-${item.kind}-${item.key}`}>
                  {item.shop} — {item.key}: {item.errorMessage}
                </s-paragraph>
              ))}
          </s-stack>
        </s-box>
      ))}
    </s-stack>
  );
}
