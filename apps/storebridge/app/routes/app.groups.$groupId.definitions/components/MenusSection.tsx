import { menuKey } from "~/utils/sync/definitionKey";
import type { MenuRow, SourceMenuItem } from "~/utils/sync/menus.server";

interface MenusSectionProps {
  menus: MenuRow[];
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/** Link types with no shared identity across stores yet. */
const UNSYNCABLE = new Set([
  "PAGE",
  "BLOG",
  "ARTICLE",
  "CUSTOMER_ACCOUNT_PAGE",
]);

function countItems(items: SourceMenuItem[]): {
  all: number;
  unsyncable: number;
} {
  return items.reduce(
    (total, item) => {
      const sub = countItems(item.items ?? []);
      return {
        all: total.all + 1 + sub.all,
        unsyncable:
          total.unsyncable +
          (UNSYNCABLE.has(item.type) ? 1 : 0) +
          sub.unsyncable,
      };
    },
    { all: 0, unsyncable: 0 },
  );
}

function menuDetails(menu: MenuRow): string {
  const { all, unsyncable } = countItems(menu.items);
  const dropped = unsyncable
    ? ` ${unsyncable} page, blog or account links can't sync yet and will be dropped.`
    : "";
  return `${all} item${all === 1 ? "" : "s"}.${dropped}`;
}

export function MenusSection({ menus, selected, onToggle }: MenusSectionProps) {
  if (menus.length === 0) {
    return <s-paragraph>No menus found.</s-paragraph>;
  }

  const keys = menus.map((menu) => menuKey(menu.handle));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return (
    <s-stack gap="small-100">
      <s-paragraph>
        A menu replaces the target menu with the same handle, or is created.
        Product, collection and metaobject links are matched by handle, and
        policy links by policy type. A link with no match on a target is dropped
        and listed in job history, so sync the records it points at first, or in
        the same job.
      </s-paragraph>
      <s-checkbox
        label={`Select all (${menus.length})`}
        checked={selectedCount === keys.length}
        indeterminate={selectedCount > 0 && selectedCount < keys.length}
        onChange={(e) => onToggle(keys, e.currentTarget.checked)}
      ></s-checkbox>
      {menus.map((menu) => {
        const key = menuKey(menu.handle);
        return (
          <s-checkbox
            key={key}
            label={`${menu.title} (${menu.handle})`}
            details={menuDetails(menu)}
            checked={selected.has(key)}
            onChange={(e) => onToggle([key], e.currentTarget.checked)}
          ></s-checkbox>
        );
      })}
    </s-stack>
  );
}
