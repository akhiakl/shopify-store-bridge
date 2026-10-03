import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { desc, eq } from "drizzle-orm";

import db from "~/db.server";
import { syncJobs } from "~/db/syncJobsSchema.server";

import { getCollections } from "./collections.server";
import { getDefinitionCatalog, getShopPolicies } from "./definitions.server";
import { getMetaobjectEntries } from "./metaobjectEntries.server";
import type { SyncPlan } from "./syncTarget.server";

export interface ParsedSelection {
  metaobjectTypes: string[];
  metafieldSelectors: { ownerType: string; namespace: string; key: string }[];
  policyTypes: string[];
  collectionHandles: string[];
  metaobjectEntryTypes: string[];
}

/** Inverse of the `definitionKey` helpers in the checkbox components
 * (`metaobject:<type>`, `metafield:<ownerType>:<namespace>:<key>`,
 * `policy:<type>`, `collection:<handle>`, `metaobjectEntries:<type>`) — safe to split on ":" since
 * Shopify's own validation rules for type/namespace/key (alphanumeric,
 * hyphen, underscore only) rule out embedded colons, and `ShopPolicyType`
 * is itself an enum of bare uppercase names. A collection handle is the
 * last segment, so it's rejoined rather than assumed colon-free. */
export function parseSelection(keys: string[]): ParsedSelection {
  const parsed: ParsedSelection = {
    metaobjectTypes: [],
    metafieldSelectors: [],
    policyTypes: [],
    collectionHandles: [],
    metaobjectEntryTypes: [],
  };
  for (const key of keys) {
    const [kind, ...rest] = key.split(":");
    if (kind === "metaobject") {
      parsed.metaobjectTypes.push(rest[0]);
    } else if (kind === "metafield") {
      const [ownerType, namespace, fieldKey] = rest;
      parsed.metafieldSelectors.push({ ownerType, namespace, key: fieldKey });
    } else if (kind === "policy") {
      parsed.policyTypes.push(rest[0]);
    } else if (kind === "collection") {
      parsed.collectionHandles.push(rest.join(":"));
    } else if (kind === "metaobjectEntries") {
      parsed.metaobjectEntryTypes.push(rest[0]);
    }
  }
  return parsed;
}

/** Never trusts the browser for the actual definition shape — only the
 * selection *keys* cross the wire; the definitions themselves are read
 * from the source store when the job starts. */
export async function resolvePlan(
  sourceAdmin: AdminApiContext,
  selection: ParsedSelection,
): Promise<SyncPlan> {
  const [catalog, allPolicies, allCollections] = await Promise.all([
    getDefinitionCatalog(sourceAdmin),
    getShopPolicies(sourceAdmin),
    getCollections(sourceAdmin),
  ]);
  const metaobjectDefinitions = catalog.metaobjectDefinitions.filter((def) =>
    selection.metaobjectTypes.includes(def.type),
  );
  const metafieldDefinitions = catalog.metafieldDefinitions.filter((def) =>
    selection.metafieldSelectors.some(
      (sel) =>
        sel.ownerType === def.ownerType &&
        sel.namespace === def.namespace &&
        sel.key === def.key,
    ),
  );
  const shopPolicies = allPolicies.filter((policy) =>
    selection.policyTypes.includes(policy.type),
  );
  const collections = allCollections.filter((collection) =>
    selection.collectionHandles.includes(collection.handle),
  );
  // Only types that still exist on the source; entries are read after the
  // catalog so a stale or forged type key never triggers a query.
  const entryTypes = catalog.metaobjectDefinitions
    .map((def) => def.type)
    .filter((type) => selection.metaobjectEntryTypes.includes(type));
  const metaobjectEntries = await getMetaobjectEntries(sourceAdmin, entryTypes);
  return {
    metaobjectDefinitions,
    metafieldDefinitions,
    shopPolicies,
    collections,
    metaobjectEntries,
  };
}

export async function getJobHistory(groupId: string) {
  return db.query.syncJobs.findMany({
    where: eq(syncJobs.groupId, groupId),
    // The page polls this while a job runs; the plan can be thousands of
    // entries and the UI never needs it.
    columns: { plan: false },
    with: { targets: { with: { store: true, items: true } } },
    orderBy: [desc(syncJobs.startedAt)],
    limit: 20,
  });
}
