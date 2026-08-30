import { beforeEach, describe, expect, it, vi } from "vitest";

/** Same minimal fluent-builder stand-in as pairing.server.test.ts. */
function chain(result: unknown) {
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  obj.values = vi.fn(() => obj);
  obj.set = vi.fn(() => obj);
  obj.where = vi.fn(() => Promise.resolve(result));
  obj.returning = vi.fn(() => Promise.resolve(result));
  return obj;
}

const { dbMock, unauthenticatedMock } = vi.hoisted(() => ({
  dbMock: {
    query: { syncJobs: { findMany: vi.fn() } },
    insert: vi.fn(),
    update: vi.fn(),
  },
  unauthenticatedMock: { admin: vi.fn() },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));
vi.mock("~/shopify.server", () => ({ unauthenticated: unauthenticatedMock }));

const { parseSelection, runSyncJob, getJobHistory } =
  await import("./sync.server");

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

function sourceAdminWithCatalog() {
  return {
    graphql: vi.fn((query: string) => {
      if (query.includes("MetaobjectDefinitionsList")) {
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
      }
      if (query.includes("MetafieldDefinitionsByOwner")) {
        return Promise.resolve(jsonResponse({}));
      }
      return Promise.resolve(jsonResponse({}));
    }),
  };
}

const group = {
  id: "group-1",
  targets: [
    {
      storeId: "target-1",
      status: "APPROVED" as const,
      store: { shop: "target-1.myshopify.com" },
    },
    {
      storeId: "target-2",
      status: "PENDING" as const,
      store: { shop: "target-2.myshopify.com" },
    },
  ],
};

describe("parseSelection", () => {
  it("splits metaobject and metafield keys into their identifying parts", () => {
    expect(
      parseSelection([
        "metaobject:size_chart",
        "metafield:PRODUCT:custom:care",
      ]),
    ).toEqual({
      metaobjectTypes: ["size_chart"],
      metafieldSelectors: [
        { ownerType: "PRODUCT", namespace: "custom", key: "care" },
      ],
    });
  });
});

describe("runSyncJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs selected definitions only to APPROVED targets and records success", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "job-1" }]));
    dbMock.insert.mockReturnValueOnce(chain(undefined));
    dbMock.update.mockReturnValueOnce(chain(undefined));

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
    unauthenticatedMock.admin.mockResolvedValue({ admin: targetAdmin });

    const result = await runSyncJob({
      group,
      selection: ["metaobject:size_chart"],
      sourceAdmin: sourceAdminWithCatalog(),
    } as never);

    expect(unauthenticatedMock.admin).toHaveBeenCalledTimes(1);
    expect(unauthenticatedMock.admin).toHaveBeenCalledWith(
      "target-1.myshopify.com",
    );
    expect(targetAdmin.graphql).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "job-1", status: "SUCCEEDED" });
  });

  it("marks the job FAILED and records the error when a target can't be reached", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "job-1" }]));
    dbMock.insert.mockReturnValueOnce(chain(undefined));
    dbMock.update.mockReturnValueOnce(chain(undefined));
    unauthenticatedMock.admin.mockRejectedValue(new Error("no session"));

    const result = await runSyncJob({
      group,
      selection: ["metaobject:size_chart"],
      sourceAdmin: sourceAdminWithCatalog(),
    } as never);

    expect(result).toEqual({ id: "job-1", status: "FAILED" });
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
  });

  it("records a target FAILED when its mutation returns userErrors", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "job-1" }]));
    dbMock.insert.mockReturnValueOnce(chain(undefined));
    dbMock.update.mockReturnValueOnce(chain(undefined));

    const targetAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            metaobjectDefinitionCreate: {
              metaobjectDefinition: null,
              userErrors: [{ message: "Type has already been taken" }],
            },
          }),
        ),
      ),
    };
    unauthenticatedMock.admin.mockResolvedValue({ admin: targetAdmin });

    const result = await runSyncJob({
      group,
      selection: ["metaobject:size_chart"],
      sourceAdmin: sourceAdminWithCatalog(),
    } as never);

    // One target, one failed item -> that target is FAILED, and with a
    // single target the job rolls up to FAILED too (see the "every"
    // check in runSyncJob) rather than PARTIAL, which only shows up
    // across multiple targets with mixed outcomes.
    expect(result.status).toBe("FAILED");
  });

  it("reports PARTIAL when approved targets have mixed outcomes", async () => {
    const twoTargetGroup = {
      id: "group-1",
      targets: [
        ...group.targets,
        {
          storeId: "target-3",
          status: "APPROVED" as const,
          store: { shop: "target-3.myshopify.com" },
        },
      ],
    };
    dbMock.insert.mockReturnValueOnce(chain([{ id: "job-1" }]));
    dbMock.insert.mockReturnValue(chain(undefined));
    dbMock.update.mockReturnValueOnce(chain(undefined));

    const succeedingAdmin = {
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
    const failingAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            metaobjectDefinitionCreate: {
              metaobjectDefinition: null,
              userErrors: [{ message: "Type has already been taken" }],
            },
          }),
        ),
      ),
    };
    unauthenticatedMock.admin
      .mockResolvedValueOnce({ admin: succeedingAdmin })
      .mockResolvedValueOnce({ admin: failingAdmin });

    const result = await runSyncJob({
      group: twoTargetGroup,
      selection: ["metaobject:size_chart"],
      sourceAdmin: sourceAdminWithCatalog(),
    } as never);

    expect(result.status).toBe("PARTIAL");
  });

  it("also syncs selected metafield definitions", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "job-1" }]));
    dbMock.insert.mockReturnValueOnce(chain(undefined));
    dbMock.update.mockReturnValueOnce(chain(undefined));

    const admin = {
      graphql: vi.fn((query: string) => {
        if (query.includes("MetaobjectDefinitionsList")) {
          return Promise.resolve(jsonResponse({}));
        }
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
            metafieldDefinitionCreate: {
              createdDefinition: { id: "gid://1" },
              userErrors: [],
            },
          }),
        );
      }),
    };
    unauthenticatedMock.admin.mockResolvedValue({ admin });

    const result = await runSyncJob({
      group,
      selection: ["metafield:PRODUCT:custom:care"],
      sourceAdmin: admin,
    } as never);

    expect(result.status).toBe("SUCCEEDED");
  });

  it("succeeds trivially when the group has no approved targets", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "job-1" }]));
    dbMock.update.mockReturnValueOnce(chain(undefined));

    const result = await runSyncJob({
      group: { id: "group-1", targets: [] },
      selection: ["metaobject:size_chart"],
      sourceAdmin: sourceAdminWithCatalog(),
    } as never);

    expect(unauthenticatedMock.admin).not.toHaveBeenCalled();
    expect(result.status).toBe("SUCCEEDED");
  });
});

describe("getJobHistory", () => {
  it("queries jobs for the group, newest first, with target results", async () => {
    dbMock.query.syncJobs.findMany.mockResolvedValue([{ id: "job-1" }]);

    const history = await getJobHistory("group-1");

    expect(dbMock.query.syncJobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { targets: { with: { store: true } } },
      }),
    );
    expect(history).toEqual([{ id: "job-1" }]);
  });
});
