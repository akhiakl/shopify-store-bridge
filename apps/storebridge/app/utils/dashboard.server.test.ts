import { beforeEach, describe, expect, it, vi } from "vitest";

/** Same minimal fluent-builder stand-in as pairing.server.test.ts. */
function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  obj.values = vi.fn(() => obj);
  obj.onConflictDoUpdate = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(result));
  return obj as Record<string, ReturnType<typeof vi.fn>>;
}

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      syncGroups: { findMany: vi.fn() },
      syncGroupTargets: { findMany: vi.fn() },
      syncJobs: { findMany: vi.fn() },
    },
    insert: vi.fn(),
  },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { getDashboardData, getOrCreateStore, getRecentJobs } =
  await import("./dashboard.server");
const { stores } = await import("~/db/schema.server");

const SHOP = "source-shop.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateStore", () => {
  it("upserts by shop and returns the row", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "store-1", shop: SHOP }]));

    const store = await getOrCreateStore(SHOP);

    expect(store).toEqual({ id: "store-1", shop: SHOP });
    expect(dbMock.insert).toHaveBeenCalledWith(stores);
  });
});

describe("getDashboardData", () => {
  it("returns owned groups, incoming requests, and memberships", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "store-1", shop: SHOP }]));
    dbMock.query.syncGroups.findMany.mockResolvedValue([{ id: "group-1" }]);
    dbMock.query.syncGroupTargets.findMany
      .mockResolvedValueOnce([{ id: "incoming-1" }])
      .mockResolvedValueOnce([{ id: "membership-1" }]);

    const result = await getDashboardData(SHOP);

    expect(result).toEqual({
      ownedGroups: [{ id: "group-1" }],
      incomingRequests: [{ id: "incoming-1" }],
      memberships: [{ id: "membership-1" }],
    });
    expect(dbMock.query.syncGroups.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.syncGroupTargets.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("getRecentJobs", () => {
  it("returns an empty list without querying when there are no owned groups", async () => {
    const result = await getRecentJobs([]);

    expect(result).toEqual([]);
    expect(dbMock.query.syncJobs.findMany).not.toHaveBeenCalled();
  });

  it("queries jobs scoped to the given group ids, newest first", async () => {
    dbMock.query.syncJobs.findMany.mockResolvedValue([{ id: "job-1" }]);

    const result = await getRecentJobs(["group-1", "group-2"], 5);

    expect(result).toEqual([{ id: "job-1" }]);
    expect(dbMock.query.syncJobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ with: { group: true }, limit: 5 }),
    );
  });
});
