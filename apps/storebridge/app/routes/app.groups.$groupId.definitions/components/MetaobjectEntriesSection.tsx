import { metaobjectEntriesKey } from "~/utils/sync/definitionKey";
import type { MetaobjectDefinitionRow } from "~/utils/sync/definitions.server";
import { ENTRY_CAP_PER_TYPE } from "~/utils/sync/entryCap";

interface MetaobjectEntriesSectionProps {
  definitions: MetaobjectDefinitionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

function entryDetails(entryCount: number): string {
  if (entryCount > ENTRY_CAP_PER_TYPE) {
    return `${entryCount} entries. Only the first ${ENTRY_CAP_PER_TYPE} sync per job.`;
  }
  return `${entryCount} entries`;
}

/** Only types that have entries are listed — selecting an empty type
 * would just fail the job as having nothing to sync. */
export function MetaobjectEntriesSection({
  definitions,
  selected,
  onToggle,
}: MetaobjectEntriesSectionProps) {
  const withEntries = definitions.filter((def) => def.entryCount > 0);
  if (withEntries.length === 0) {
    return <s-paragraph>No metaobject entries found.</s-paragraph>;
  }

  const keys = withEntries.map((def) => metaobjectEntriesKey(def.type));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-paragraph>
        Entries are matched by handle. The target needs the definition too, so
        select it above if the target doesn&apos;t have it yet.
      </s-paragraph>
      <s-checkbox
        label={`Select all (${withEntries.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {withEntries.map((def) => {
        const key = metaobjectEntriesKey(def.type);
        return (
          <s-checkbox
            key={key}
            label={`${def.name} (${def.type})`}
            details={entryDetails(def.entryCount)}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
