import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { menuItemKey, menuKey } from "./definitionKey";
import { describeRef, targetIdFor } from "./metafieldReferences.server";
import {
  SHOP_POLICY_IDS_QUERY,
  type PlannedMenu,
  type PlannedMenuItem,
} from "./menus.server";
import { createOne, readTopLevelErrors } from "./runMutation.server";
import type {
  StepContext,
  SyncItemResult,
  SyncStep,
} from "./syncTarget.server";

/** Scope read/write_online_store_navigation. A menu is matched on the
 * target by handle: listing menus and picking it out works on every API
 * version, where a `handle:` search filter isn't documented. */
const TARGET_MENUS_QUERY = `#graphql
  query TargetMenus {
    menus(first: 250) { nodes { id handle } }
  }
`;

const MENU_CREATE_MUTATION = `#graphql
  mutation MenuCreate($handle: String!, $title: String!, $items: [MenuItemCreateInput!]!) {
    menuCreate(handle: $handle, title: $title, items: $items) {
      menu { id }
      userErrors { field message code }
    }
  }
`;

/** `items` replaces the menu's whole item list. The handle is left out,
 * since a default menu's handle can't be changed. */
const MENU_UPDATE_MUTATION = `#graphql
  mutation MenuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, items: $items) {
      menu { id }
      userErrors { field message code }
    }
  }
`;

interface MenuItemInput {
  title: string;
  type: string;
  tags: string[];
  url?: string;
  resourceId?: string;
  items: MenuItemInput[];
}

/** The target record an item links to, or why it can't link to one. */
type Resolved = { resourceId?: string } | { reason: string };

interface Dropped {
  path: string;
  reason: string;
}

async function readData<T>(
  admin: AdminApiContext,
  query: string,
): Promise<T | undefined> {
  const body = (await (await admin.graphql(query)).json()) as { data?: T };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  return body.data;
}

/** Target lookups shared by one menu's items. Policies are read once, on
 * the first SHOP_POLICY item. */
function targetResolver(ctx: StepContext) {
  let policies: Promise<Map<string, string>> | undefined;
  const policyIds = async () => {
    const data = await readData<{
      shop?: { shopPolicies: { id: string; type: string }[] };
    }>(ctx.targetAdmin, SHOP_POLICY_IDS_QUERY);
    return new Map((data?.shop?.shopPolicies ?? []).map((p) => [p.type, p.id]));
  };
  return async (item: PlannedMenuItem): Promise<Resolved> => {
    const { link } = item;
    if (link.kind === "policy") {
      policies ??= policyIds();
      const resourceId = (await policies).get(link.policyType);
      return resourceId
        ? { resourceId }
        : {
            reason: `This store has no ${link.policyType.toLowerCase().replace(/_/g, " ")}.`,
          };
    }
    if (link.kind !== "record") return {};
    const resourceId = await targetIdFor(
      ctx.targetAdmin,
      link.ref,
      ctx.targetIds,
    );
    return resourceId
      ? { resourceId }
      : { reason: `No matching ${describeRef(link.ref)} on this store.` };
  };
}

/** Builds the target's item list, dropping (with its sub-items) anything
 * that can't link to a record on the target. */
async function buildItems(
  items: PlannedMenuItem[],
  opts: {
    resolve: ReturnType<typeof targetResolver>;
    parent: string;
    dropped: Dropped[];
  },
): Promise<MenuItemInput[]> {
  const inputs: MenuItemInput[] = [];
  for (const item of items) {
    const path = opts.parent ? `${opts.parent} > ${item.title}` : item.title;
    const n = item.items.length;
    const subItems = n
      ? ` Its ${n} sub-item${n === 1 ? " was" : "s were"} dropped with it.`
      : "";
    if (item.link.kind === "unsupported") {
      opts.dropped.push({ path, reason: item.link.reason + subItems });
      continue;
    }
    const resolved = await opts.resolve(item);
    if ("reason" in resolved) {
      opts.dropped.push({ path, reason: resolved.reason + subItems });
      continue;
    }
    inputs.push({
      title: item.title,
      type: item.type,
      tags: item.tags,
      ...(item.type === "HTTP" && item.link.kind === "plain" && item.link.url
        ? { url: item.link.url }
        : {}),
      ...resolved,
      items: await buildItems(item.items, { ...opts, parent: path }),
    });
  }
  return inputs;
}

async function upsertMenu(
  ctx: StepContext,
  menu: PlannedMenu,
  items: MenuItemInput[],
) {
  const data = await readData<{
    menus?: { nodes: { id: string; handle: string }[] };
  }>(ctx.targetAdmin, TARGET_MENUS_QUERY);
  const existing = data?.menus?.nodes.find((m) => m.handle === menu.handle);
  return existing
    ? createOne(ctx.targetAdmin, MENU_UPDATE_MUTATION, {
        id: existing.id,
        title: menu.title,
        items,
      })
    : createOne(ctx.targetAdmin, MENU_CREATE_MUTATION, {
        handle: menu.handle,
        title: menu.title,
        items,
      });
}

/**
 * Creates or replaces one menu on the target. Dropped items are listed as
 * SKIPPED rows with their reason, so a partly synced menu is visible in
 * job history. A failed lookup or write fails the whole menu.
 */
export function menuStep(menu: PlannedMenu): SyncStep {
  return async (ctx) => {
    const key = menuKey(menu.handle);
    const dropped: Dropped[] = [];
    try {
      const items = await buildItems(menu.items, {
        resolve: targetResolver(ctx),
        parent: "",
        dropped,
      });
      const result = await upsertMenu(ctx, menu, items);
      if (!result.ok) {
        return [
          {
            key,
            kind: "DEFINITION",
            status: "FAILED",
            errorMessage: result.error,
          },
        ];
      }
    } catch (error) {
      return [
        {
          key,
          kind: "DEFINITION",
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      ];
    }
    return [
      { key, kind: "DEFINITION", status: "SUCCEEDED", errorMessage: null },
      ...dropped.map(({ path, reason }): SyncItemResult => ({
        key: menuItemKey(menu.handle, path),
        kind: "DEFINITION",
        status: "SKIPPED",
        errorMessage: reason,
      })),
    ];
  };
}
