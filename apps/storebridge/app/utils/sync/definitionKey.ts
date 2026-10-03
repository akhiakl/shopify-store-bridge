import type {
  MetafieldDefinitionRow,
  MetaobjectDefinitionRow,
} from "./definitions.server";

/**
 * Selection-key format shared across this route: the checkbox UI
 * (`MetaobjectDefinitionsSection`/`MetafieldDefinitionsSection`), the sync
 * engine (`syncTarget.server.ts`, `sync.server.ts`'s `parseSelection`), and
 * the sync-status checker (`syncStatus.server.ts`) all need to agree on the
 * same `metaobject:<type>` / `metafield:<ownerType>:<namespace>:<key>`
 * shape to join their results back to one definition — promoted here once
 * a fourth consumer needed it, per AGENTS.md's "used elsewhere → promote"
 * rule.
 */
export function metaobjectDefinitionKey(def: MetaobjectDefinitionRow): string {
  return `metaobject:${def.type}`;
}

export function metafieldDefinitionKey(def: MetafieldDefinitionRow): string {
  return `metafield:${def.ownerType}:${def.namespace}:${def.key}`;
}

export function shopPolicyKey(type: string): string {
  return `policy:${type}`;
}

export function collectionKey(handle: string): string {
  return `collection:${handle}`;
}

/** Selection key for "sync this type's entries", distinct from the
 * `metaobject:<type>` key that syncs only the definition. */
export function metaobjectEntriesKey(type: string): string {
  return `metaobjectEntries:${type}`;
}

/** Job-history key for one synced entry. */
export function metaobjectEntryKey(entry: {
  type: string;
  handle: string;
}): string {
  return `metaobjectEntry:${entry.type}:${entry.handle}`;
}

/** Selection key for "sync this definition's values", distinct from the
 * `metafield:` key that syncs only the definition. */
export function metafieldValuesKey(def: {
  ownerType: string;
  namespace: string;
  key: string;
}): string {
  return `metafieldValues:${def.ownerType}:${def.namespace}:${def.key}`;
}

/** Job-history key for one record's value. `record` is a handle for
 * products and collections, but the source GID for customers, so customer
 * emails never end up in StoreBridge's database. */
export function metafieldValueKey(
  def: { ownerType: string; namespace: string; key: string },
  record: string,
): string {
  return `metafieldValue:${def.ownerType}:${def.namespace}:${def.key}:${record}`;
}

export function menuKey(handle: string): string {
  return `menu:${handle}`;
}

/** Job-history key for a menu item that couldn't be synced. `path` is its
 * titles from the top level down, joined with " > ". */
export function menuItemKey(menuHandle: string, path: string): string {
  return `menuItem:${menuHandle}:${path}`;
}
