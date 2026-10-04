import type { getJobHistory } from "~/utils/sync/sync.server";
import { JOB_STATUS_TONE } from "~/utils/syncJobStatusTone";

import { summarizeSelection } from "../utils/summarizeSelection";
import { JobDetailsModal } from "./JobDetailsModal";

type JobHistory = Awaited<ReturnType<typeof getJobHistory>>;
type Job = JobHistory[number];

const JOB_STATUS_LABEL = {
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  PARTIAL: "Partly failed",
} as const;

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** One line for the Result column: progress while running, the job's
 * own error if it failed before syncing anything, otherwise the item
 * counts (zero skipped/failed left out). */
function resultText(job: Job): string {
  if (job.status === "QUEUED") return "Reading the source store…";
  if (job.status === "RUNNING") {
    return `${job.stepsDone} of ${job.stepsTotal} steps done`;
  }
  const attempted = job.itemsSynced + job.itemsSkipped + job.itemsFailed;
  if (job.errorMessage && attempted === 0) return job.errorMessage;

  const parts = [`${job.itemsSynced} synced`];
  if (job.itemsSkipped > 0) parts.push(`${job.itemsSkipped} skipped`);
  if (job.itemsFailed > 0) parts.push(`${job.itemsFailed} failed`);
  return parts.join(" · ");
}

/** "Sync now" runs on this connection, newest first, one row each;
 * per-item detail opens in a modal so the table stays scannable. Job
 * status legible at a glance per AGENTS.md §9. */
export function JobHistoryList({ jobs }: { jobs: JobHistory }) {
  if (jobs.length === 0) {
    return <s-paragraph>No syncs have been run yet.</s-paragraph>;
  }

  return (
    <>
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Started</s-table-header>
          <s-table-header listSlot="inline">Status</s-table-header>
          <s-table-header listSlot="secondary">Synced</s-table-header>
          <s-table-header listSlot="labeled">Result</s-table-header>
          <s-table-header>
            <s-text accessibilityVisibility="exclusive">Details</s-text>
          </s-table-header>
        </s-table-header-row>
        <s-table-body>
          {jobs.map((job) => {
            const selection = job.selection as string[];
            return (
              <s-table-row key={job.id}>
                <s-table-cell>
                  {new Date(job.startedAt).toLocaleString(
                    undefined,
                    DATE_FORMAT,
                  )}
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={JOB_STATUS_TONE[job.status]}>
                    {JOB_STATUS_LABEL[job.status]}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  {summarizeSelection(selection)} ({selection.length})
                </s-table-cell>
                <s-table-cell>{resultText(job)}</s-table-cell>
                <s-table-cell>
                  <s-button
                    variant="tertiary"
                    commandFor={`job-${job.id}`}
                    command="--show"
                  >
                    View details
                  </s-button>
                </s-table-cell>
              </s-table-row>
            );
          })}
        </s-table-body>
      </s-table>
      {/* Modals sit outside the table: its rows only take cells. */}
      {jobs.map((job) => (
        <JobDetailsModal key={job.id} id={`job-${job.id}`} job={job} />
      ))}
    </>
  );
}
