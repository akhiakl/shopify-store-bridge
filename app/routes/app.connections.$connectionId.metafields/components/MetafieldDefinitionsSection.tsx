import { metafieldDefinitionKey } from "~/utils/sync/definitionKey";
import type { MetafieldDefinitionRow } from "~/utils/sync/definitions.server";
import type { DefinitionStatusSummary } from "~/utils/sync/syncStatus.server";
import { SyncStatusBadge } from "~/components/SyncStatusBadge";

interface MetafieldDefinitionsSectionProps {
  definitions: MetafieldDefinitionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
  statusByKey?: Record<string, DefinitionStatusSummary>;
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

/** Section headings for the owner types definitions.server.ts queries;
 * anything new falls back to the raw enum rather than a wrong guess. */
const OWNER_LABELS: Record<string, string> = {
  PRODUCT: "Products",
  PRODUCTVARIANT: "Product variants",
  COLLECTION: "Collections",
  CUSTOMER: "Customers",
  ORDER: "Orders",
  PAGE: "Pages",
  BLOG: "Blogs",
  ARTICLE: "Blog posts",
  SHOP: "Shop",
};

export function MetafieldDefinitionsSection({
  definitions,
  selected,
  onToggle,
  statusByKey,
}: MetafieldDefinitionsSectionProps) {
  if (definitions.length === 0) {
    return <s-paragraph>No metafield definitions found.</s-paragraph>;
  }

  const grouped = groupByOwnerAndNamespace(definitions);

  return (
    <s-stack gap="base">
      {[...grouped.entries()].map(([ownerType, byNamespace]) => (
        <s-stack key={ownerType} gap="small-100">
          <s-heading>{OWNER_LABELS[ownerType] ?? ownerType}</s-heading>
          {[...byNamespace.entries()].map(([namespace, rows]) => {
            const keys = rows.map(metafieldDefinitionKey);
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
                    const key = metafieldDefinitionKey(def);
                    return (
                      // A grid, not an inline stack: a checkbox fills
                      // its row, which pushed the badge onto its own line.
                      <s-grid
                        key={key}
                        gridTemplateColumns="1fr auto"
                        gap="base"
                        alignItems="center"
                      >
                        <s-checkbox
                          label={`${def.name} (${def.key})`}
                          details={def.type}
                          checked={selected.has(key)}
                          onChange={(e) =>
                            onToggle([key], e.currentTarget.checked)
                          }
                        ></s-checkbox>
                        <SyncStatusBadge summary={statusByKey?.[key]} />
                      </s-grid>
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
