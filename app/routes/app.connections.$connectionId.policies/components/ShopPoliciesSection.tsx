import { shopPolicyKey } from "~/utils/sync/definitionKey";
import type { ShopPolicyRow } from "~/utils/sync/definitions.server";

interface ShopPoliciesSectionProps {
  policies: ShopPolicyRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/**
 * Shop policies (refund, shipping, privacy, etc.): pure text, no
 * cross-store record reference, so unlike menus/metaobjects this category
 * isn't wired into "Check sync status" yet (see #116's PR description for
 * that scope cut).
 */
export function ShopPoliciesSection({
  policies,
  selected,
  onToggle,
}: ShopPoliciesSectionProps) {
  if (policies.length === 0) {
    return <s-paragraph>No shop policies found.</s-paragraph>;
  }

  const keys = policies.map((policy) => shopPolicyKey(policy.type));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-checkbox
        label={`Select all (${policies.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {policies.map((policy) => {
        const key = shopPolicyKey(policy.type);
        return (
          <s-checkbox
            key={key}
            label={policy.title}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
