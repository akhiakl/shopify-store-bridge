import type { DashboardData } from "~/utils/dashboard.server";

interface MembershipsListProps {
  memberships: DashboardData["memberships"];
}

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  DECLINED: "critical",
} as const;

/** Sync groups the current store has responded to as a target. */
export function MembershipsList({ memberships }: MembershipsListProps) {
  return (
    <s-stack gap="base">
      {memberships.map((membership) => (
        <s-stack key={membership.id} direction="inline" gap="small-100">
          <s-paragraph>
            {membership.group.source.shop}
            {membership.group.name ? ` — ${membership.group.name}` : ""}
          </s-paragraph>
          <s-badge tone={STATUS_TONE[membership.status]}>
            {membership.status}
          </s-badge>
        </s-stack>
      ))}
    </s-stack>
  );
}
