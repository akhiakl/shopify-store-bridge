import { metafieldValuesKey } from "~/utils/sync/definitionKey";
import type { MetafieldDefinitionRow } from "~/utils/sync/definitions.server";
import { VALUE_CAP_PER_DEFINITION } from "~/utils/sync/syncCaps";
import { isValueOwnerType } from "~/utils/sync/valueOwnerTypes";

interface MetafieldValuesSectionProps {
  definitions: MetafieldDefinitionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

const MATCHED_BY = {
  PRODUCT: "Products matched by handle.",
  COLLECTION: "Collections matched by handle.",
  CUSTOMER: "Customers matched by email.",
} as const;

function valueDetails(def: MetafieldDefinitionRow): string {
  const matched = isValueOwnerType(def.ownerType)
    ? MATCHED_BY[def.ownerType]
    : "";
  const cap =
    def.valueCount > VALUE_CAP_PER_DEFINITION
      ? ` Only the first ${VALUE_CAP_PER_DEFINITION} sync per job.`
      : "";
  return `${def.valueCount} values. ${matched}${cap}`;
}

/** Only definitions whose owners can be matched across stores, and that
 * have values, are listed. */
export function MetafieldValuesSection({
  definitions,
  selected,
  onToggle,
}: MetafieldValuesSectionProps) {
  const syncable = definitions.filter(
    (def) => isValueOwnerType(def.ownerType) && def.valueCount > 0,
  );
  if (syncable.length === 0) {
    return (
      <s-paragraph>
        No product, collection or customer metafield values found.
      </s-paragraph>
    );
  }

  const keys = syncable.map(metafieldValuesKey);
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-paragraph>
        Records with no match on a target are skipped and listed in job history.
        The target needs the definition too, so select it above if it
        doesn&apos;t have it yet. Customer values need protected customer data
        access approved for this app.
      </s-paragraph>
      <s-checkbox
        label={`Select all (${syncable.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {syncable.map((def) => {
        const key = metafieldValuesKey(def);
        return (
          <s-checkbox
            key={key}
            label={`${def.name} (${def.ownerType.toLowerCase()}: ${def.namespace}.${def.key})`}
            details={valueDetails(def)}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
