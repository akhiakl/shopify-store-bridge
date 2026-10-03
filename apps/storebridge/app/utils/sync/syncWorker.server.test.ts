import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, unauthenticatedMock, state } = vi.hoisted(() => {
  const state = {
    claimed: [] as unknown[],
    updates: [] as Record<string, unknown>[],
    inserts: [] as { values: unknown }[],
  };
  return {
    state,
    unauthenticatedMock: { admin: vi.fn() },
    dbMock: {
      // Every update().set(x).where(...) records `x`; only the claim uses
      // .returning(), which yields `state.claimed`.
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          state.updates.push(values);
          return {
            where: vi.fn(() =>
              Object.assign(Promise.resolve(), {
                returning: () => Promise.resolve(state.claimed),
              }),
            ),
          };
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) => {
          state.inserts.push({ values });
          return Promise.resolve();
        }),
      })),
      query: {
        syncGroups: { findFirst: vi.fn() },
        syncJobTargets: { findMany: vi.fn() },
      },
    },
  };
});
vi.mock("~/db.server", () => ({ default: dbMock }));
vi.mock("~/shopify.server", () => ({ unauthenticated: unauthenticatedMock }));

const { processSyncJob } = await import("./syncWorker.server");

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

const NO_DEADLINE = Number.MAX_SAFE_INTEGER;

/** Source with one metaobject definition ("faq") and nothing else. */
const sourceAdmin = {
  graphql: vi.fn((query: string) =>
    Promise.resolve(
      jsonResponse(
        query.includes("MetaobjectDefinitionsList")
          ? {
              metaobjectDefinitions: {
                nodes: [
                  {
                    id: "gid://1",
                    type: "faq",
                    name: "FAQ",
                    metaobjectsCount: 0,
                    fieldDefinitions: [],
                  },
                ],
              },
            }
          : {},
      ),
    ),
  ),
};

const okTarget = {
  graphql: vi.fn(() =>
    Promise.resolve(
      jsonResponse({
        metaobjectDefinitionCreate: {
          metaobjectDefinition: { id: "gid://t" },
          userErrors: [],
        },
      }),
    ),
  ),
};

const faqDefinition = {
  id: "gid://1",
  type: "faq",
  name: "FAQ",
  fieldDefinitions: [],
  fieldCount: 0,
  entryCount: 0,
};
const planWith = (defs: unknown[]) => ({
  metaobjectDefinitions: defs,
  metafieldDefinitions: [],
  shopPolicies: [],
  collections: [],
  metaobjectEntries: [],
});

function pendingTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: "jt-1",
    status: "PENDING",
    stepsDone: 0,
    stepsTotal: 1,
    itemsSynced: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    store: { shop: "target.myshopify.com" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.claimed = [];
  state.updates = [];
  state.inserts = [];
  dbMock.query.syncGroups.findFirst.mockResolvedValue({
    id: "group-1",
    source: { shop: "source.myshopify.com" },
    targets: [
      { storeId: "store-1", status: "APPROVED" },
      { storeId: "store-2", status: "PENDING" },
    ],
  });
  unauthenticatedMock.admin.mockImplementation(async (shop: string) => ({
    admin: shop === "source.myshopify.com" ? sourceAdmin : okTarget,
  }));
});

describe("processSyncJob", () => {
  it("does nothing when another run holds the lock or the job has ended", async () => {
    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("busy");
    expect(dbMock.query.syncGroups.findFirst).not.toHaveBeenCalled();
  });

  it("plans a new job for APPROVED targets only, then syncs and finishes it", async () => {
    state.claimed = [
      {
        id: "job-1",
        groupId: "group-1",
        selection: ["metaobject:faq"],
        plan: null,
      },
    ];
    dbMock.query.syncJobTargets.findMany
      .mockResolvedValueOnce([pendingTarget()])
      .mockResolvedValueOnce([{ status: "SUCCEEDED" }]);

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.inserts[0].values).toEqual([
      { jobId: "job-1", storeId: "store-1", status: "PENDING", stepsTotal: 1 },
    ]);
    expect(state.updates).toContainEqual({
      plan: planWith([faqDefinition]),
      status: "RUNNING",
    });
    expect(state.inserts[1].values).toEqual([
      {
        jobTargetId: "jt-1",
        key: "metaobject:faq",
        kind: "DEFINITION",
        status: "SUCCEEDED",
        errorMessage: null,
      },
    ]);
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        stepsDone: 1,
        itemsSynced: 1,
        status: "SUCCEEDED",
      }),
    );
    expect(state.updates).toContainEqual(
      expect.objectContaining({ status: "SUCCEEDED", plan: null }),
    );
  });

  it("fails the job when nothing selected exists on the source anymore", async () => {
    state.claimed = [
      {
        id: "job-1",
        groupId: "group-1",
        selection: ["metaobject:gone"],
        plan: null,
      },
    ];

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.updates).toContainEqual(
      expect.objectContaining({
        status: "FAILED",
        errorMessage:
          "None of the selected items exist on the source store anymore.",
      }),
    );
    expect(state.inserts).toHaveLength(0);
  });

  it("succeeds trivially when no target is APPROVED", async () => {
    dbMock.query.syncGroups.findFirst.mockResolvedValue({
      id: "group-1",
      source: { shop: "source.myshopify.com" },
      targets: [],
    });
    state.claimed = [
      {
        id: "job-1",
        groupId: "group-1",
        selection: ["metaobject:faq"],
        plan: null,
      },
    ];

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");
    expect(state.updates).toContainEqual(
      expect.objectContaining({ status: "SUCCEEDED" }),
    );
  });

  it("fails the job with the reason when the source store can't be reached", async () => {
    unauthenticatedMock.admin.mockRejectedValue(new Error("no session"));
    state.claimed = [
      {
        id: "job-1",
        groupId: "group-1",
        selection: ["metaobject:faq"],
        plan: null,
      },
    ];

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");
    expect(state.updates).toContainEqual(
      expect.objectContaining({ status: "FAILED", errorMessage: "no session" }),
    );
  });

  it("resumes a planned job from the target's saved step and reports work left at the deadline", async () => {
    const twoDefs = planWith([
      faqDefinition,
      { ...faqDefinition, type: "chef" },
    ]);
    state.claimed = [
      { id: "job-1", groupId: "group-1", selection: [], plan: twoDefs },
    ];
    dbMock.query.syncJobTargets.findMany
      .mockResolvedValueOnce([
        pendingTarget({ stepsDone: 1, stepsTotal: 3, itemsSynced: 1 }),
      ])
      .mockResolvedValueOnce([{ status: "PENDING" }]);

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("more");

    // Only the second step ran; the first was done in an earlier run.
    expect(okTarget.graphql).toHaveBeenCalledTimes(1);
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        stepsDone: 2,
        itemsSynced: 2,
        status: "SUCCEEDED",
      }),
    );
    // Lock released for the next run.
    expect(state.updates.at(-1)).toEqual({ lockedUntil: null });
  });

  it("stops before starting a target once the deadline has passed", async () => {
    state.claimed = [
      {
        id: "job-1",
        groupId: "group-1",
        selection: [],
        plan: planWith([faqDefinition]),
      },
    ];
    dbMock.query.syncJobTargets.findMany
      .mockResolvedValueOnce([pendingTarget()])
      .mockResolvedValueOnce([{ status: "PENDING" }]);

    expect(await processSyncJob("job-1", 0)).toBe("more");
    expect(okTarget.graphql).not.toHaveBeenCalled();
  });

  it("marks a target FAILED when it can't be reached and rolls mixed results up to PARTIAL", async () => {
    unauthenticatedMock.admin.mockImplementation(async (shop: string) => {
      if (shop === "down.myshopify.com") throw new Error("Target offline");
      return {
        admin: shop === "source.myshopify.com" ? sourceAdmin : okTarget,
      };
    });
    state.claimed = [
      {
        id: "job-1",
        groupId: "group-1",
        selection: [],
        plan: planWith([faqDefinition]),
      },
    ];
    dbMock.query.syncJobTargets.findMany
      .mockResolvedValueOnce([
        pendingTarget({ id: "jt-down", store: { shop: "down.myshopify.com" } }),
      ])
      .mockResolvedValueOnce([{ status: "SUCCEEDED" }, { status: "FAILED" }]);

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");
    expect(state.updates).toContainEqual({
      status: "FAILED",
      errorMessage: "Target offline",
    });
    expect(state.updates).toContainEqual(
      expect.objectContaining({ status: "PARTIAL" }),
    );
  });
});
