import { describe, expect, it, vi } from "vitest";

import { syncToTarget } from "./syncTarget.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
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

    expect(result.tallies).toEqual({
      itemsSynced: 1,
      itemsSkipped: 0,
      itemsFailed: 0,
    });
    expect(result.items).toEqual([
      {
        key: "metaobject:size_chart",
        kind: "DEFINITION",
        status: "SUCCEEDED",
        errorMessage: null,
      },
    ]);
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

    expect(result.tallies).toEqual({
      itemsSynced: 0,
      itemsSkipped: 1,
      itemsFailed: 0,
    });
    expect(result.items).toEqual([
      {
        key: "metaobject:size_chart",
        kind: "DEFINITION",
        status: "SKIPPED",
        errorMessage: null,
      },
    ]);
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

    expect(result.tallies).toEqual({
      itemsSynced: 0,
      itemsSkipped: 0,
      itemsFailed: 1,
    });
    expect(result.items).toEqual([
      {
        key: "metaobject:size_chart",
        kind: "DEFINITION",
        status: "FAILED",
        errorMessage: "Name can't be blank",
      },
    ]);
  });

  it("counts a top-level GraphQL error as failed, not a silent success", async () => {
    const targetAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse(null, [{ message: "Access denied for this scope" }]),
        ),
      ),
    };

    const result = await syncToTarget({
      sourceAdmin: { graphql: vi.fn() } as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [metaobjectDef],
      metafieldDefinitions: [],
    });

    expect(result.tallies).toEqual({
      itemsSynced: 0,
      itemsSkipped: 0,
      itemsFailed: 1,
    });
    expect(result.items).toEqual([
      {
        key: "metaobject:size_chart",
        kind: "DEFINITION",
        status: "FAILED",
        errorMessage: "Access denied for this scope",
      },
    ]);
  });

  it("counts a missing response payload as failed, not a silent success", async () => {
    const targetAdmin = {
      graphql: vi.fn(() => Promise.resolve(jsonResponse({}))),
    };

    const result = await syncToTarget({
      sourceAdmin: { graphql: vi.fn() } as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [metaobjectDef],
      metafieldDefinitions: [],
    });

    expect(result.tallies.itemsFailed).toBe(1);
    expect(result.items[0].status).toBe("FAILED");
  });

  it("records a failed VALUE item when the target's shop id can't be resolved", async () => {
    const sourceAdmin = { graphql: vi.fn() };
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
        // ShopId query fails — no data, no shop id.
        return Promise.resolve(jsonResponse({}));
      }),
    };

    const result = await syncToTarget({
      sourceAdmin: sourceAdmin as never,
      targetAdmin: targetAdmin as never,
      metaobjectDefinitions: [],
      metafieldDefinitions: [shopMetafieldDef],
    });

    const key = "metafield:SHOP:custom:support_email";
    expect(result.items).toEqual([
      { key, kind: "DEFINITION", status: "SUCCEEDED", errorMessage: null },
      {
        key,
        kind: "VALUE",
        status: "FAILED",
        errorMessage: "Could not resolve the target store's Shop id.",
      },
    ]);
    expect(result.tallies.itemsFailed).toBe(1);
    // Never even tries to read the source's value once the target's shop
    // id is unknown.
    expect(sourceAdmin.graphql).not.toHaveBeenCalled();
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
    expect(result.tallies).toEqual({
      itemsSynced: 2,
      itemsSkipped: 0,
      itemsFailed: 0,
    });
    const key = "metafield:SHOP:custom:support_email";
    expect(result.items).toEqual([
      { key, kind: "DEFINITION", status: "SUCCEEDED", errorMessage: null },
      { key, kind: "VALUE", status: "SUCCEEDED", errorMessage: null },
    ]);
    expect(
      targetAdmin.graphql.mock.calls.some(([q]) => q.includes("MetafieldsSet")),
    ).toBe(true);
  });

  it("records a failed VALUE item when reading the source value errors, not skipped", async () => {
    const sourceAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse(null, [
            { message: "Access denied for shop metafield reads" },
          ]),
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

    const key = "metafield:SHOP:custom:support_email";
    expect(result.items).toEqual([
      { key, kind: "DEFINITION", status: "SUCCEEDED", errorMessage: null },
      {
        key,
        kind: "VALUE",
        status: "FAILED",
        errorMessage: "Access denied for shop metafield reads",
      },
    ]);
    expect(result.tallies).toEqual({
      itemsSynced: 1,
      itemsSkipped: 0,
      itemsFailed: 1,
    });
    expect(
      targetAdmin.graphql.mock.calls.some(([q]) => q.includes("MetafieldsSet")),
    ).toBe(false);
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

    expect(result.tallies).toEqual({
      itemsSynced: 1,
      itemsSkipped: 1,
      itemsFailed: 0,
    });
    const key = "metafield:SHOP:custom:support_email";
    expect(result.items).toEqual([
      { key, kind: "DEFINITION", status: "SUCCEEDED", errorMessage: null },
      { key, kind: "VALUE", status: "SKIPPED", errorMessage: null },
    ]);
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
