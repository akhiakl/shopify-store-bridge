import { describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { query: { syncGroups: { findFirst: vi.fn() } } },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { getDefinitionCatalog, getOwnedGroup } =
  await import("./definitions.server");

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

describe("getOwnedGroup", () => {
  it("looks up the group scoped to the given shop as source", async () => {
    dbMock.query.syncGroups.findFirst.mockResolvedValue({
      id: "group-1",
      source: { shop: "source.myshopify.com" },
    });

    const result = await getOwnedGroup("group-1", "source.myshopify.com");

    expect(dbMock.query.syncGroups.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { source: true, targets: { with: { store: true } } },
      }),
    );
    expect(result).toEqual({
      id: "group-1",
      source: { shop: "source.myshopify.com" },
    });
  });

  it("returns null when the group belongs to a different shop", async () => {
    dbMock.query.syncGroups.findFirst.mockResolvedValue({
      id: "group-1",
      source: { shop: "someone-else.myshopify.com" },
    });

    const result = await getOwnedGroup("group-1", "source.myshopify.com");

    expect(result).toBeNull();
  });

  it("returns null when the group doesn't exist", async () => {
    dbMock.query.syncGroups.findFirst.mockResolvedValue(undefined);

    const result = await getOwnedGroup("missing", "source.myshopify.com");

    expect(result).toBeNull();
  });
});

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
