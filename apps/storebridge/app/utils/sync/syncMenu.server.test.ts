import { describe, expect, it, vi } from "vitest";

import type { PlannedMenu, PlannedMenuItem } from "./menus.server";
import { menuStep } from "./syncMenu.server";
import { createStepContext } from "./syncTarget.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

type Handler = (variables: Record<string, unknown>) => unknown;

/** A target store answering by operation name; `errors` makes that
 * operation return a top-level GraphQL error instead. */
function target(
  handlers: Record<string, Handler>,
  errors: Record<string, string> = {},
) {
  return {
    graphql: vi.fn(
      (query: string, opts?: { variables: Record<string, unknown> }) => {
        const name = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
        if (errors[name]) {
          return Promise.resolve(
            jsonResponse(null, [{ message: errors[name] }]),
          );
        }
        return Promise.resolve(
          jsonResponse(handlers[name]?.(opts?.variables ?? {}) ?? {}),
        );
      },
    ),
  };
}

const ok = { menu: { id: "gid://Menu/9" }, userErrors: [] };

const item = (
  title: string,
  link: PlannedMenuItem["link"],
  items: PlannedMenuItem[] = [],
): PlannedMenuItem => ({
  title,
  type: link.kind === "record" ? link.ref.kind.toUpperCase() : "HTTP",
  tags: [],
  link,
  items,
});

function run(menu: PlannedMenu, admin: ReturnType<typeof target>) {
  return menuStep(menu)(createStepContext({} as never, admin as never));
}

function lastWrite(admin: ReturnType<typeof target>) {
  return admin.graphql.mock.calls.at(-1) as [
    string,
    { variables: Record<string, unknown> },
  ];
}

describe("menuStep", () => {
  it("creates a missing menu, linking matched records and dropping the rest with reasons", async () => {
    const admin = target({
      TargetMenus: () => ({
        menus: { nodes: [{ id: "gid://Menu/1", handle: "footer" }] },
      }),
      ProductIdByHandle: ({ handle }) => ({
        productByIdentifier: handle === "hat" ? { id: "gid://T/hat" } : null,
      }),
      MenuCreate: () => ({ menuCreate: ok }),
    });
    const menu: PlannedMenu = {
      handle: "main-menu",
      title: "Main",
      items: [
        { ...item("Home", { kind: "plain", url: "/" }), type: "FRONTPAGE" },
        item("Shop", { kind: "plain", url: null }, [
          item("Hat", {
            kind: "record",
            ref: { kind: "Product", handle: "hat" },
          }),
          item(
            "Scarf",
            { kind: "record", ref: { kind: "Product", handle: "scarf" } },
            [item("Wool", { kind: "plain", url: "/wool" })],
          ),
        ]),
        item("Blog", {
          kind: "unsupported",
          reason: "blog links can't be synced yet.",
        }),
        item("Help", { kind: "plain", url: "https://help.example.com" }),
      ],
    };

    const items = await run(menu, admin);

    expect(items).toEqual([
      {
        key: "menu:main-menu",
        kind: "DEFINITION",
        status: "SUCCEEDED",
        errorMessage: null,
      },
      {
        key: "menuItem:main-menu:Shop > Scarf",
        kind: "DEFINITION",
        status: "SKIPPED",
        errorMessage:
          "No matching product scarf on this store. Its 1 sub-item was dropped with it.",
      },
      {
        key: "menuItem:main-menu:Blog",
        kind: "DEFINITION",
        status: "SKIPPED",
        errorMessage: "blog links can't be synced yet.",
      },
    ]);
    const [query, { variables }] = lastWrite(admin);
    expect(query).toContain("menuCreate");
    expect(variables).toEqual({
      handle: "main-menu",
      title: "Main",
      items: [
        // Only HTTP links carry a url; Shopify derives the rest.
        { title: "Home", type: "FRONTPAGE", tags: [], items: [] },
        {
          title: "Shop",
          type: "HTTP",
          tags: [],
          items: [
            {
              title: "Hat",
              type: "PRODUCT",
              tags: [],
              resourceId: "gid://T/hat",
              items: [],
            },
          ],
        },
        {
          title: "Help",
          type: "HTTP",
          tags: [],
          url: "https://help.example.com",
          items: [],
        },
      ],
    });
  });

  it("replaces an existing menu's items by id, and reads the target's policies once", async () => {
    const admin = target({
      TargetMenus: () => ({
        menus: { nodes: [{ id: "gid://Menu/1", handle: "footer" }] },
      }),
      ShopPolicyIds: () => ({
        shop: {
          shopPolicies: [{ id: "gid://T/Policy/1", type: "REFUND_POLICY" }],
        },
      }),
      MenuUpdate: () => ({ menuUpdate: ok }),
    });

    const items = await run(
      {
        handle: "footer",
        title: "Footer",
        items: [
          item("Refunds", { kind: "policy", policyType: "REFUND_POLICY" }),
          item("Privacy", { kind: "policy", policyType: "PRIVACY_POLICY" }),
        ],
      },
      admin,
    );

    expect(items.map((i) => [i.key, i.status, i.errorMessage])).toEqual([
      ["menu:footer", "SUCCEEDED", null],
      [
        "menuItem:footer:Privacy",
        "SKIPPED",
        "This store has no privacy policy.",
      ],
    ]);
    const [query, { variables }] = lastWrite(admin);
    expect(query).toContain("menuUpdate");
    expect(variables).toEqual({
      id: "gid://Menu/1",
      title: "Footer",
      items: [
        {
          title: "Refunds",
          type: "HTTP",
          tags: [],
          resourceId: "gid://T/Policy/1",
          items: [],
        },
      ],
    });
    expect(
      admin.graphql.mock.calls.filter(([q]) => q.includes("ShopPolicyIds")),
    ).toHaveLength(1);
  });

  it("fails the whole menu when a lookup errors or the write is rejected", async () => {
    const menu: PlannedMenu = {
      handle: "main-menu",
      title: "Main",
      items: [
        item("Hat", {
          kind: "record",
          ref: { kind: "Product", handle: "hat" },
        }),
      ],
    };

    const lookupFails = target({}, { ProductIdByHandle: "Throttled" });
    expect(await run(menu, lookupFails)).toEqual([
      {
        key: "menu:main-menu",
        kind: "DEFINITION",
        status: "FAILED",
        errorMessage: "Throttled",
      },
    ]);

    const writeFails = target({
      ProductIdByHandle: () => ({ productByIdentifier: { id: "gid://T/hat" } }),
      MenuCreate: () => ({
        menuCreate: {
          menu: null,
          userErrors: [{ message: "Title is too long" }],
        },
      }),
    });
    expect(await run(menu, writeFails)).toEqual([
      {
        key: "menu:main-menu",
        kind: "DEFINITION",
        status: "FAILED",
        errorMessage: "Title is too long",
      },
    ]);
  });
});
