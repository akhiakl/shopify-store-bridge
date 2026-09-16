import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { getDashboardData, getRecentJobs } from "~/utils/dashboard.server";
import { JOB_STATUS_TONE } from "~/utils/syncJobStatusTone";

import { authenticate } from "../shopify.server";

/**
 * App Home — a real dashboard now that pairing and definition sync both
 * exist: quick counts, recent sync activity across every group this shop
 * owns, and links into "Connected stores" and each group's definitions
 * page. Replaces the earlier placeholder that just described what would
 * eventually live here.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const dashboard = await getDashboardData(session.shop);
  const recentJobs = await getRecentJobs(
    dashboard.ownedGroups.map((group) => group.id),
  );
  return { ...dashboard, recentJobs };
};

export default function Index() {
  const { ownedGroups, incomingRequests, recentJobs } =
    useLoaderData<typeof loader>();

  if (ownedGroups.length === 0) {
    return (
      <s-page heading="StoreBridge">
        <s-section heading="Welcome to StoreBridge">
          <s-paragraph>
            You haven&apos;t connected any stores yet — start on Connected
            stores to invite a target store into a sync group.
          </s-paragraph>
          <s-link href="/app/stores">Connected stores</s-link>
        </s-section>
      </s-page>
    );
  }

  const approvedTargetCount = ownedGroups.reduce(
    (total, group) =>
      total + group.targets.filter((t) => t.status === "APPROVED").length,
    0,
  );

  return (
    <s-page heading="StoreBridge">
      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-paragraph>{ownedGroups.length} sync group(s)</s-paragraph>
          <s-paragraph>{approvedTargetCount} approved target(s)</s-paragraph>
          {incomingRequests.length > 0 && (
            <s-paragraph>
              {incomingRequests.length} pairing request(s) awaiting your
              response
            </s-paragraph>
          )}
        </s-stack>
        <s-link href="/app/stores">Connected stores</s-link>
      </s-section>

      <s-section heading="Recent activity">
        {recentJobs.length === 0 ? (
          <s-paragraph>No syncs have been run yet.</s-paragraph>
        ) : (
          <s-stack gap="small-100">
            {recentJobs.map((job) => (
              <s-stack
                key={job.id}
                direction="inline"
                gap="small-100"
                alignItems="center"
              >
                <s-badge tone={JOB_STATUS_TONE[job.status]}>
                  {job.status}
                </s-badge>
                <s-link href={`/app/groups/${job.groupId}/definitions`}>
                  {job.group.name || "Untitled group"}
                </s-link>
                <s-paragraph>
                  {new Date(job.startedAt).toLocaleString()}
                </s-paragraph>
              </s-stack>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
