import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, setCalls, enqueueSyncJob } = vi.hoisted(() => {
  const setCalls: unknown[] = [];
  return {
    setCalls,
    enqueueSyncJob: vi.fn(),
    dbMock: {
      query: {
        connections: { findMany: vi.fn() },
        syncJobs: { findFirst: vi.fn() },
      },
      update: vi.fn(() => ({
        set: (values: unknown) => {
          setCalls.push(values);
          return { where: () => Promise.resolve() };
        },
      })),
    },
  };
});
vi.mock("~/db.server", () => ({ default: dbMock }));
vi.mock("./syncQueue.server", () => ({ enqueueSyncJob }));

const { setAutoSync, triggerAutoSync, wouldLoop } =
  await import("./autoSync.server");

const edge = (
  id: string,
  [from, to]: [string, string],
  shop = `${from}.shop`,
) => ({ id, sourceStoreId: from, targetStoreId: to, source: { shop } });

beforeEach(() => {
  vi.clearAllMocks();
  setCalls.length = 0;
});

describe("wouldLoop", () => {
  it("finds a chain of auto-syncing connections leading back to the source", async () => {
    // A -> B (new), B -> C, C -> A: a loop. D -> A doesn't matter.
    dbMock.query.connections.findMany.mockResolvedValue([
      edge("bc", ["B", "C"]),
      edge("ca", ["C", "A"]),
      edge("da", ["D", "A"]),
    ]);
    expect(
      await wouldLoop({ id: "ab", sourceStoreId: "A", targetStoreId: "B" }),
    ).toBe(true);

    dbMock.query.connections.findMany.mockResolvedValue([
      edge("bc", ["B", "C"]),
      edge("cb", ["C", "B"]),
      // The connection itself, already on, doesn't count as a path.
      edge("ab", ["A", "B"]),
    ]);
    expect(
      await wouldLoop({ id: "ab", sourceStoreId: "A", targetStoreId: "B" }),
    ).toBe(false);
  });
});

describe("triggerAutoSync", () => {
  it("re-queues the last selection for this shop's idle auto-sync connections only", async () => {
    dbMock.query.connections.findMany.mockResolvedValue([
      edge("idle", ["A", "B"], "a.myshopify.com"),
      edge("busy", ["A", "C"], "a.myshopify.com"),
      edge("never", ["A", "D"], "a.myshopify.com"),
      edge("other", ["Z", "B"], "z.myshopify.com"),
    ]);
    // Per connection: active-job lookup, then last-job lookup.
    dbMock.query.syncJobs.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ selection: ["menu:main-menu"] })
      .mockResolvedValueOnce({ id: "running-job" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    enqueueSyncJob.mockResolvedValue({ id: "job-1" });

    expect(await triggerAutoSync("a.myshopify.com")).toEqual(["job-1"]);
    expect(enqueueSyncJob).toHaveBeenCalledTimes(1);
    expect(enqueueSyncJob).toHaveBeenCalledWith("idle", ["menu:main-menu"]);
  });
});

describe("setAutoSync", () => {
  const connection = { id: "ab", sourceStoreId: "A", targetStoreId: "B" };

  it("turns it on once there's a sync to repeat and no loop", async () => {
    dbMock.query.syncJobs.findFirst.mockResolvedValue({ id: "job-1" });
    dbMock.query.connections.findMany.mockResolvedValue([]);

    expect(await setAutoSync(connection, true)).toEqual({ ok: true });
    expect(setCalls).toEqual([{ autoSync: true }]);
  });

  it("refuses to turn it on with nothing synced yet, or when it would loop", async () => {
    dbMock.query.syncJobs.findFirst.mockResolvedValue(undefined);
    expect(await setAutoSync(connection, true)).toEqual({
      ok: false,
      error: "Run a sync first: auto-sync repeats the last one.",
    });

    dbMock.query.syncJobs.findFirst.mockResolvedValue({ id: "job-1" });
    dbMock.query.connections.findMany.mockResolvedValue([
      edge("ba", ["B", "A"]),
    ]);
    const looped = await setAutoSync(connection, true);
    expect(looped.ok).toBe(false);
    expect(setCalls).toEqual([]);
  });

  it("always lets it be turned off", async () => {
    expect(await setAutoSync(connection, false)).toEqual({ ok: true });
    expect(setCalls).toEqual([{ autoSync: false }]);
    expect(dbMock.query.syncJobs.findFirst).not.toHaveBeenCalled();
  });
});
