import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDefinitionCatalog } = vi.hoisted(() => ({
  getDefinitionCatalog: vi.fn(),
}));
vi.mock("./definitions.server", async () => {
  const actual = await vi.importActual<typeof import("./definitions.server")>(
    "./definitions.server",
  );
  return { ...actual, getDefinitionCatalog };
});

const { unauthenticatedMock } = vi.hoisted(() => ({
  unauthenticatedMock: { admin: vi.fn() },
}));
vi.mock("~/shopify.server", () => ({ unauthenticated: unauthenticatedMock }));

const { diffMetaobjectDefinition, diffMetafieldDefinition, runStatusCheck } =
  await import("./syncStatus.server");

const metaobjectDef = {
  id: "gid://1",
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

const metafieldDef = {
  id: "gid://2",
  name: "Care instructions",
  namespace: "custom",
  key: "care",
  description: null,
  type: "single_line_text_field",
  ownerType: "PRODUCT" as const,
};

describe("diffMetaobjectDefinition", () => {
  it("is IN_SYNC when name and fields match exactly", () => {
    expect(diffMetaobjectDefinition(metaobjectDef, [metaobjectDef])).toBe(
      "IN_SYNC",
    );
  });

  it("is IN_SYNC regardless of field order", () => {
    const reordered = {
      ...metaobjectDef,
      fieldDefinitions: [
        {
          name: "Extra",
          key: "extra",
          required: false,
          type: "single_line_text_field",
        },
        ...metaobjectDef.fieldDefinitions,
      ],
    };
    const sourceReordered = {
      ...metaobjectDef,
      fieldDefinitions: [
        ...metaobjectDef.fieldDefinitions,
        {
          name: "Extra",
          key: "extra",
          required: false,
          type: "single_line_text_field",
        },
      ],
    };
    expect(diffMetaobjectDefinition(sourceReordered, [reordered])).toBe(
      "IN_SYNC",
    );
  });

  it("is OUT_OF_SYNC when the target's field list differs", () => {
    const target = {
      ...metaobjectDef,
      fieldDefinitions: [
        {
          name: "Label",
          key: "label",
          required: false,
          type: "single_line_text_field",
        },
      ],
    };
    expect(diffMetaobjectDefinition(metaobjectDef, [target])).toBe(
      "OUT_OF_SYNC",
    );
  });

  it("is OUT_OF_SYNC when the target's name differs", () => {
    const target = { ...metaobjectDef, name: "Different name" };
    expect(diffMetaobjectDefinition(metaobjectDef, [target])).toBe(
      "OUT_OF_SYNC",
    );
  });

  it("is NOT_SYNCED when no matching type exists on the target", () => {
    expect(diffMetaobjectDefinition(metaobjectDef, [])).toBe("NOT_SYNCED");
  });
});

describe("diffMetafieldDefinition", () => {
  it("is IN_SYNC when name/description/type match", () => {
    expect(diffMetafieldDefinition(metafieldDef, [metafieldDef])).toBe(
      "IN_SYNC",
    );
  });

  it("is OUT_OF_SYNC when the type differs", () => {
    const target = { ...metafieldDef, type: "multi_line_text_field" };
    expect(diffMetafieldDefinition(metafieldDef, [target])).toBe("OUT_OF_SYNC");
  });

  it("is NOT_SYNCED when no matching (ownerType, namespace, key) exists", () => {
    expect(diffMetafieldDefinition(metafieldDef, [])).toBe("NOT_SYNCED");
  });
});

describe("runStatusCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const group = {
    id: "group-1",
    targets: [
      {
        id: "target-1",
        status: "APPROVED" as const,
        store: { shop: "target-1.myshopify.com" },
      },
      {
        id: "target-2",
        status: "PENDING" as const,
        store: { shop: "target-2.myshopify.com" },
      },
    ],
  };

  it("only checks APPROVED targets and aggregates in-sync counts", async () => {
    getDefinitionCatalog
      // Source catalog.
      .mockResolvedValueOnce({
        metaobjectDefinitions: [metaobjectDef],
        metafieldDefinitions: [metafieldDef],
      })
      // target-1's catalog: both in sync.
      .mockResolvedValueOnce({
        metaobjectDefinitions: [metaobjectDef],
        metafieldDefinitions: [metafieldDef],
      });
    unauthenticatedMock.admin.mockResolvedValue({
      admin: { graphql: vi.fn() },
    });

    const result = await runStatusCheck({
      group: group as never,
      sourceAdmin: { graphql: vi.fn() } as never,
    });

    expect(unauthenticatedMock.admin).toHaveBeenCalledTimes(1);
    expect(unauthenticatedMock.admin).toHaveBeenCalledWith(
      "target-1.myshopify.com",
    );
    expect(result["metaobject:size_chart"]).toEqual({
      inSyncCount: 1,
      totalTargets: 1,
      perTarget: [
        {
          targetId: "target-1",
          shop: "target-1.myshopify.com",
          status: "IN_SYNC",
        },
      ],
    });
    expect(result["metafield:PRODUCT:custom:care"]).toEqual({
      inSyncCount: 1,
      totalTargets: 1,
      perTarget: [
        {
          targetId: "target-1",
          shop: "target-1.myshopify.com",
          status: "IN_SYNC",
        },
      ],
    });
  });

  it("reports NOT_SYNCED for a target missing the definition entirely", async () => {
    getDefinitionCatalog
      .mockResolvedValueOnce({
        metaobjectDefinitions: [metaobjectDef],
        metafieldDefinitions: [],
      })
      .mockResolvedValueOnce({
        metaobjectDefinitions: [],
        metafieldDefinitions: [],
      });
    unauthenticatedMock.admin.mockResolvedValue({
      admin: { graphql: vi.fn() },
    });

    const result = await runStatusCheck({
      group: group as never,
      sourceAdmin: { graphql: vi.fn() } as never,
    });

    expect(result["metaobject:size_chart"].inSyncCount).toBe(0);
    expect(result["metaobject:size_chart"].perTarget[0].status).toBe(
      "NOT_SYNCED",
    );
  });
});
