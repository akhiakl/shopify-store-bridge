import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findFirst: vi.fn() },
    store: { upsert: vi.fn() },
    syncGroup: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    syncGroupTarget: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("~/db.server", () => ({ default: prismaMock }));

const {
  normalizeShopDomain,
  getDashboardData,
  requestPairing,
  getPendingRequestByToken,
  approvePairingRequest,
  declinePairingRequest,
} = await import("./pairing.server");

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
});

describe("requestPairing", () => {
  it("rejects an invalid target domain", async () => {
    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: "not-a-shop",
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
    prismaMock.session.findFirst.mockResolvedValue(null);

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
    prismaMock.session.findFirst.mockResolvedValue({ id: "session-1" });
    prismaMock.store.upsert
      .mockResolvedValueOnce({ id: "source-id", shop: SOURCE_SHOP })
      .mockResolvedValueOnce({ id: "target-id", shop: TARGET_SHOP });
    prismaMock.syncGroup.create.mockResolvedValue({
      id: "group-1",
      sourceId: "source-id",
      name: "My group",
    });
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue(null);
    prismaMock.syncGroupTarget.create.mockResolvedValue({ id: "target-row" });

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
      groupName: "My group",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.targetShop).toBe(TARGET_SHOP);
    expect(result.authToken).toEqual(expect.any(String));
    expect(prismaMock.syncGroup.create).toHaveBeenCalledWith({
      data: { sourceId: "source-id", name: "My group" },
    });
    expect(prismaMock.syncGroupTarget.create).toHaveBeenCalledWith({
      data: {
        groupId: "group-1",
        storeId: "target-id",
        authTokenHash: expect.any(String),
        authTokenExpiresAt: expect.any(Date),
      },
    });
  });

  it("errors when an explicit groupId isn't owned by the source", async () => {
    prismaMock.session.findFirst.mockResolvedValue({ id: "session-1" });
    prismaMock.store.upsert
      .mockResolvedValueOnce({ id: "source-id", shop: SOURCE_SHOP })
      .mockResolvedValueOnce({ id: "target-id", shop: TARGET_SHOP });
    prismaMock.syncGroup.findFirst.mockResolvedValue(null);

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
    prismaMock.session.findFirst.mockResolvedValue({ id: "session-1" });
    prismaMock.store.upsert
      .mockResolvedValueOnce({ id: "source-id", shop: SOURCE_SHOP })
      .mockResolvedValueOnce({ id: "target-id", shop: TARGET_SHOP });
    prismaMock.syncGroup.create.mockResolvedValue({ id: "group-1" });
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
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
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue(null);

    expect(await getPendingRequestByToken("nope", TARGET_SHOP)).toBeNull();
  });

  it("returns null when the token belongs to a different shop", async () => {
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      authTokenExpiresAt: futureExpiry,
      store: { shop: "someone-else.myshopify.com" },
    });

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBeNull();
  });

  it("returns null once the request was already responded to", async () => {
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
      id: "target-1",
      status: "APPROVED",
      authTokenExpiresAt: futureExpiry,
      store: { shop: TARGET_SHOP },
    });

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
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
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue(target);

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBe(target);
  });
});

describe("approvePairingRequest", () => {
  it("errors when the token is invalid", async () => {
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue(null);

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
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      authTokenExpiresAt: new Date(Date.now() + 60_000),
      store: { shop: TARGET_SHOP },
    });
    prismaMock.syncGroupTarget.update.mockResolvedValue({});

    const result = await approvePairingRequest({
      token: "good",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: true });
    expect(prismaMock.syncGroupTarget.update).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: {
        status: "APPROVED",
        respondedAt: expect.any(Date),
        authTokenHash: null,
        authTokenExpiresAt: null,
      },
    });
  });
});

describe("declinePairingRequest", () => {
  it("errors when the request doesn't exist", async () => {
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue(null);

    const result = await declinePairingRequest({
      targetId: "missing",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("errors when the caller isn't the target store", async () => {
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
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
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
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
    prismaMock.syncGroupTarget.findUnique.mockResolvedValue({
      id: "target-1",
      status: "PENDING",
      store: { shop: TARGET_SHOP },
    });
    prismaMock.syncGroupTarget.update.mockResolvedValue({});

    const result = await declinePairingRequest({
      targetId: "target-1",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: true });
    expect(prismaMock.syncGroupTarget.update).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: {
        status: "DECLINED",
        respondedAt: expect.any(Date),
        authTokenHash: null,
        authTokenExpiresAt: null,
      },
    });
  });
});

describe("getDashboardData", () => {
  it("returns owned groups, incoming requests, and memberships", async () => {
    prismaMock.store.upsert.mockResolvedValue({
      id: "store-1",
      shop: SOURCE_SHOP,
    });
    prismaMock.syncGroup.findMany.mockResolvedValue([{ id: "group-1" }]);
    prismaMock.syncGroupTarget.findMany
      .mockResolvedValueOnce([{ id: "incoming-1" }])
      .mockResolvedValueOnce([{ id: "membership-1" }]);

    const result = await getDashboardData(SOURCE_SHOP);

    expect(result).toEqual({
      ownedGroups: [{ id: "group-1" }],
      incomingRequests: [{ id: "incoming-1" }],
      memberships: [{ id: "membership-1" }],
    });
    expect(prismaMock.syncGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceId: "store-1" } }),
    );
  });
});
