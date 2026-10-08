import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { desc, eq } from "drizzle-orm";

import db from "~/db.server";
import { syncJobs } from "~/db/syncJobsSchema.server";

import {
  canStyleCheckout,
  readCheckoutStyling,
} from "./checkoutStyling.server";
import { getCollections } from "./collections.server";
import { planCollectionRules } from "./collectionRules.server";
import { getDefinitionCatalog, getShopPolicies } from "./definitions.server";
import { getMetafieldValueSets } from "./metafieldValues.server";
import { getMetaobjectEntries } from "./metaobjectEntries.server";
import { getMenus, planMenus } from "./menus.server";
import { getLocations } from "./locations.server";
import { planDeliveryProfile } from "./deliveryProfiles.server";
import type { SyncPlan } from "./syncTarget.server";

type MetafieldSelector = { ownerType: string; namespace: string; key: string };

export interface ParsedSelection {
  metaobjectTypes: string[];
  metafieldSelectors: MetafieldSelector[];
  policyTypes: string[];
  collectionHandles: string[];
  metaobjectEntryTypes: string[];
  metafieldValueSelectors: MetafieldSelector[];
  menuHandles: string[];
  locationNames: string[];
  deliveryProfileIds: string[];
  checkoutStyling: boolean;
}

/** Inverse of the `definitionKey` helpers in the checkbox components
 * (`metaobject:<type>`, `metafield:<ownerType>:<namespace>:<key>`,
 * `policy:<type>`, `collection:<handle>`, `metaobjectEntries:<type>`,
 * `metafieldValues:<ownerType>:<namespace>:<key>`, `menu:<handle>`, `location:<name>`, `deliveryProfile:<numeric id>`, `checkoutStyling`): safe to split on ":" since
 * Shopify's own validation rules for type/namespace/key (alphanumeric,
 * hyphen, underscore only) rule out embedded colons, and `ShopPolicyType`
 * is itself an enum of bare uppercase names. Collection and menu handles
 * and location names are the last segment, so they're rejoined rather
 * than assumed colon-free. */
export function parseSelection(keys: string[]): ParsedSelection {
  const parsed: ParsedSelection = {
    metaobjectTypes: [],
    metafieldSelectors: [],
    policyTypes: [],
    collectionHandles: [],
    metaobjectEntryTypes: [],
    metafieldValueSelectors: [],
    menuHandles: [],
    locationNames: [],
    deliveryProfileIds: [],
    checkoutStyling: false,
  };
  for (const key of keys) {
    const [kind, ...rest] = key.split(":");
    if (kind === "checkoutStyling") {
      parsed.checkoutStyling = true;
    } else if (kind === "metaobject") {
      parsed.metaobjectTypes.push(rest[0]);
    } else if (kind === "metafield") {
      const [ownerType, namespace, fieldKey] = rest;
      parsed.metafieldSelectors.push({ ownerType, namespace, key: fieldKey });
    } else if (kind === "policy") {
      parsed.policyTypes.push(rest[0]);
    } else if (kind === "collection") {
      parsed.collectionHandles.push(rest.join(":"));
    } else if (kind === "deliveryProfile" && /^\d+$/.test(rest[0] ?? "")) {
      parsed.deliveryProfileIds.push(rest[0]);
    } else if (kind === "location") {
      parsed.locationNames.push(rest.join(":"));
    } else if (kind === "menu") {
      parsed.menuHandles.push(rest.join(":"));
    } else if (kind === "metaobjectEntries") {
      parsed.metaobjectEntryTypes.push(rest[0]);
    } else if (kind === "metafieldValues") {
      const [ownerType, namespace, fieldKey] = rest;
      parsed.metafieldValueSelectors.push({
        ownerType,
        namespace,
        key: fieldKey,
      });
    }
  }
  return parsed;
}

/** Throws (failing the job with this message) when the source can't
 * share its checkout styling, rather than planning nothing. */
async function planCheckoutStyling(sourceAdmin: AdminApiContext) {
  if (!(await canStyleCheckout(sourceAdmin))) {
    throw new Error(
      "The source store isn't on Shopify Plus, so its checkout styling can't be read.",
    );
  }
  const published = await readCheckoutStyling(sourceAdmin);
  if (!published) {
    throw new Error(
      "The source store has no published checkout configuration.",
    );
  }
  return published.styling;
}

/** Never trusts the browser for the actual definition shape, only the
 * selection *keys* cross the wire; the definitions themselves are read
 * from the source store when the job starts. */
export async function resolvePlan(
  sourceAdmin: AdminApiContext,
  selection: ParsedSelection,
): Promise<SyncPlan> {
  const [catalog, allPolicies, allCollections, allMenus, allLocations] =
    await Promise.all([
      getDefinitionCatalog(sourceAdmin),
      getShopPolicies(sourceAdmin),
      getCollections(sourceAdmin),
      selection.menuHandles.length ? getMenus(sourceAdmin) : [],
      selection.locationNames.length ? getLocations(sourceAdmin) : [],
    ]);
  const metaobjectDefinitions = catalog.metaobjectDefinitions.filter((def) =>
    selection.metaobjectTypes.includes(def.type),
  );
  const matches =
    (selectors: MetafieldSelector[]) => (def: MetafieldSelector) =>
      selectors.some(
        (sel) =>
          sel.ownerType === def.ownerType &&
          sel.namespace === def.namespace &&
          sel.key === def.key,
      );
  const metafieldDefinitions = catalog.metafieldDefinitions.filter(
    matches(selection.metafieldSelectors),
  );
  const shopPolicies = allPolicies.filter((policy) =>
    selection.policyTypes.includes(policy.type),
  );
  const collections = await Promise.all(
    allCollections
      .filter((collection) =>
        selection.collectionHandles.includes(collection.handle),
      )
      .map(async (collection) => ({
        ...collection,
        rules: await planCollectionRules(sourceAdmin, collection.handle),
      })),
  );
  // Only types that still exist on the source; entries are read after the
  // catalog so a stale or forged type key never triggers a query.
  const entryTypes = catalog.metaobjectDefinitions
    .map((def) => def.type)
    .filter((type) => selection.metaobjectEntryTypes.includes(type));
  const metaobjectEntries = await getMetaobjectEntries(sourceAdmin, entryTypes);
  // Same: only definitions that still exist on the source are queried.
  const metafieldValues = await getMetafieldValueSets(
    sourceAdmin,
    catalog.metafieldDefinitions.filter(
      matches(selection.metafieldValueSelectors),
    ),
  );
  // The Shop has exactly one record per store, so its value needs no
  // owner lookup: just the definition, read at sync time.
  const shopMetafieldValues = catalog.metafieldDefinitions.filter(
    (def) =>
      def.ownerType === "SHOP" &&
      matches(selection.metafieldValueSelectors)(def),
  );
  // A profile gone from the source plans as null and is dropped.
  const deliveryProfiles = (
    await Promise.all(
      selection.deliveryProfileIds.map((id) =>
        planDeliveryProfile(sourceAdmin, `gid://shopify/DeliveryProfile/${id}`),
      ),
    )
  ).filter((profile) => profile !== null);
  const menus = await planMenus(
    sourceAdmin,
    allMenus.filter((menu) => selection.menuHandles.includes(menu.handle)),
  );
  return {
    checkoutStyling: selection.checkoutStyling
      ? await planCheckoutStyling(sourceAdmin)
      : undefined,
    metaobjectDefinitions,
    metafieldDefinitions,
    shopPolicies,
    collections,
    metaobjectEntries,
    metafieldValues,
    shopMetafieldValues,
    menus,
    locations: allLocations.filter((location) =>
      selection.locationNames.includes(location.name),
    ),
    deliveryProfiles,
  };
}

export async function getJobHistory(connectionId: string) {
  return db.query.syncJobs.findMany({
    where: eq(syncJobs.connectionId, connectionId),
    // The page polls this while a job runs; the plan can be thousands of
    // entries and the UI never needs it.
    columns: { plan: false },
    with: { items: true },
    orderBy: [desc(syncJobs.startedAt)],
    limit: 20,
  });
}
