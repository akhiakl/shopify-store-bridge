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
      connections: { findMany: vi.fn() },
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
  it("returns outgoing connections, incoming requests, and incoming connections", async () => {
    dbMock.insert.mockReturnValueOnce(chain([{ id: "store-1", shop: SHOP }]));
    dbMock.query.connections.findMany
      .mockResolvedValueOnce([{ id: "out-1" }])
      .mockResolvedValueOnce([{ id: "request-1" }])
      .mockResolvedValueOnce([{ id: "in-1" }]);

    const result = await getDashboardData(SHOP);

    expect(result).toEqual({
      outgoing: [{ id: "out-1" }],
      incomingRequests: [{ id: "request-1" }],
      incoming: [{ id: "in-1" }],
    });
    expect(dbMock.query.connections.findMany).toHaveBeenCalledTimes(3);
  });
});

describe("getRecentJobs", () => {
  it("returns an empty list without querying when there are no connections", async () => {
    const result = await getRecentJobs([]);

    expect(result).toEqual([]);
    expect(dbMock.query.syncJobs.findMany).not.toHaveBeenCalled();
  });

  it("queries jobs scoped to the given connection ids, newest first", async () => {
    dbMock.query.syncJobs.findMany.mockResolvedValue([{ id: "job-1" }]);

    const result = await getRecentJobs(["conn-1", "conn-2"], 5);

    expect(result).toEqual([{ id: "job-1" }]);
    expect(dbMock.query.syncJobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { plan: false },
        with: { connection: { with: { source: true, target: true } } },
        limit: 5,
      }),
    );
  });
});
