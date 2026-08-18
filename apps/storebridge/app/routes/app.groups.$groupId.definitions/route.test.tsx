import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getOwnedGroup, getDefinitionCatalog } = vi.hoisted(() => ({
  getOwnedGroup: vi.fn(),
  getDefinitionCatalog: vi.fn(),
}));
vi.mock("./definitions.server", () => ({
  getOwnedGroup,
  getDefinitionCatalog,
}));

const { loader } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("app.groups.$groupId.definitions loader", () => {
  it("returns the group and definition catalog for a group the shop owns", async () => {
    const admin = { graphql: vi.fn() };
    authenticateAdmin.mockResolvedValue({
      session: { shop: "source.myshopify.com" },
      admin,
    });
    getOwnedGroup.mockResolvedValue({ id: "group-1", name: "EU stores" });
    getDefinitionCatalog.mockResolvedValue({
      metafieldDefinitions: [],
      metaobjectDefinitions: [],
    });

    const result = await loader({
      request: new Request(
        "https://example.myshopify.com/app/groups/group-1/definitions",
      ),
      params: { groupId: "group-1" },
      context: {},
    } as never);

    expect(getOwnedGroup).toHaveBeenCalledWith(
      "group-1",
      "source.myshopify.com",
    );
    expect(getDefinitionCatalog).toHaveBeenCalledWith(admin);
    expect(result).toEqual({
      group: { id: "group-1", name: "EU stores" },
      metafieldDefinitions: [],
      metaobjectDefinitions: [],
    });
  });

  it("404s when the group doesn't belong to the authenticated shop", async () => {
    authenticateAdmin.mockResolvedValue({
      session: { shop: "source.myshopify.com" },
      admin: { graphql: vi.fn() },
    });
    getOwnedGroup.mockResolvedValue(null);

    await expect(
      loader({
        request: new Request(
          "https://example.myshopify.com/app/groups/missing/definitions",
        ),
        params: { groupId: "missing" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ init: { status: 404 } });

    expect(getDefinitionCatalog).not.toHaveBeenCalled();
  });
});
