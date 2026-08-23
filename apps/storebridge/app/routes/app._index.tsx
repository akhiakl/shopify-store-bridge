import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import { getDashboardData } from "~/routes/app.stores/pairing.server";

/**
 * App Home — a summary of this shop's pairing activity, not a dashboard
 * of its own separate data. Everything here is a subset of what
 * /app/stores already shows in full; this page exists to surface what
 * needs attention (a pending incoming request) before the merchant goes
 * looking for it.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getDashboardData(session.shop);
};

function StatLink({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <s-link href={href}>
      <s-stack gap="small-200">
        <s-heading>{value}</s-heading>
        <s-text color="subdued">{label}</s-text>
      </s-stack>
    </s-link>
  );
}

export default function Index() {
  const { ownedGroups, incomingRequests, memberships } =
    useLoaderData<typeof loader>();
  const pendingCount = incomingRequests.length;

  return (
    <s-page heading="StoreBridge">
      {pendingCount > 0 && (
        <s-banner
          tone="info"
          heading={`${pendingCount} pairing ${pendingCount === 1 ? "request" : "requests"} waiting on you`}
        >
          <s-paragraph>
            Review and approve or decline under{" "}
            <s-link href="/app/stores">Connected stores</s-link>.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Overview">
        <s-paragraph>
          StoreBridge groups the stores you own into sync groups, invites a
          target store into one, and lets that target approve the pairing from
          its own admin — no shared login required, see{" "}
          <s-link href="/app/stores">Connected stores</s-link> to manage it.
        </s-paragraph>
        <s-stack direction="inline" gap="large">
          <StatLink
            label="Sync groups you own"
            value={ownedGroups.length}
            href="/app/stores"
          />
          <StatLink
            label="Pending requests"
            value={pendingCount}
            href="/app/stores"
          />
          <StatLink
            label="Stores you're paired into"
            value={memberships.length}
            href="/app/stores"
          />
        </s-stack>
      </s-section>
    </s-page>
  );
}
