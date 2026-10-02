import type { CollectionRow } from "../collections.server";
import { collectionKey } from "../definitionKey";

interface CollectionsSectionProps {
  collections: CollectionRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/** Spelled out per row: a collection arriving empty on a target would
 * otherwise look like a bug. */
const SYNC_SCOPE =
  "Title, description, SEO and sort order. Products and smart-collection conditions aren't synced yet.";

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
