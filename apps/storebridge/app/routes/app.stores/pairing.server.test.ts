import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A minimal stand-in for Drizzle's fluent query builders
 * (`db.insert(...).values(...).returning()`,
 * `db.update(...).set(...).where(...)`) — each chain method returns the
 * same mock object so calls can keep chaining, and the terminal method
 * resolves to `result` (awaiting a non-terminal call, e.g. a bare
 * `await db.insert(t).values(v)` with no `.returning()`, just resolves to
 * the chain object itself, which is fine since prod code never inspects
 * that case's resolved value).
 */
function chain(result: unknown) {
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  obj.values = vi.fn(() => obj);
  obj.onConflictDoUpdate = vi.fn(() => obj);
  obj.set = vi.fn(() => obj);
  obj.where = vi.fn(() => Promise.resolve(result));
  obj.returning = vi.fn(() => Promise.resolve(result));
  return obj;
}

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      sessions: { findFirst: vi.fn() },
      syncGroups: { findFirst: vi.fn(), findMany: vi.fn() },
      syncGroupTargets: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const {
  normalizeShopDomain,
  getDashboardData,
  requestPairing,
  getPendingRequestByToken,
  getPairingLinkStatus,
  approvePairingRequest,
  declinePairingRequest,
} = await import("./pairing.server");
const { stores, syncGroups, syncGroupTargets } =
  await import("~/db/schema.server");

const SOURCE_SHOP = "source-shop.myshopify.com";
const TARGET_SHOP = "target-shop.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeShopDomain", () => {
  it("accepts a bare myshopify.com domain", () => {
    expect(normalizeShopDomain("example.myshopify.com")).toBe(
      "example.myshopify.com",
    );
  });

  it("strips a protocol and trailing path, and lowercases", () => {
    expect(normalizeShopDomain("https://Example.MYSHOPIFY.com/admin")).toBe(
      "example.myshopify.com",
    );
  });

  it("rejects a non-myshopify domain", () => {
    expect(normalizeShopDomain("example.com")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeShopDomain("")).toBeNull();
  });

  it("rejects a subdomain ending in a hyphen", () => {
    expect(normalizeShopDomain("bad-.myshopify.com")).toBeNull();
  });

  it("accepts a single-character subdomain", () => {
    expect(normalizeShopDomain("a.myshopify.com")).toBe("a.myshopify.com");
  });

  it("appends .myshopify.com to a bare handle, same as login()'s own normalization", () => {
    expect(normalizeShopDomain("acme")).toBe("acme.myshopify.com");
  });

  it("rejects a bare handle with an invalid label even after appending the domain", () => {
    expect(normalizeShopDomain("bad-")).toBeNull();
  });

  it("accepts the configured custom domain", () => {
    vi.stubEnv("SHOP_CUSTOM_DOMAIN", "shop.example.com");
    expect(normalizeShopDomain("shop.example.com")).toBe("shop.example.com");
    vi.unstubAllEnvs();
  });

  it("still rejects a non-myshopify domain that isn't the configured custom domain", () => {
    vi.stubEnv("SHOP_CUSTOM_DOMAIN", "shop.example.com");
    expect(normalizeShopDomain("other.example.com")).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("requestPairing", () => {
  it("rejects an invalid target domain", async () => {
    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: "not-a-shop.example.com",
    });
    expect(result).toEqual({
      ok: false,
      error: "Enter a valid *.myshopify.com domain.",
    });
  });

  it("rejects pairing a store with itself", async () => {
    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: SOURCE_SHOP,
    });
    expect(result).toEqual({
      ok: false,
      error: "A store can't be paired with itself.",
    });
  });

  it("returns an install link when the target isn't installed", async () => {
    dbMock.query.sessions.findFirst.mockResolvedValue(undefined);

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
    });

    expect(result).toEqual({
      ok: false,
      error: `StoreBridge isn't installed on ${TARGET_SHOP} yet.`,
      installUrl: `/auth/login?shop=${encodeURIComponent(TARGET_SHOP)}`,
    });
  });

  it("creates a new group and invites the target when installed", async () => {
    dbMock.query.sessions.findFirst.mockResolvedValue({ id: "session-1" });
    const sourceChain = chain([{ id: "source-id", shop: SOURCE_SHOP }]);
    const targetChain = chain([{ id: "target-id", shop: TARGET_SHOP }]);
    const groupChain = chain([
      { id: "group-1", sourceId: "source-id", name: "My group" },
    ]);
    const targetRowChain = chain(undefined);
    dbMock.insert
      .mockReturnValueOnce(sourceChain)
      .mockReturnValueOnce(targetChain)
      .mockReturnValueOnce(groupChain)
      .mockReturnValueOnce(targetRowChain);
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(undefined);

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
      groupName: "My group",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.targetShop).toBe(TARGET_SHOP);
    expect(result.authToken).toEqual(expect.any(String));
    expect(dbMock.insert).toHaveBeenNthCalledWith(3, syncGroups);
    expect(groupChain.values).toHaveBeenCalledWith({
      sourceId: "source-id",
      name: "My group",
    });
    expect(dbMock.insert).toHaveBeenNthCalledWith(4, syncGroupTargets);
    expect(targetRowChain.values).toHaveBeenCalledWith({
      groupId: "group-1",
      storeId: "target-id",
      authTokenHash: expect.any(String),
      authTokenExpiresAt: expect.any(Date),
    });
  });

  it("errors when an explicit groupId isn't owned by the source", async () => {
    dbMock.query.sessions.findFirst.mockResolvedValue({ id: "session-1" });
    dbMock.insert
      .mockReturnValueOnce(chain([{ id: "source-id", shop: SOURCE_SHOP }]))
      .mockReturnValueOnce(chain([{ id: "target-id", shop: TARGET_SHOP }]));
    dbMock.query.syncGroups.findFirst.mockResolvedValue(undefined);

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
      groupId: "missing-group",
    });

    expect(result).toEqual({
      ok: false,
      error: "That sync group no longer exists.",
    });
  });

  it("errors when the target already has a status in the group", async () => {
    dbMock.query.sessions.findFirst.mockResolvedValue({ id: "session-1" });
    dbMock.insert
      .mockReturnValueOnce(chain([{ id: "source-id", shop: SOURCE_SHOP }]))
      .mockReturnValueOnce(chain([{ id: "target-id", shop: TARGET_SHOP }]))
      .mockReturnValueOnce(chain([{ id: "group-1" }]));
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      status: "APPROVED",
    });

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
    });

    expect(result).toEqual({
      ok: false,
      error: `${TARGET_SHOP} is already approved in this group.`,
    });
  });
});

describe("getPendingRequestByToken", () => {
  const futureExpiry = new Date(Date.now() + 60_000);

  it("returns null for a token that doesn't match any request", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(undefined);

    expect(await getPendingRequestByToken("nope", TARGET_SHOP)).toBeNull();
  });

  it("returns null when the token belongs to a different shop", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      authTokenExpiresAt: futureExpiry,
      store: { shop: "someone-else.myshopify.com" },
    });

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBeNull();
  });

  it("returns null once the request was already responded to", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "APPROVED",
      authTokenExpiresAt: futureExpiry,
      store: { shop: TARGET_SHOP },
    });

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      authTokenExpiresAt: new Date(Date.now() - 1000),
      store: { shop: TARGET_SHOP },
    });

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBeNull();
  });

  it("returns the matching pending request for a valid token", async () => {
    const target = {
      id: "target-1",
      status: "PENDING",
      authTokenExpiresAt: futureExpiry,
      store: { shop: TARGET_SHOP },
    };
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(target);

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBe(target);
  });
});

describe("approvePairingRequest", () => {
  it("errors when the token is invalid", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(undefined);

    const result = await approvePairingRequest({
      token: "bad",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({
      ok: false,
      error: "This pairing link is invalid, expired, or already used.",
    });
  });

  it("approves and clears the token on a valid one", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      authTokenExpiresAt: new Date(Date.now() + 60_000),
      store: { shop: TARGET_SHOP },
    });
    const updateChain = chain(undefined);
    dbMock.update.mockReturnValueOnce(updateChain);

    const result = await approvePairingRequest({
      token: "good",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: true });
    expect(dbMock.update).toHaveBeenCalledWith(syncGroupTargets);
    expect(updateChain.set).toHaveBeenCalledWith({
      status: "APPROVED",
      respondedAt: expect.any(Date),
      authTokenExpiresAt: null,
    });
  });
});

describe("getPairingLinkStatus", () => {
  it("returns not_found for a token that doesn't match any request", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(undefined);

    expect(await getPairingLinkStatus("nope", TARGET_SHOP)).toEqual({
      state: "not_found",
    });
  });

  it("returns not_found when the token belongs to a different shop", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      status: "PENDING",
      store: { shop: "someone-else.myshopify.com" },
    });

    expect(await getPairingLinkStatus("tok", TARGET_SHOP)).toEqual({
      state: "not_found",
    });
  });

  it("returns already_approved with the source shop and group name", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      status: "APPROVED",
      store: { shop: TARGET_SHOP },
      group: { name: "EU stores", source: { shop: SOURCE_SHOP } },
    });

    expect(await getPairingLinkStatus("tok", TARGET_SHOP)).toEqual({
      state: "already_approved",
      sourceShop: SOURCE_SHOP,
      groupName: "EU stores",
    });
  });

  it("returns already_declined", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      status: "DECLINED",
      store: { shop: TARGET_SHOP },
    });

    expect(await getPairingLinkStatus("tok", TARGET_SHOP)).toEqual({
      state: "already_declined",
    });
  });

  it("returns expired for a PENDING row past its expiry", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      status: "PENDING",
      authTokenExpiresAt: new Date(Date.now() - 1000),
      store: { shop: TARGET_SHOP },
    });

    expect(await getPairingLinkStatus("tok", TARGET_SHOP)).toEqual({
      state: "expired",
    });
  });

  it("returns pending with the target for a valid, unexpired token", async () => {
    const target = {
      status: "PENDING",
      authTokenExpiresAt: new Date(Date.now() + 60_000),
      store: { shop: TARGET_SHOP },
    };
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(target);

    expect(await getPairingLinkStatus("tok", TARGET_SHOP)).toEqual({
      state: "pending",
      target,
    });
  });
});

describe("declinePairingRequest", () => {
  it("errors when the request doesn't exist", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(undefined);

    const result = await declinePairingRequest({
      targetId: "missing",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("errors when the caller isn't the target store", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      store: { shop: "someone-else.myshopify.com" },
    });

    const result = await declinePairingRequest({
      targetId: "target-1",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("errors when the request was already responded to", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "APPROVED",
      store: { shop: TARGET_SHOP },
    });

    const result = await declinePairingRequest({
      targetId: "target-1",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({
      ok: false,
      error: "This request was already responded to.",
    });
  });

  it("declines a pending request from the target store", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      store: { shop: TARGET_SHOP },
    });
    const updateChain = chain(undefined);
    dbMock.update.mockReturnValueOnce(updateChain);

    const result = await declinePairingRequest({
      targetId: "target-1",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: true });
    expect(dbMock.update).toHaveBeenCalledWith(syncGroupTargets);
    expect(updateChain.set).toHaveBeenCalledWith({
      status: "DECLINED",
      respondedAt: expect.any(Date),
      authTokenExpiresAt: null,
    });
  });
});

describe("getDashboardData", () => {
  it("returns owned groups, incoming requests, and memberships", async () => {
    const storeChain = chain([{ id: "store-1", shop: SOURCE_SHOP }]);
    dbMock.insert.mockReturnValueOnce(storeChain);
    dbMock.query.syncGroups.findMany.mockResolvedValue([{ id: "group-1" }]);
    dbMock.query.syncGroupTargets.findMany
      .mockResolvedValueOnce([{ id: "incoming-1" }])
      .mockResolvedValueOnce([{ id: "membership-1" }]);

    const result = await getDashboardData(SOURCE_SHOP);

    expect(result).toEqual({
      ownedGroups: [{ id: "group-1" }],
      incomingRequests: [{ id: "incoming-1" }],
      memberships: [{ id: "membership-1" }],
    });
    expect(dbMock.insert).toHaveBeenCalledWith(stores);
    expect(dbMock.query.syncGroups.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.syncGroupTargets.findMany).toHaveBeenCalledTimes(2);
  });
});
