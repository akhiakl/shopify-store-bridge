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
                <s-stack key={target.id} direction="inline" gap="small-100">
                  <s-paragraph>{target.store.shop}</s-paragraph>
                  <s-badge tone={STATUS_TONE[target.status]}>
                    {target.status}
                  </s-badge>
                </s-stack>
              ))
            )}
          </s-stack>
        </s-box>
      ))}
    </s-stack>
  );
}
