import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A minimal stand-in for Drizzle's fluent query builders
 * (`db.insert(...).values(...).returning()`,
 * `db.update(...).set(...).where(...).returning()`) — every chain method
 * returns the same mock object so calls can keep chaining (e.g. `.where()`
 * followed by `.returning()`), and the object is itself thenable so a bare
 * `await db.update(t).set(v).where(...)` with no `.returning()` resolves
 * directly to `result` too, matching how Drizzle's real query builders
 * work (chainable AND awaitable at any point in the chain).
 */
function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  obj.values = vi.fn(() => obj);
  obj.onConflictDoUpdate = vi.fn(() => obj);
  obj.set = vi.fn(() => obj);
  obj.where = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(result));
  obj.then = (resolve: (value: unknown) => void) => resolve(result);
  return obj as Record<string, ReturnType<typeof vi.fn>>;
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
  requestPairing,
  getPendingRequestByToken,
  approvePairingRequest,
  declinePairingRequest,
  regeneratePairingRequest,
} = await import("./pairing.server");
const { syncGroups, syncGroupTargets } = await import("~/db/schema.server");

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

  it("accepts a bare store handle and appends .myshopify.com", () => {
    expect(normalizeShopDomain("poc-liquid")).toBe("poc-liquid.myshopify.com");
  });

  it("lowercases and appends the suffix to a bare handle with a protocol/path", () => {
    expect(normalizeShopDomain("https://POC-Liquid/admin")).toBe(
      "poc-liquid.myshopify.com",
    );
  });

  it("rejects a non-myshopify custom domain", () => {
    expect(normalizeShopDomain("example.com")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeShopDomain("")).toBeNull();
  });

  it("rejects a bare handle ending in a hyphen", () => {
    expect(normalizeShopDomain("bad-")).toBeNull();
  });

  it("rejects a subdomain ending in a hyphen", () => {
    expect(normalizeShopDomain("bad-.myshopify.com")).toBeNull();
  });

  it("accepts a single-character subdomain", () => {
    expect(normalizeShopDomain("a.myshopify.com")).toBe("a.myshopify.com");
  });
});

describe("requestPairing", () => {
  it("rejects an invalid target domain", async () => {
    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: "not a valid shop!",
    });
    expect(result).toEqual({
      ok: false,
      error: "Enter a valid store name or *.myshopify.com domain.",
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
      authTokenHash: null,
      authTokenExpiresAt: null,
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
      authTokenHash: null,
      authTokenExpiresAt: null,
    });
  });
});

describe("regeneratePairingRequest", () => {
  it("errors when the request doesn't exist", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue(undefined);

    const result = await regeneratePairingRequest({
      targetId: "missing",
      shop: SOURCE_SHOP,
    });

    expect(result).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("errors when the caller isn't the source store", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      store: { shop: TARGET_SHOP },
      group: { source: { shop: "someone-else.myshopify.com" } },
    });

    const result = await regeneratePairingRequest({
      targetId: "target-1",
      shop: SOURCE_SHOP,
    });

    expect(result).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("errors when the request was already responded to", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "APPROVED",
      store: { shop: TARGET_SHOP },
      group: { source: { shop: SOURCE_SHOP } },
    });

    const result = await regeneratePairingRequest({
      targetId: "target-1",
      shop: SOURCE_SHOP,
    });

    expect(result).toEqual({
      ok: false,
      error: "This request was already responded to.",
    });
  });

  it("issues a fresh token for a pending request from the source store", async () => {
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      store: { shop: TARGET_SHOP },
      group: { source: { shop: SOURCE_SHOP } },
    });
    const updateChain = chain([{ id: "target-1" }]);
    dbMock.update.mockReturnValueOnce(updateChain);

    const result = await regeneratePairingRequest({
      targetId: "target-1",
      shop: SOURCE_SHOP,
    });

    expect(result).toEqual({
      ok: true,
      authToken: expect.any(String),
      targetShop: TARGET_SHOP,
    });
    expect(dbMock.update).toHaveBeenCalledWith(syncGroupTargets);
    expect(updateChain.set).toHaveBeenCalledWith({
      authTokenHash: expect.any(String),
      authTokenExpiresAt: expect.any(Date),
    });
    expect(updateChain.where).toHaveBeenCalledWith(
      and(
        eq(syncGroupTargets.id, "target-1"),
        eq(syncGroupTargets.status, "PENDING"),
      ),
    );
  });

  it("errors instead of reintroducing a token when the request was responded to between the read and the write", async () => {
    // The read sees PENDING, but the guarded update matches nothing —
    // e.g. a concurrent approve/decline landed in between. Regressing
    // this to an unguarded `.where(eq(id, targetId))` would silently
    // reintroduce a token on a request that's no longer PENDING instead
    // of erroring here.
    dbMock.query.syncGroupTargets.findFirst.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      store: { shop: TARGET_SHOP },
      group: { source: { shop: SOURCE_SHOP } },
    });
    dbMock.update.mockReturnValueOnce(chain([]));

    const result = await regeneratePairingRequest({
      targetId: "target-1",
      shop: SOURCE_SHOP,
    });

    expect(result).toEqual({
      ok: false,
      error: "This request was already responded to.",
    });
  });
});
