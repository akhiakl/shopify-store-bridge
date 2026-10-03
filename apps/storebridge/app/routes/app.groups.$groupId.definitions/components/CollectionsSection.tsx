import type { CollectionRow } from "~/utils/sync/collections.server";
import { collectionKey } from "~/utils/sync/definitionKey";

interface CollectionsSectionProps {
  collections: CollectionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/** Spelled out per row, so a target collection whose rules were left
 * alone doesn't look like a bug. */
const SYNC_SCOPE =
  "Title, description, SEO, sort order and rules. Rules replace the target's, unless something they use (a product, metafield definition, entry or collection) isn't on that store.";

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
            details={SYNC_SCOPE}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
