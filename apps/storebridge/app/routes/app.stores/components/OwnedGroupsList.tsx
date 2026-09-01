import { useFetcher } from "react-router";

import type { DashboardData } from "../pairing.server";

interface OwnedGroupsListProps {
  groups: DashboardData["ownedGroups"];
}

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  DECLINED: "critical",
} as const;

/** Sync groups the current store owns as a source, with each target's status. */
export function OwnedGroupsList({ groups }: OwnedGroupsListProps) {
  if (groups.length === 0) {
    return (
      <s-paragraph>You haven&apos;t paired with any stores yet.</s-paragraph>
    );
  }

  return (
    <s-stack gap="base">
      {groups.map((group) => (
        <s-box key={group.id} padding="base" border="base" borderRadius="base">
          <s-stack gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-heading>{group.name || "Untitled group"}</s-heading>
              <s-link href={`/app/groups/${group.id}/definitions`}>
                Sync definitions
              </s-link>
            </s-stack>
            {group.targets.length === 0 ? (
              <s-paragraph>No target stores invited yet.</s-paragraph>
            ) : (
              group.targets.map((target) => (
                <TargetRow key={target.id} target={target} />
              ))
            )}
          </s-stack>
        </s-box>
      ))}
    </s-stack>
  );
}

type RegenerateActionData =
  { ok: true; authorizeUrl: string } | { ok: false; error: string };

/** A source's own view of one target's pairing status — adds a "Resend
 * link" action for PENDING targets (see pairing.server.ts's
 * regeneratePairingRequest for why this is source-, not
 * target-authorized). APPROVED/DECLINED are terminal; no active token to
 * reissue. */
function TargetRow({
  target,
}: {
  target: DashboardData["ownedGroups"][number]["targets"][number];
}) {
  const fetcher = useFetcher<RegenerateActionData>();
  const isRegenerating = fetcher.state !== "idle";
  const data = fetcher.data;

  return (
    <s-stack gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-paragraph>{target.store.shop}</s-paragraph>
        <s-badge tone={STATUS_TONE[target.status]}>{target.status}</s-badge>
        {target.status === "PENDING" && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="regenerate" />
            <input type="hidden" name="targetId" value={target.id} />
            <s-button loading={isRegenerating} type="submit">
              Resend link
            </s-button>
          </fetcher.Form>
        )}
      </s-stack>
      {data && !data.ok && (
        <s-banner tone="critical" heading={data.error}></s-banner>
      )}
      {data?.ok && (
        <s-banner tone="success" heading="New link generated">
          <s-paragraph>
            The old link no longer works — send this one instead. Expires in 48
            hours.
          </s-paragraph>
          <s-text-field
            label="Authorization link"
            value={data.authorizeUrl}
            readOnly
          ></s-text-field>
        </s-banner>
      )}
    </s-stack>
  );
}
