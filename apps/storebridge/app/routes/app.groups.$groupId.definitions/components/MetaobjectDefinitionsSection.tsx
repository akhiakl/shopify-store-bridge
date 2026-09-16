import { metaobjectDefinitionKey } from "../definitionKey";
import type { MetaobjectDefinitionRow } from "../definitions.server";
import type { DefinitionStatusSummary } from "../syncStatus.server";
import { SyncStatusBadge } from "./SyncStatusBadge";

interface MetaobjectDefinitionsSectionProps {
  definitions: MetaobjectDefinitionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
  statusByKey?: Record<string, DefinitionStatusSummary>;
}

/**
 * Metaobject definitions aren't namespaced the way metafield definitions
 * are (see AGENTS.md's product notes) — `type` is their own identifier, so
 * this is a flat list rather than the two-level grouping metafields get.
 */
export function MetaobjectDefinitionsSection({
  definitions,
  selected,
  onToggle,
  statusByKey,
}: MetaobjectDefinitionsSectionProps) {
  if (definitions.length === 0) {
    return <s-paragraph>No metaobject definitions found.</s-paragraph>;
  }

  const keys = definitions.map(metaobjectDefinitionKey);
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-checkbox
        label={`Select all (${definitions.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {definitions.map((def) => {
        const key = metaobjectDefinitionKey(def);
        return (
          <s-stack
            key={key}
            direction="inline"
            gap="small-100"
            alignItems="center"
          >
            <s-checkbox
              label={`${def.name} (${def.type})`}
              details={`${def.fieldCount} field(s)`}
              checked={selected.has(key)}
              onChange={(e) => onToggle([key], e.currentTarget.checked)}
            ></s-checkbox>
            <SyncStatusBadge summary={statusByKey?.[key]} />
          </s-stack>
        );
      })}
    </s-stack>
  );
}
