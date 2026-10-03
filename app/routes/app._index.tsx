import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { getDashboardData, getRecentJobs } from "~/utils/dashboard.server";
import { JOB_STATUS_TONE } from "~/utils/syncJobStatusTone";

import { authenticate } from "../shopify.server";

/**
 * App Home: quick counts, recent sync activity across this store's
 * connections (both directions), and links into "Connected stores" and
 * each connection.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const dashboard = await getDashboardData(session.shop);
  const recentJobs = await getRecentJobs(
    [...dashboard.outgoing, ...dashboard.incoming].map((c) => c.id),
  );
  return { ...dashboard, recentJobs };
};

export default function Index() {
  const { outgoing, incomingRequests, incoming, recentJobs } =
    useLoaderData<typeof loader>();

  const syncsTo = outgoing.filter((c) => c.status === "APPROVED").length;
  const pullsFrom = incoming.filter((c) => c.status === "APPROVED").length;
  const pendingInvites = outgoing.filter((c) => c.status === "PENDING").length;

  if (
    outgoing.length === 0 &&
    pullsFrom === 0 &&
    incomingRequests.length === 0
  ) {
    return (
      <s-page heading="StoreBridge">
        <s-section heading="Welcome to StoreBridge">
          <s-paragraph>
            You haven&apos;t connected any stores yet: start on Connected stores
            to send a pairing request.
          </s-paragraph>
          <s-link href="/app/stores">Connected stores</s-link>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="StoreBridge">
      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-paragraph>Syncs to {syncsTo} store(s)</s-paragraph>
          {pullsFrom > 0 && (
            <s-paragraph>Pulls from {pullsFrom} store(s)</s-paragraph>
          )}
          {pendingInvites > 0 && (
            <s-paragraph>
              {pendingInvites} invite(s) awaiting approval
            </s-paragraph>
          )}
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
                <s-link href={`/app/connections/${job.connectionId}`}>
                  {job.connection.source.shop} → {job.connection.target.shop}
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
