/** `SyncJob.status` → Polaris badge tone. Promoted out of
 * `JobHistoryList.tsx` once the Home dashboard's recent-activity list
 * needed the same mapping. */
export const JOB_STATUS_TONE = {
  RUNNING: "info",
  SUCCEEDED: "success",
  FAILED: "critical",
  PARTIAL: "warning",
} as const;
