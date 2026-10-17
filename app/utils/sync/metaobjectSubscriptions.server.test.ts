import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, unauthenticatedAdmin } = vi.hoisted(() => ({
  dbMock: {
    query: {
      connections: { findMany: vi.fn() },
      syncJobs: { findFirst: vi.fn() },
    },
  },
  unauthenticatedAdmin: vi.fn(),
}));
vi.mock("~/db.server", () => ({ default: dbMock }));
vi.mock("~/shopify.server", () => ({
  unauthenticated: { admin: unauthenticatedAdmin },
}));

const {
  autoSyncEntryTypes,
  typeFilter,
  reconcileSubscriptions,
  refreshMetaobjectSubscriptions,
} = await import("./metaobjectSubscriptions.server");

const URI = "https://app.example/webhooks/source-changed";

/** An admin whose existing-subscriptions query returns `existing`, and
 * whose mutations succeed unless `mutationErrors` is set. */
function admin(
  existing: { id: string; topic: string; filter: string | null }[],
  mutationErrors: { message: string }[] = [],
) {
  return {
    graphql: vi.fn<
      (query: string, opts?: { variables: unknown }) => Promise<unknown>
    >((query) => {
      const body = query.includes("query MetaobjectSubscriptions")
        ? { data: { webhookSubscriptions: { nodes: existing } } }
        : { data: { payload: { userErrors: mutationErrors } } };
      return Promise.resolve({ json: () => Promise.resolve(body) });
    }),
  };
}

const mutations = (a: ReturnType<typeof admin>) =>
  a.graphql.mock.calls
    .slice(1)
    .map(([query, opts]) => [
      (query as string).match(/mutation (\w+)/)?.[1],
      (opts as { variables: unknown }).variables,
    ]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SHOPIFY_APP_URL", "https://app.example");
});

describe("autoSyncEntryTypes", () => {
  it("collects entry types from the shop's auto-sync connections' last syncs", async () => {
    dbMock.query.connections.findMany.mockResolvedValue([
      { id: "c1", source: { shop: "a.shop" } },
      { id: "c2", source: { shop: "a.shop" } },
      { id: "c3", source: { shop: "other.shop" } },
    ]);
    dbMock.query.syncJobs.findFirst
      .mockResolvedValueOnce({
        selection: ["metaobjectEntries:faq", "metaobject:faq", "collection:x"],
      })
      .mockResolvedValueOnce({ selection: ["metaobjectEntries:banner"] });

    expect(await autoSyncEntryTypes("a.shop")).toEqual(["banner", "faq"]);
    expect(dbMock.query.syncJobs.findFirst).toHaveBeenCalledTimes(2);
  });

  it("is empty for a connection that never synced", async () => {
    dbMock.query.connections.findMany.mockResolvedValue([
      { id: "c1", source: { shop: "a.shop" } },
    ]);
    dbMock.query.syncJobs.findFirst.mockResolvedValue(undefined);
    expect(await autoSyncEntryTypes("a.shop")).toEqual([]);
  });
});

describe("typeFilter", () => {
  it("ORs one type: term per type, or null for none", () => {
    expect(typeFilter(["a", "b"])).toBe("type:a OR type:b");
    expect(typeFilter([])).toBeNull();
  });
});

describe("reconcileSubscriptions", () => {
  it("creates both subscriptions when none exist", async () => {
    const a = admin([]);
    await reconcileSubscriptions(a as never, { uri: URI, filter: "type:faq" });
    expect(mutations(a)).toEqual([
      [
        "MetaobjectSubscriptionCreate",
        { topic: "METAOBJECTS_CREATE", sub: { uri: URI, filter: "type:faq" } },
      ],
      [
        "MetaobjectSubscriptionCreate",
        { topic: "METAOBJECTS_UPDATE", sub: { uri: URI, filter: "type:faq" } },
      ],
    ]);
  });

  it("updates a changed filter and leaves a matching one alone", async () => {
    const a = admin([
      { id: "s1", topic: "METAOBJECTS_CREATE", filter: "type:faq" },
      { id: "s2", topic: "METAOBJECTS_UPDATE", filter: "type:old" },
    ]);
    await reconcileSubscriptions(a as never, { uri: URI, filter: "type:faq" });
    expect(mutations(a)).toEqual([
      [
        "MetaobjectSubscriptionUpdate",
        { id: "s2", sub: { uri: URI, filter: "type:faq" } },
      ],
    ]);
  });

  it("deletes the subscriptions when there's nothing to watch", async () => {
    const a = admin([
      { id: "s1", topic: "METAOBJECTS_CREATE", filter: "type:faq" },
    ]);
    await reconcileSubscriptions(a as never, { uri: URI, filter: null });
    expect(mutations(a)).toEqual([
      ["MetaobjectSubscriptionDelete", { id: "s1" }],
    ]);
  });

  it("throws on a user error or a top-level error", async () => {
    await expect(
      reconcileSubscriptions(admin([], [{ message: "Bad filter" }]) as never, {
        uri: URI,
        filter: "type:x",
      }),
    ).rejects.toThrow("Bad filter");

    const failing = {
      graphql: vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ errors: [{ message: "Denied" }] }),
        }),
      ),
    };
    await expect(
      reconcileSubscriptions(failing as never, { uri: URI, filter: null }),
    ).rejects.toThrow("Denied");
  });
});

describe("refreshMetaobjectSubscriptions", () => {
  it("reconciles the source store's subscriptions with the app's URL", async () => {
    dbMock.query.connections.findMany.mockResolvedValue([]);
    const a = admin([]);
    unauthenticatedAdmin.mockResolvedValue({ admin: a });

    await refreshMetaobjectSubscriptions("a.shop");

    expect(unauthenticatedAdmin).toHaveBeenCalledWith("a.shop");
    expect(a.graphql).toHaveBeenCalledWith(expect.any(String), {
      variables: {
        topics: ["METAOBJECTS_CREATE", "METAOBJECTS_UPDATE"],
        uri: URI,
      },
    });
  });

  it("logs a failure instead of throwing", async () => {
    dbMock.query.connections.findMany.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(refreshMetaobjectSubscriptions("a.shop")).resolves.toBe(
      undefined,
    );
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("does nothing without an app URL to point the webhooks at", async () => {
    vi.stubEnv("SHOPIFY_APP_URL", "");
    await refreshMetaobjectSubscriptions("a.shop");
    expect(dbMock.query.connections.findMany).not.toHaveBeenCalled();
  });
});
