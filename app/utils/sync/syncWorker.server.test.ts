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
        connections: { findFirst: vi.fn() },
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
  metafieldValues: [],
  shopMetafieldValues: [],
  menus: [],
  locations: [],
});

/** A claimed job row, fresh (no plan yet) unless overridden. */
function claimedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    connectionId: "conn-1",
    selection: ["metaobject:faq"],
    plan: null,
    stepsDone: 0,
    stepsTotal: 0,
    itemsSynced: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    ...overrides,
  };
}

function connection(status = "APPROVED") {
  return {
    id: "conn-1",
    status,
    source: { shop: "source.myshopify.com" },
    target: { shop: "target.myshopify.com" },
  };
}

const finishedWith = (status: string) =>
  expect.objectContaining({ status, plan: null, lockedUntil: null });

beforeEach(() => {
  vi.clearAllMocks();
  state.claimed = [];
  state.updates = [];
  state.inserts = [];
  dbMock.query.connections.findFirst.mockResolvedValue(connection());
  unauthenticatedMock.admin.mockImplementation(async (shop: string) => ({
    admin: shop === "source.myshopify.com" ? sourceAdmin : okTarget,
  }));
});

describe("processSyncJob", () => {
  it("does nothing when another run holds the lock or the job has ended", async () => {
    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("busy");
    expect(dbMock.query.connections.findFirst).not.toHaveBeenCalled();
  });

  it("plans a new job, syncs it into the target, and finishes it", async () => {
    state.claimed = [claimedJob()];

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.updates).toContainEqual({
      plan: planWith([faqDefinition]),
      status: "RUNNING",
      stepsTotal: 1,
    });
    expect(state.inserts[0].values).toEqual([
      {
        jobId: "job-1",
        key: "metaobject:faq",
        kind: "DEFINITION",
        status: "SUCCEEDED",
        errorMessage: null,
      },
    ]);
    expect(state.updates).toContainEqual({
      stepsDone: 1,
      itemsSynced: 1,
      itemsSkipped: 0,
      itemsFailed: 0,
    });
    expect(state.updates).toContainEqual(finishedWith("SUCCEEDED"));
    expect(unauthenticatedMock.admin).toHaveBeenCalledWith(
      "target.myshopify.com",
    );
  });

  it("fails the job when nothing selected exists on the source anymore", async () => {
    state.claimed = [claimedJob({ selection: ["metaobject:gone"] })];

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.updates).toContainEqual(
      expect.objectContaining({
        status: "FAILED",
        errorMessage:
          "None of the selected items exist on the source store anymore.",
      }),
    );
    expect(state.inserts).toEqual([]);
  });

  it("fails a job whose connection isn't approved, without reading the source", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(connection("PENDING"));
    state.claimed = [claimedJob()];

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.updates).toContainEqual(
      expect.objectContaining({
        status: "FAILED",
        errorMessage: "target.myshopify.com hasn't approved this connection.",
      }),
    );
    expect(sourceAdmin.graphql).not.toHaveBeenCalled();
  });

  it("fails the job with the reason when the connection is gone", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(undefined);
    state.claimed = [claimedJob()];

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.updates).toContainEqual(
      expect.objectContaining({
        status: "FAILED",
        errorMessage: "This connection no longer exists.",
      }),
    );
  });

  it("resumes a planned job from its saved step and reports work left at the deadline", async () => {
    const plan = planWith([faqDefinition, { ...faqDefinition, type: "b" }]);
    state.claimed = [
      claimedJob({ plan, stepsDone: 1, stepsTotal: 2, itemsSynced: 1 }),
    ];
    // Let exactly one step run: the deadline passes once it's done.
    let calls = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (calls++ === 0 ? 0 : 10));

    expect(await processSyncJob("job-1", 5)).toBe("done");

    // Never re-plans a job that already has one.
    expect(sourceAdmin.graphql).not.toHaveBeenCalled();
    expect(state.updates).toContainEqual(
      expect.objectContaining({ stepsDone: 2, itemsSynced: 2 }),
    );
    vi.restoreAllMocks();
  });

  it("stops before the next step once the deadline has passed", async () => {
    const plan = planWith([faqDefinition]);
    state.claimed = [claimedJob({ plan, stepsTotal: 1 })];

    expect(await processSyncJob("job-1", 0)).toBe("more");

    expect(okTarget.graphql).not.toHaveBeenCalled();
    expect(state.updates).toContainEqual(
      expect.objectContaining({ stepsDone: 0 }),
    );
    expect(state.updates).not.toContainEqual(finishedWith("SUCCEEDED"));
  });

  it("finishes FAILED when an item failed", async () => {
    const plan = planWith([faqDefinition]);
    state.claimed = [claimedJob({ plan, stepsTotal: 1 })];
    okTarget.graphql.mockResolvedValueOnce(
      jsonResponse({
        metaobjectDefinitionCreate: {
          metaobjectDefinition: null,
          userErrors: [{ field: ["type"], message: "Bad", code: "INVALID" }],
        },
      }) as never,
    );

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.updates).toContainEqual(
      expect.objectContaining({ itemsFailed: 1 }),
    );
    expect(state.updates).toContainEqual(finishedWith("FAILED"));
  });

  it("fails the job when the target can't be reached", async () => {
    const plan = planWith([faqDefinition]);
    state.claimed = [claimedJob({ plan, stepsTotal: 1 })];
    unauthenticatedMock.admin.mockImplementation(async (shop: string) => {
      if (shop === "target.myshopify.com") throw new Error("Session gone");
      return { admin: sourceAdmin };
    });

    expect(await processSyncJob("job-1", NO_DEADLINE)).toBe("done");

    expect(state.updates).toContainEqual(
      expect.objectContaining({
        status: "FAILED",
        errorMessage: "Session gone",
      }),
    );
  });
});
