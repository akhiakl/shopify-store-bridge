import type { CollectionRow } from "../collections.server";
import { collectionKey } from "../definitionKey";

interface CollectionsSectionProps {
  collections: CollectionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/** Spells out what actually syncs per collection type — a manual
 * collection arriving empty on a target would otherwise look like a bug. */
function syncScopeDetails(collection: CollectionRow): string {
  if (!collection.ruleSet) {
    return "Manual: title, description and SEO only. Products aren't synced.";
  }
  const count = collection.ruleSet.rules.length;
  return `Smart: ${count} rule(s). Matching products are picked up on the target automatically.`;
}

export function CollectionsSection({
  collections,
  selected,
  onToggle,
}: CollectionsSectionProps) {
  if (collections.length === 0) {
    return <s-paragraph>No collections found.</s-paragraph>;
  }

  const keys = collections.map((c) => collectionKey(c.handle));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-checkbox
        label={`Select all (${collections.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {collections.map((collection) => {
        const key = collectionKey(collection.handle);
        return (
          <s-checkbox
            key={key}
            label={`${collection.title} (${collection.handle})`}
            details={syncScopeDetails(collection)}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
