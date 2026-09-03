import { useFetcher } from "react-router";

import type { DashboardData } from "~/utils/dashboard.server";

interface OwnedGroupsListProps {
  groups: DashboardData["ownedGroups"];
}

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  DECLINED: "critical",
} as const;

/** Inline target-shop count before the row collapses to "and N more" — a
 * group with many targets shouldn't blow out its row height. */
const INLINE_TARGET_LIMIT = 3;

/** Sync groups the current store owns as a source, with each target's status. */
export function OwnedGroupsList({ groups }: OwnedGroupsListProps) {
  if (groups.length === 0) {
    return (
      <s-paragraph>You haven&apos;t paired with any stores yet.</s-paragraph>
    );
  }

  return (
    <s-stack gap="base">
      {groups.map((group) => {
        const visibleTargets = group.targets.slice(0, INLINE_TARGET_LIMIT);
        const remaining = group.targets.length - visibleTargets.length;
        return (
          <s-box
            key={group.id}
            padding="base"
            border="base"
            borderRadius="base"
          >
            <s-stack gap="small-100">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-heading>{group.name || "Untitled group"}</s-heading>
                {/* `href` confirmed against @shopify/polaris-types'
                    custom-elements.json — a documented s-button attribute,
                    not previously used elsewhere in this codebase (which
                    only passes type="submit"). */}
                <s-button href={`/app/groups/${group.id}/definitions`}>
                  View
                </s-button>
              </s-stack>
              {group.targets.length === 0 ? (
                <s-paragraph>No target stores invited yet.</s-paragraph>
              ) : (
                <>
                  {visibleTargets.map((target) => (
                    <TargetRow key={target.id} target={target} />
                  ))}
                  {remaining > 0 && (
                    <s-paragraph>and {remaining} more</s-paragraph>
                  )}
                </>
              )}
            </s-stack>
          </s-box>
        );
      })}
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
