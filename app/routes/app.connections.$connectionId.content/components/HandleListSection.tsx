interface HandleListItem {
  handle: string;
  title: string;
  /** Extra text after the handle, such as an article count. */
  note?: string;
}

interface HandleListSectionProps {
  items: HandleListItem[];
  /** The selection key for one item's handle. */
  toKey: (handle: string) => string;
  /** What syncs, shown on every row. */
  details: string;
  emptyText: string;
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/** A select-all list of records picked by handle (pages, blogs). */
export function HandleListSection({
  items,
  toKey,
  details,
  emptyText,
  selected,
  onToggle,
}: HandleListSectionProps) {
  if (items.length === 0) return <s-paragraph>{emptyText}</s-paragraph>;

  const keys = items.map((item) => toKey(item.handle));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-checkbox
        label={`Select all (${items.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {items.map((item) => {
        const key = toKey(item.handle);
        const suffix = item.note ? `, ${item.note}` : "";
        return (
          <s-checkbox
            key={key}
            label={`${item.title} (${item.handle}${suffix})`}
            details={details}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
