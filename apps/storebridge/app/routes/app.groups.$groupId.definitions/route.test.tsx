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

const { getJobHistory, runSyncJob } = vi.hoisted(() => ({
  getJobHistory: vi.fn(),
  runSyncJob: vi.fn(),
}));
vi.mock("./sync.server", () => ({ getJobHistory, runSyncJob }));

const { runStatusCheck } = vi.hoisted(() => ({ runStatusCheck: vi.fn() }));
vi.mock("./syncStatus.server", () => ({ runStatusCheck }));

const { loader, action } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

function formDataRequest(fields: [string, string][]) {
  const formData = new FormData();
  for (const [key, value] of fields) formData.append(key, value);
  return {
    request: { formData: () => Promise.resolve(formData) },
    params: { groupId: "group-1" },
    context: {},
  } as never;
}

describe("app.groups.$groupId.definitions loader", () => {
  it("returns the group, definition catalog, and job history for a group the shop owns", async () => {
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
    getJobHistory.mockResolvedValue([]);

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
    expect(getJobHistory).toHaveBeenCalledWith("group-1");
    expect(result).toEqual({
      group: { id: "group-1", name: "EU stores" },
      jobs: [],
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

describe("app.groups.$groupId.definitions action", () => {
  const admin = { graphql: vi.fn() };
  const approvedGroup = {
    id: "group-1",
    targets: [{ status: "APPROVED" }],
  };

  beforeEach(() => {
    authenticateAdmin.mockResolvedValue({
      session: { shop: "source.myshopify.com" },
      admin,
    });
  });

  it("runs a sync job for the selected definitions", async () => {
    getOwnedGroup.mockResolvedValue(approvedGroup);
    runSyncJob.mockResolvedValue({ id: "job-1", status: "SUCCEEDED" });

    const result = await action(
      formDataRequest([
        ["intent", "sync"],
        ["selection", "metaobject:size_chart"],
      ]),
    );

    expect(runSyncJob).toHaveBeenCalledWith({
      group: approvedGroup,
      selection: ["metaobject:size_chart"],
      sourceAdmin: admin,
    });
    expect(result).toEqual({ ok: true, jobId: "job-1", status: "SUCCEEDED" });
  });

  it("rejects an empty selection without touching the sync engine", async () => {
    getOwnedGroup.mockResolvedValue(approvedGroup);

    const result = await action(formDataRequest([["intent", "sync"]]));

    expect(runSyncJob).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "Select at least one definition.",
    });
  });

  it("rejects when the group has no approved targets", async () => {
    getOwnedGroup.mockResolvedValue({ id: "group-1", targets: [] });

    const result = await action(
      formDataRequest([
        ["intent", "sync"],
        ["selection", "metaobject:size_chart"],
      ]),
    );

    expect(runSyncJob).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "This group has no approved target stores yet.",
    });
  });

  it("404s when the group doesn't belong to the authenticated shop", async () => {
    getOwnedGroup.mockResolvedValue(null);

    await expect(
      action(
        formDataRequest([
          ["intent", "sync"],
          ["selection", "metaobject:size_chart"],
        ]),
      ),
    ).rejects.toMatchObject({ init: { status: 404 } });
  });

  it("rejects a post with a missing or unexpected intent", async () => {
    getOwnedGroup.mockResolvedValue(approvedGroup);

    await expect(
      action(formDataRequest([["selection", "metaobject:size_chart"]])),
    ).rejects.toMatchObject({ init: { status: 400 } });

    expect(runSyncJob).not.toHaveBeenCalled();
  });

  it("runs a live status check for the checkStatus intent", async () => {
    getOwnedGroup.mockResolvedValue(approvedGroup);
    const statuses = {
      "metaobject:size_chart": {
        inSyncCount: 1,
        totalTargets: 1,
        perTarget: [
          { targetId: "t1", shop: "target.myshopify.com", status: "IN_SYNC" },
        ],
      },
    };
    runStatusCheck.mockResolvedValue(statuses);

    const result = await action(formDataRequest([["intent", "checkStatus"]]));

    expect(runStatusCheck).toHaveBeenCalledWith({
      group: approvedGroup,
      sourceAdmin: admin,
    });
    expect(result).toEqual({ ok: true, statuses });
    expect(runSyncJob).not.toHaveBeenCalled();
  });
});
