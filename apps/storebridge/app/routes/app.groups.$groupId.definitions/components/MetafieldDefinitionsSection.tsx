import type { MetafieldDefinitionRow } from "../definitions.server";

interface MetafieldDefinitionsSectionProps {
  definitions: MetafieldDefinitionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

function definitionKey(def: MetafieldDefinitionRow): string {
  return `metafield:${def.ownerType}:${def.namespace}:${def.key}`;
}

/** ownerType -> namespace -> definitions, so the UI can offer a "select all
 * in this namespace" checkbox per the product spec (type, then namespace). */
function groupByOwnerAndNamespace(definitions: MetafieldDefinitionRow[]) {
  const byOwner = new Map<string, Map<string, MetafieldDefinitionRow[]>>();
  for (const def of definitions) {
    const byNamespace = byOwner.get(def.ownerType) ?? new Map();
    const rows = byNamespace.get(def.namespace) ?? [];
    rows.push(def);
    byNamespace.set(def.namespace, rows);
    byOwner.set(def.ownerType, byNamespace);
  }
  return byOwner;
}

export function MetafieldDefinitionsSection({
  definitions,
  selected,
  onToggle,
}: MetafieldDefinitionsSectionProps) {
  if (definitions.length === 0) {
    return <s-paragraph>No metafield definitions found.</s-paragraph>;
  }

  const grouped = groupByOwnerAndNamespace(definitions);

  return (
    <s-stack gap="base">
      {[...grouped.entries()].map(([ownerType, byNamespace]) => (
        <s-stack key={ownerType} gap="small-100">
          <s-heading>{ownerType}</s-heading>
          {[...byNamespace.entries()].map(([namespace, rows]) => {
            const keys = rows.map(definitionKey);
            const selectedCount = keys.filter((key) =>
              selected.has(key),
            ).length;
            return (
              <s-box
                key={namespace}
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-checkbox
                  label={`${namespace} (${rows.length})`}
                  checked={selectedCount === keys.length}
                  indeterminate={
                    selectedCount > 0 && selectedCount < keys.length
                  }
                  onChange={(e) => onToggle(keys, e.currentTarget.checked)}
                ></s-checkbox>
                <s-stack gap="small-100">
                  {rows.map((def) => {
                    const key = definitionKey(def);
                    return (
                      <s-checkbox
                        key={key}
                        label={`${def.name} (${def.key})`}
                        details={def.type}
                        checked={selected.has(key)}
                        onChange={(e) =>
                          onToggle([key], e.currentTarget.checked)
                        }
                      ></s-checkbox>
                    );
                  })}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      ))}
    </s-stack>
  );
}
