import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A minimal stand-in for Drizzle's fluent query builders
 * (`db.insert(...).values(...).returning()`,
 * `db.update(...).set(...).where(...).returning()`): every chain method
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
      connections: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { inviteLimitReached } = vi.hoisted(() => ({
  inviteLimitReached: vi.fn(),
}));
vi.mock("./inviteRateLimit.server", () => ({
  INVITES_PER_HOUR: 20,
  inviteLimitReached,
}));

const {
  normalizeShopDomain,
  requestPairing,
  getPendingRequestByToken,
  approvePairingRequest,
  declinePairingRequest,
  regeneratePairingRequest,
} = await import("./pairing.server");
const { connections } = await import("~/db/schema.server");

const SOURCE_SHOP = "source-shop.myshopify.com";
const TARGET_SHOP = "target-shop.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
  inviteLimitReached.mockResolvedValue(false);
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

  it("rejects connecting a store to itself", async () => {
    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: SOURCE_SHOP,
    });
    expect(result).toEqual({
      ok: false,
      error: "A store can't be connected to itself.",
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

  /** Installed target; source and target Store rows upserted. */
  function installedStores() {
    dbMock.query.sessions.findFirst.mockResolvedValue({ id: "session-1" });
    dbMock.insert
      .mockReturnValueOnce(chain([{ id: "source-id", shop: SOURCE_SHOP }]))
      .mockReturnValueOnce(chain([{ id: "target-id", shop: TARGET_SHOP }]));
  }

  it("refuses a new invite once the source hit its hourly limit", async () => {
    // Only the source Store row is upserted before the limit check.
    dbMock.query.sessions.findFirst.mockResolvedValue({ id: "session-1" });
    dbMock.insert.mockReturnValueOnce(
      chain([{ id: "source-id", shop: SOURCE_SHOP }]),
    );
    inviteLimitReached.mockResolvedValue(true);

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
    });

    expect(inviteLimitReached).toHaveBeenCalledWith("source-id");
    expect(result).toEqual({
      ok: false,
      error:
        "You've sent 20 connection requests in the last hour. Try again later.",
    });
    expect(dbMock.query.connections.findFirst).not.toHaveBeenCalled();
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("creates a pending connection with a hashed token", async () => {
    installedStores();
    dbMock.query.connections.findFirst.mockResolvedValue(undefined);
    const connectionChain = chain(undefined);
    dbMock.insert.mockReturnValueOnce(connectionChain);

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: "target-shop",
    });

    expect(result).toEqual({
      ok: true,
      authToken: expect.any(String),
      targetShop: TARGET_SHOP,
    });
    expect(dbMock.insert).toHaveBeenNthCalledWith(3, connections);
    expect(connectionChain.values).toHaveBeenCalledWith({
      sourceStoreId: "source-id",
      targetStoreId: "target-id",
      authTokenHash: expect.any(String),
      authTokenExpiresAt: expect.any(Date),
    });
    // Only the hash is stored, never the raw token.
    const stored = connectionChain.values.mock.calls[0][0] as {
      authTokenHash: string;
    };
    expect(stored.authTokenHash).not.toBe(
      (result as { authToken: string }).authToken,
    );
  });

  it("refuses a second connection to an already-connected store", async () => {
    installedStores();
    dbMock.query.connections.findFirst.mockResolvedValue({
      id: "conn-1",
      status: "APPROVED",
    });

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
    });

    expect(result).toEqual({
      ok: false,
      error: `You're already connected to ${TARGET_SHOP}.`,
    });
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("points a still-pending request at Resend link", async () => {
    installedStores();
    dbMock.query.connections.findFirst.mockResolvedValue({
      id: "conn-1",
      status: "PENDING",
    });

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
    });

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/Resend link/);
  });

  it("reopens a declined connection with a fresh token", async () => {
    installedStores();
    dbMock.query.connections.findFirst.mockResolvedValue({
      id: "conn-1",
      status: "DECLINED",
    });
    const updateChain = chain(undefined);
    dbMock.update.mockReturnValueOnce(updateChain);

    const result = await requestPairing({
      sourceShop: SOURCE_SHOP,
      targetDomain: TARGET_SHOP,
    });

    expect(result).toMatchObject({ ok: true, targetShop: TARGET_SHOP });
    expect(dbMock.update).toHaveBeenCalledWith(connections);
    expect(updateChain.set).toHaveBeenCalledWith({
      authTokenHash: expect.any(String),
      authTokenExpiresAt: expect.any(Date),
      status: "PENDING",
      requestedAt: expect.any(Date),
      respondedAt: null,
    });
    expect(updateChain.where).toHaveBeenCalledWith(
      eq(connections.id, "conn-1"),
    );
  });
});

const futureExpiry = new Date(Date.now() + 60_000);

function pendingConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    status: "PENDING",
    authTokenExpiresAt: futureExpiry,
    source: { shop: SOURCE_SHOP },
    target: { shop: TARGET_SHOP },
    ...overrides,
  };
}

describe("getPendingRequestByToken", () => {
  it.each([
    ["no connection has the token", undefined],
    [
      "the token belongs to another shop",
      pendingConnection({ target: { shop: "other.myshopify.com" } }),
    ],
    ["it was already responded to", pendingConnection({ status: "APPROVED" })],
    [
      "the token expired",
      pendingConnection({ authTokenExpiresAt: new Date(0) }),
    ],
    ["it has no expiry", pendingConnection({ authTokenExpiresAt: null })],
  ])("returns null when %s", async (_case, row) => {
    dbMock.query.connections.findFirst.mockResolvedValue(row);

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBeNull();
  });

  it("returns the pending connection for a valid token", async () => {
    const connection = pendingConnection();
    dbMock.query.connections.findFirst.mockResolvedValue(connection);

    expect(await getPendingRequestByToken("tok", TARGET_SHOP)).toBe(connection);
  });
});

describe("approvePairingRequest", () => {
  it("errors when the token is invalid", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(undefined);

    expect(
      await approvePairingRequest({ token: "bad", shop: TARGET_SHOP }),
    ).toEqual({
      ok: false,
      error: "This pairing link is invalid, expired, or already used.",
    });
  });

  it("approves and clears the token on a valid one", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(pendingConnection());
    const updateChain = chain(undefined);
    dbMock.update.mockReturnValueOnce(updateChain);

    const result = await approvePairingRequest({
      token: "good",
      shop: TARGET_SHOP,
    });

    expect(result).toEqual({ ok: true });
    expect(dbMock.update).toHaveBeenCalledWith(connections);
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
    dbMock.query.connections.findFirst.mockResolvedValue(undefined);

    expect(
      await declinePairingRequest({
        connectionId: "missing",
        shop: TARGET_SHOP,
      }),
    ).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("won't let another shop decline it", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(pendingConnection());

    expect(
      await declinePairingRequest({
        connectionId: "conn-1",
        shop: SOURCE_SHOP,
      }),
    ).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("errors when it was already responded to", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(
      pendingConnection({ status: "APPROVED" }),
    );

    expect(
      await declinePairingRequest({
        connectionId: "conn-1",
        shop: TARGET_SHOP,
      }),
    ).toEqual({ ok: false, error: "This request was already responded to." });
  });

  it("declines and clears the token", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(pendingConnection());
    const updateChain = chain(undefined);
    dbMock.update.mockReturnValueOnce(updateChain);

    expect(
      await declinePairingRequest({
        connectionId: "conn-1",
        shop: TARGET_SHOP,
      }),
    ).toEqual({ ok: true });
    expect(updateChain.set).toHaveBeenCalledWith({
      status: "DECLINED",
      respondedAt: expect.any(Date),
      authTokenHash: null,
      authTokenExpiresAt: null,
    });
  });
});

describe("regeneratePairingRequest", () => {
  it("only lets the source resend", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(pendingConnection());

    expect(
      await regeneratePairingRequest({
        connectionId: "conn-1",
        shop: TARGET_SHOP,
      }),
    ).toEqual({ ok: false, error: "Pairing request not found." });
  });

  it("errors when it was already responded to", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(
      pendingConnection({ status: "DECLINED" }),
    );

    expect(
      await regeneratePairingRequest({
        connectionId: "conn-1",
        shop: SOURCE_SHOP,
      }),
    ).toEqual({ ok: false, error: "This request was already responded to." });
  });

  it("issues a fresh token, guarded on still being pending", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(pendingConnection());
    const updateChain = chain([{ id: "conn-1" }]);
    dbMock.update.mockReturnValueOnce(updateChain);

    const result = await regeneratePairingRequest({
      connectionId: "conn-1",
      shop: SOURCE_SHOP,
    });

    expect(result).toEqual({
      ok: true,
      authToken: expect.any(String),
      targetShop: TARGET_SHOP,
    });
    expect(updateChain.where).toHaveBeenCalledWith(
      and(eq(connections.id, "conn-1"), eq(connections.status, "PENDING")),
    );
  });

  it("reports a response that landed between the read and the write", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(pendingConnection());
    dbMock.update.mockReturnValueOnce(chain([]));

    expect(
      await regeneratePairingRequest({
        connectionId: "conn-1",
        shop: SOURCE_SHOP,
      }),
    ).toEqual({ ok: false, error: "This request was already responded to." });
  });
});
