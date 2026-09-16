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
