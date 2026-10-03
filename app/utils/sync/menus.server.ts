import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  referenceKind,
  resolveSourceRefs,
  type RecordRef,
} from "./metafieldReferences.server";
import { readTopLevelErrors } from "./runMutation.server";

/**
 * Scope read_online_store_navigation (covered by
 * write_online_store_navigation, see shopify.app.toml). Menus nest at most
 * three levels deep, so three levels of `items` read the whole tree.
 */
const MENUS_QUERY = `#graphql
  query MenusList {
    menus(first: 250) {
      nodes {
        handle
        title
        items {
          title type url resourceId tags
          items {
            title type url resourceId tags
            items { title type url resourceId tags }
          }
        }
      }
    }
  }
`;

/** Source policy GIDs, to translate SHOP_POLICY items into a policy type
 * the target can look up. Scope read_legal_policies. */
export const SHOP_POLICY_IDS_QUERY = `#graphql
  query ShopPolicyIds {
    shop { shopPolicies { id type } }
  }
`;

export interface SourceMenuItem {
  title: string;
  type: string;
  url: string | null;
  resourceId: string | null;
  tags: string[];
  items?: SourceMenuItem[];
}

export interface MenuRow {
  handle: string;
  title: string;
  items: SourceMenuItem[];
}

/** What a planned item links to on the target. `unsupported` items are
 * dropped at sync time with `reason` shown in job history. */
export type MenuItemLink =
  | { kind: "plain"; url: string | null }
  | { kind: "record"; ref: RecordRef }
  | { kind: "policy"; policyType: string }
  | { kind: "unsupported"; reason: string };

export interface PlannedMenuItem {
  title: string;
  type: string;
  tags: string[];
  link: MenuItemLink;
  items: PlannedMenuItem[];
}

export interface PlannedMenu {
  handle: string;
  title: string;
  items: PlannedMenuItem[];
}

/** Item types that link to no specific record. */
const PLAIN_TYPES = new Set([
  "FRONTPAGE",
  "CATALOG",
  "COLLECTIONS",
  "SEARCH",
  "HTTP",
]);

export async function getMenus(admin: AdminApiContext): Promise<MenuRow[]> {
  const response = await admin.graphql(MENUS_QUERY);
  const { data } = await response.json();
  return data?.menus?.nodes ?? [];
}

function flatten(items: SourceMenuItem[]): SourceMenuItem[] {
  return items.flatMap((item) => [item, ...flatten(item.items ?? [])]);
}

async function sourcePolicyTypes(
  admin: AdminApiContext,
): Promise<Map<string, string>> {
  const response = await admin.graphql(SHOP_POLICY_IDS_QUERY);
  const body = (await response.json()) as {
    data?: { shop?: { shopPolicies: { id: string; type: string }[] } };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  return new Map(
    (body.data?.shop?.shopPolicies ?? []).map((p) => [p.id, p.type]),
  );
}

interface LinkLookups {
  refs: Map<string, RecordRef>;
  policies: Map<string, string>;
}

function linkFor(item: SourceMenuItem, lookups: LinkLookups): MenuItemLink {
  if (PLAIN_TYPES.has(item.type)) return { kind: "plain", url: item.url };
  const id = item.resourceId ?? "";
  if (item.type === "SHOP_POLICY") {
    const policyType = lookups.policies.get(id);
    return policyType
      ? { kind: "policy", policyType }
      : { kind: "unsupported", reason: "Its policy no longer exists." };
  }
  if (referenceKind(`${item.type.toLowerCase()}_reference`)) {
    const ref = lookups.refs.get(id);
    return ref
      ? { kind: "record", ref }
      : {
          kind: "unsupported",
          reason: "It links to a record deleted on the source store.",
        };
  }
  return {
    kind: "unsupported",
    reason: `${item.type.toLowerCase()} links can't be synced yet.`,
  };
}

function planItems(
  items: SourceMenuItem[],
  lookups: LinkLookups,
): PlannedMenuItem[] {
  return items.map((item) => ({
    title: item.title,
    type: item.type,
    tags: item.tags,
    link: linkFor(item, lookups),
    items: planItems(item.items ?? [], lookups),
  }));
}

/** Resolves every record-linked item to its cross-store identity (handle,
 * or policy type) once, so the persisted plan holds no source GIDs. */
export async function planMenus(
  admin: AdminApiContext,
  menus: MenuRow[],
): Promise<PlannedMenu[]> {
  if (menus.length === 0) return [];
  const all = menus.flatMap((menu) => flatten(menu.items));
  const recordIds = all
    .filter((item) => referenceKind(`${item.type.toLowerCase()}_reference`))
    .map((item) => item.resourceId)
    .filter((id): id is string => Boolean(id));
  const needsPolicies = all.some((item) => item.type === "SHOP_POLICY");
  const [refs, policies] = await Promise.all([
    resolveSourceRefs(admin, [...new Set(recordIds)]),
    needsPolicies ? sourcePolicyTypes(admin) : new Map<string, string>(),
  ]);
  return menus.map((menu) => ({
    handle: menu.handle,
    title: menu.title,
    items: planItems(menu.items, { refs, policies }),
  }));
}
