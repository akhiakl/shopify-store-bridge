import type { getJobHistory } from "~/utils/sync/sync.server";

import { describeSyncKey } from "../utils/describeSyncKey";

type Job = Awaited<ReturnType<typeof getJobHistory>>[number];

/** Failures, plus skips that carry a reason (e.g. no matching record on
 * the target); a plain "already exists" skip has none and isn't worth a
 * row. */
function issuesOf(job: Job) {
  return job.items.filter(
    (item) =>
      item.status === "FAILED" ||
      (item.status === "SKIPPED" && item.errorMessage),
  );
}

function IssuesTable({ issues }: { issues: Job["items"] }) {
  return (
    <s-table>
      <s-table-header-row>
        <s-table-header listSlot="primary">Item</s-table-header>
        <s-table-header listSlot="inline">Outcome</s-table-header>
        <s-table-header listSlot="secondary">Reason</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {issues.map((item) => {
          const { type, name } = describeSyncKey(item.key);
          return (
            <s-table-row key={`${item.kind}-${item.key}`}>
              <s-table-cell>
                <s-stack gap="small-500">
                  <s-text>{name}</s-text>
                  <s-text color="subdued">{type}</s-text>
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <s-badge
                  tone={item.status === "FAILED" ? "critical" : "warning"}
                >
                  {item.status === "FAILED" ? "Failed" : "Skipped"}
                </s-badge>
              </s-table-cell>
              <s-table-cell>{item.errorMessage}</s-table-cell>
            </s-table-row>
          );
        })}
      </s-table-body>
    </s-table>
  );
}

/** One job's full outcome, opened from its Job history row: counts, the
 * items that failed or were skipped for a reason, then what was
 * requested. */
export function JobDetailsModal({ id, job }: { id: string; job: Job }) {
  const issues = issuesOf(job);
  const requested = (job.selection as string[]).map(describeSyncKey);

  return (
    <s-modal id={id} heading="Sync details" size="large">
      <s-stack gap="base">
        {job.errorMessage && (
          <s-banner tone="critical" heading={job.errorMessage}></s-banner>
        )}
        <s-text color="subdued">
          {job.itemsSynced} synced · {job.itemsSkipped} skipped ·{" "}
          {job.itemsFailed} failed
        </s-text>
        {issues.length === 0 ? (
          <s-paragraph color="subdued">
            Nothing needs your attention.
          </s-paragraph>
        ) : (
          <IssuesTable issues={issues} />
        )}
        <s-divider />
        <s-stack gap="small-200">
          <s-text type="strong">Requested ({requested.length})</s-text>
          <s-unordered-list>
            {requested.map(({ type, name }) => (
              <s-list-item key={`${type}-${name}`}>
                {type}: {name}
              </s-list-item>
            ))}
          </s-unordered-list>
        </s-stack>
      </s-stack>
      <s-button slot="secondary-actions" commandFor={id} command="--hide">
        Close
      </s-button>
    </s-modal>
  );
}
