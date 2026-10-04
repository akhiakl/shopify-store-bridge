import { describe, expect, it, vi } from "vitest";

const { getDefinitionCatalog, getShopPolicies } =
  await import("./definitions.server");

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

describe("getDefinitionCatalog", () => {
  it("fetches metafield definitions per owner type and metaobject definitions", async () => {
    const graphql = vi.fn((query: string) => {
      if (query.includes("MetafieldDefinitionsByOwner")) {
        return Promise.resolve(
          jsonResponse({
            metafieldDefinitions: {
              nodes: [
                {
                  id: "gid://shopify/MetafieldDefinition/1",
                  name: "Care instructions",
                  namespace: "custom",
                  key: "care",
                  description: null,
                  type: { name: "single_line_text_field" },
                },
              ],
            },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          metaobjectDefinitions: {
            nodes: [
              {
                id: "gid://shopify/MetaobjectDefinition/1",
                type: "size_chart",
                name: "Size chart",
                metaobjectsCount: 4,
                fieldDefinitions: [
                  {
                    name: "Label",
                    key: "label",
                    required: true,
                    type: { name: "single_line_text_field" },
                  },
                ],
              },
            ],
          },
        }),
      );
    });

    const catalog = await getDefinitionCatalog({ graphql } as never);

    // One metafield query per owner type - see METAFIELD_OWNER_TYPES.
    expect(
      graphql.mock.calls.filter(([q]) => q.includes("Metafield")),
    ).toHaveLength(9);
    expect(catalog.metafieldDefinitions).toHaveLength(9);
    expect(catalog.metafieldDefinitions[0]).toEqual({
      id: "gid://shopify/MetafieldDefinition/1",
      name: "Care instructions",
      namespace: "custom",
      key: "care",
      description: null,
      type: "single_line_text_field",
      ownerType: "PRODUCT",
      valueCount: 0,
    });

    expect(catalog.metaobjectDefinitions).toEqual([
      {
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
        entryCount: 4,
      },
    ]);
  });

  it("returns an empty catalog when the API returns no nodes", async () => {
    const graphql = vi.fn(() => Promise.resolve(jsonResponse({})));

    const catalog = await getDefinitionCatalog({ graphql } as never);

    expect(catalog.metafieldDefinitions).toEqual([]);
    expect(catalog.metaobjectDefinitions).toEqual([]);
  });
});

describe("getShopPolicies", () => {
  it("fetches the shop's policies", async () => {
    const graphql = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          shop: {
            shopPolicies: [
              {
                type: "REFUND_POLICY",
                title: "Refund policy",
                body: "<p>Refunds within 30 days.</p>",
              },
            ],
          },
        }),
      ),
    );

    const policies = await getShopPolicies({ graphql } as never);

    expect(policies).toEqual([
      {
        type: "REFUND_POLICY",
        title: "Refund policy",
        body: "<p>Refunds within 30 days.</p>",
      },
    ]);
  });

  it("returns an empty list when the API returns no policies", async () => {
    const graphql = vi.fn(() => Promise.resolve(jsonResponse({})));

    const policies = await getShopPolicies({ graphql } as never);

    expect(policies).toEqual([]);
  });
});
