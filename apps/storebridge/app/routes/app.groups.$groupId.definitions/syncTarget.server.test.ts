import { describe, expect, it, vi } from "vitest";

import { syncToTarget } from "./syncTarget.server";

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

const metaobjectDef = {
  id: "gid://shopify/MetaobjectDefinition/1",
  type: "size_chart",
  name: "Size chart",
  fieldDefinitions: [
    {
      name: "Label",
      key: "label",
      required: true,
      type: "single_line_text_field",
    },
  ],
  fieldCount: 1,
};

const shopMetafieldDef = {
  id: "gid://shopify/MetafieldDefinition/1",
  name: "Support email",
  namespace: "custom",
  key: "support_email",
  description: null,
  type: "single_line_text_field",
  ownerType: "SHOP" as const,
};

describe("syncToTarget", () => {
  it("counts a successful metaobject definition create as synced", async () => {
    const targetAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            metaobjectDefinitionCreate: {
              metaobjectDefinition: { id: "gid://1" },
              userErrors: [],
            },
          }),
        ),
      ),
    };

    const result = await syncToTarget({
      sourceAdmin: { graphql: vi.fn() } as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [metaobjectDef],
      metafieldDefinitions: [],
    });

    expect(result).toEqual({ itemsSynced: 1, itemsSkipped: 0, itemsFailed: 0 });
  });

  it("counts a TAKEN userError as skipped, not failed", async () => {
    const targetAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            metaobjectDefinitionCreate: {
              metaobjectDefinition: null,
              userErrors: [
                { message: "Type has already been taken", code: "TAKEN" },
              ],
            },
          }),
        ),
      ),
    };

    const result = await syncToTarget({
      sourceAdmin: { graphql: vi.fn() } as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [metaobjectDef],
      metafieldDefinitions: [],
    });

    expect(result).toEqual({ itemsSynced: 0, itemsSkipped: 1, itemsFailed: 0 });
  });

  it("counts a non-TAKEN userError as failed", async () => {
    const targetAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            metaobjectDefinitionCreate: {
              metaobjectDefinition: null,
              userErrors: [{ message: "Name can't be blank", code: "BLANK" }],
            },
          }),
        ),
      ),
    };

    const result = await syncToTarget({
      sourceAdmin: { graphql: vi.fn() } as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [metaobjectDef],
      metafieldDefinitions: [],
    });

    expect(result).toEqual({ itemsSynced: 0, itemsSkipped: 0, itemsFailed: 1 });
  });

  it("syncs a SHOP metafield's value after its definition is confirmed", async () => {
    const sourceAdmin = {
      graphql: vi.fn((query: string) =>
        Promise.resolve(
          jsonResponse(
            query.includes("ShopMetafieldValue")
              ? {
                  shop: {
                    metafield: {
                      value: "support@example.com",
                      type: "single_line_text_field",
                    },
                  },
                }
              : {},
          ),
        ),
      ),
    };
    const targetAdmin = {
      graphql: vi.fn((query: string) => {
        if (query.includes("MetafieldDefinitionCreate")) {
          return Promise.resolve(
            jsonResponse({
              metafieldDefinitionCreate: {
                createdDefinition: { id: "gid://1" },
                userErrors: [],
              },
            }),
          );
        }
        if (query.includes("ShopId")) {
          return Promise.resolve(
            jsonResponse({ shop: { id: "gid://shopify/Shop/1" } }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            metafieldsSet: {
              metafields: [{ id: "gid://mf/1" }],
              userErrors: [],
            },
          }),
        );
      }),
    };

    const result = await syncToTarget({
      sourceAdmin: sourceAdmin as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [],
      metafieldDefinitions: [shopMetafieldDef],
    });

    // Definition create (synced) + value set (synced) = 2 items for one selected def.
    expect(result).toEqual({ itemsSynced: 2, itemsSkipped: 0, itemsFailed: 0 });
    expect(
      targetAdmin.graphql.mock.calls.some(([q]) => q.includes("MetafieldsSet")),
    ).toBe(true);
  });

  it("skips the value copy when the source has no value set", async () => {
    const sourceAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(jsonResponse({ shop: { metafield: null } })),
      ),
    };
    const targetAdmin = {
      graphql: vi.fn((query: string) => {
        if (query.includes("MetafieldDefinitionCreate")) {
          return Promise.resolve(
            jsonResponse({
              metafieldDefinitionCreate: {
                createdDefinition: { id: "gid://1" },
                userErrors: [],
              },
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({ shop: { id: "gid://shopify/Shop/1" } }),
        );
      }),
    };

    const result = await syncToTarget({
      sourceAdmin: sourceAdmin as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [],
      metafieldDefinitions: [shopMetafieldDef],
    });

    expect(result).toEqual({ itemsSynced: 1, itemsSkipped: 1, itemsFailed: 0 });
    expect(
      targetAdmin.graphql.mock.calls.some(([q]) => q.includes("MetafieldsSet")),
    ).toBe(false);
  });

  it("never fetches the target's shop id when nothing selected is SHOP-owned", async () => {
    const nonShopDef = { ...shopMetafieldDef, ownerType: "PRODUCT" as const };
    const graphql = vi.fn<
      (query: string) => Promise<ReturnType<typeof jsonResponse>>
    >(() =>
      Promise.resolve(
        jsonResponse({
          metafieldDefinitionCreate: {
            createdDefinition: { id: "gid://1" },
            userErrors: [],
          },
        }),
      ),
    );
    const targetAdmin = { graphql };

    await syncToTarget({
      sourceAdmin: { graphql: vi.fn() } as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [],
      metafieldDefinitions: [nonShopDef],
    });

    expect(
      targetAdmin.graphql.mock.calls.some(([q]) => q.includes("ShopId")),
    ).toBe(false);
  });
});
