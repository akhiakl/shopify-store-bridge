import { describe, expect, it, vi } from "vitest";

import { getMenus, planMenus, type SourceMenuItem } from "./menus.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

/** Answers by operation name; `errors` makes that operation fail. */
function admin(
  handlers: Record<string, () => unknown>,
  errors: Record<string, string> = {},
) {
  return {
    graphql: vi.fn((query: string) => {
      const name = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
      if (errors[name]) {
        return Promise.resolve(jsonResponse(null, [{ message: errors[name] }]));
      }
      return Promise.resolve(jsonResponse(handlers[name]?.() ?? {}));
    }),
  };
}

const item = (
  type: string,
  overrides: Partial<SourceMenuItem> = {},
): SourceMenuItem => ({
  title: type,
  type,
  url: null,
  resourceId: null,
  tags: [],
  ...overrides,
});

describe("getMenus", () => {
  it("returns the source menus, or none when the response has no data", async () => {
    const menus = [{ handle: "main-menu", title: "Main", items: [] }];
    expect(
      await getMenus(
        admin({ MenusList: () => ({ menus: { nodes: menus } }) }) as never,
      ),
    ).toEqual(menus);
    expect(await getMenus(admin({}) as never)).toEqual([]);
  });
});

describe("planMenus", () => {
  it("makes no calls for no menus", async () => {
    const source = admin({});
    expect(await planMenus(source as never, [])).toEqual([]);
    expect(source.graphql).not.toHaveBeenCalled();
  });

  it("resolves each item's link to a cross-store identity, nested items included", async () => {
    const source = admin({
      MetafieldReferences: () => ({
        nodes: [
          { __typename: "Product", id: "gid://P/1", handle: "hat" },
          null,
        ],
      }),
      ShopPolicyIds: () => ({
        shop: {
          shopPolicies: [{ id: "gid://Policy/1", type: "REFUND_POLICY" }],
        },
      }),
    });

    const [menu] = await planMenus(source as never, [
      {
        handle: "main-menu",
        title: "Main",
        items: [
          item("HTTP", { url: "https://example.com", tags: ["promo"] }),
          item("COLLECTIONS", {
            items: [
              item("PRODUCT", { resourceId: "gid://P/1" }),
              item("COLLECTION", { resourceId: "gid://C/gone" }),
            ],
          }),
          item("SHOP_POLICY", { resourceId: "gid://Policy/1" }),
          item("SHOP_POLICY", { resourceId: "gid://Policy/gone" }),
          item("PAGE", { resourceId: "gid://Page/1" }),
        ],
      },
    ]);

    expect(menu.items.map((i) => i.link)).toEqual([
      { kind: "plain", url: "https://example.com" },
      { kind: "plain", url: null },
      { kind: "policy", policyType: "REFUND_POLICY" },
      { kind: "unsupported", reason: "Its policy no longer exists." },
      { kind: "unsupported", reason: "page links can't be synced yet." },
    ]);
    expect(menu.items[0].tags).toEqual(["promo"]);
    expect(menu.items[1].items.map((i) => i.link)).toEqual([
      { kind: "record", ref: { kind: "Product", handle: "hat" } },
      {
        kind: "unsupported",
        reason: "It links to a record deleted on the source store.",
      },
    ]);
    // Record IDs are resolved in one lookup.
    expect(source.graphql).toHaveBeenCalledWith(
      expect.stringContaining("MetafieldReferences"),
      { variables: { ids: ["gid://P/1", "gid://C/gone"] } },
    );
  });

  it("skips the policy read when no item links to a policy, and throws when it fails", async () => {
    const plain = [{ handle: "m", title: "M", items: [item("SEARCH")] }];
    const source = admin({});
    await planMenus(source as never, plain);
    expect(source.graphql).not.toHaveBeenCalled();

    const failing = admin({}, { ShopPolicyIds: "Access denied" });
    await expect(
      planMenus(failing as never, [
        { handle: "m", title: "M", items: [item("SHOP_POLICY")] },
      ]),
    ).rejects.toThrow("Access denied");
  });
});
