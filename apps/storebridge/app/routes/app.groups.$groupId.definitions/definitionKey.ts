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
