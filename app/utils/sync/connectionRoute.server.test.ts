import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getConnectionAccess, sourceAdminFor } = vi.hoisted(() => ({
  getConnectionAccess: vi.fn(),
  sourceAdminFor: vi.fn(),
}));
vi.mock("./connectionAccess.server", () => ({
  getConnectionAccess,
  sourceAdminFor,
}));

const { enqueueSyncJob, driveSyncJob, waitUntil } = vi.hoisted(() => ({
  enqueueSyncJob: vi.fn(),
  driveSyncJob: vi.fn(),
  waitUntil: vi.fn(),
}));
vi.mock("./syncQueue.server", () => ({ enqueueSyncJob, driveSyncJob }));
vi.mock("@vercel/functions", () => ({ waitUntil }));

const { runStatusCheck } = vi.hoisted(() => ({ runStatusCheck: vi.fn() }));
vi.mock("./syncStatus.server", () => ({ runStatusCheck }));

const { requireConnectionPage, connectionPageAction } =
  await import("./connectionRoute.server");

const sessionAdmin = { graphql: vi.fn() };
const sourceAdmin = { graphql: vi.fn() };
const approved = {
  id: "conn-1",
  status: "APPROVED",
  target: { shop: "target.myshopify.com" },
};

function args(fields: [string, string][] = []) {
  const formData = new FormData();
  for (const [key, value] of fields) formData.append(key, value);
  return {
    request: { formData: () => Promise.resolve(formData) },
    params: { connectionId: "conn-1" },
    context: {},
  } as never;
}

const asSource = (connection: unknown) => ({ connection, role: "source" });

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdmin.mockResolvedValue({
    session: { shop: "source.myshopify.com" },
    admin: sessionAdmin,
  });
  sourceAdminFor.mockResolvedValue(sourceAdmin);
});

describe("requireConnectionPage", () => {
  it("checks access with the session's shop and returns the source admin", async () => {
    const access = asSource(approved);
    getConnectionAccess.mockResolvedValue(access);

    const result = await requireConnectionPage(args());

    expect(getConnectionAccess).toHaveBeenCalledWith(
      "conn-1",
      "source.myshopify.com",
    );
    expect(sourceAdminFor).toHaveBeenCalledWith(access, sessionAdmin);
    expect(result).toEqual({ ...access, sourceAdmin, isApproved: true });
  });

  it("404s for a shop with no access", async () => {
    getConnectionAccess.mockResolvedValue(null);

    await expect(requireConnectionPage(args())).rejects.toMatchObject({
      init: { status: 404 },
    });
    expect(sourceAdminFor).not.toHaveBeenCalled();
  });
});

describe("connectionPageAction", () => {
  it("queues a sync job for the connection", async () => {
    getConnectionAccess.mockResolvedValue(asSource(approved));
    enqueueSyncJob.mockResolvedValue({ id: "job-1" });

    const result = await connectionPageAction(
      args([
        ["intent", "sync"],
        ["selection", "metaobject:size_chart"],
      ]),
    );

    expect(enqueueSyncJob).toHaveBeenCalledWith("conn-1", [
      "metaobject:size_chart",
    ]);
    // The first run starts in the background, after the response.
    expect(driveSyncJob).toHaveBeenCalledWith("job-1");
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, jobId: "job-1" });
  });

  it("rejects an empty selection without touching the sync engine", async () => {
    getConnectionAccess.mockResolvedValue(asSource(approved));

    const result = await connectionPageAction(args([["intent", "sync"]]));

    expect(enqueueSyncJob).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Select at least one item." });
  });

  it("rejects syncing before the target approves", async () => {
    getConnectionAccess.mockResolvedValue(
      asSource({ ...approved, status: "PENDING" }),
    );

    const result = await connectionPageAction(
      args([
        ["intent", "sync"],
        ["selection", "metaobject:size_chart"],
      ]),
    );

    expect(enqueueSyncJob).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "target.myshopify.com hasn't approved this connection yet.",
    });
  });

  it("rejects a post with a missing or unexpected intent", async () => {
    getConnectionAccess.mockResolvedValue(asSource(approved));

    await expect(
      connectionPageAction(args([["selection", "metaobject:size_chart"]])),
    ).rejects.toMatchObject({ init: { status: 400 } });
    expect(enqueueSyncJob).not.toHaveBeenCalled();
  });

  it("runs a live status check against the source for checkStatus", async () => {
    getConnectionAccess.mockResolvedValue(asSource(approved));
    const statuses = {
      "metaobject:size_chart": {
        inSyncCount: 1,
        totalTargets: 1,
        perTarget: [],
      },
    };
    runStatusCheck.mockResolvedValue(statuses);

    const result = await connectionPageAction(
      args([["intent", "checkStatus"]]),
    );

    expect(runStatusCheck).toHaveBeenCalledWith({
      connection: approved,
      sourceAdmin,
    });
    expect(result).toEqual({ ok: true, statuses });
  });
});
