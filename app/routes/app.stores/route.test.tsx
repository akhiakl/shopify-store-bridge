import { describe, expect, it, vi } from "vitest";

// The loader/action import shopify.server -> db.server (Drizzle/pg) and
// pairing.server, both server-only. Stub both so this test exercises just
// the route's own wiring (which pairing.server function each intent calls,
// with session.shop rather than form input as the identity), not Postgres.
const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getDashboardData } = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
}));
vi.mock("~/utils/dashboard.server", () => ({ getDashboardData }));

const { requestPairing, declinePairingRequest, regeneratePairingRequest } =
  vi.hoisted(() => ({
    requestPairing: vi.fn(),
    declinePairingRequest: vi.fn(),
    regeneratePairingRequest: vi.fn(),
  }));
vi.mock("./pairing.server", () => ({
  requestPairing,
  declinePairingRequest,
  regeneratePairingRequest,
}));

const { removeConnection } = vi.hoisted(() => ({
  removeConnection: vi.fn(),
}));
vi.mock("./removeConnection.server", () => ({ removeConnection }));

const { isProStore } = vi.hoisted(() => ({
  isProStore: vi.fn(() => Promise.resolve(false)),
}));
vi.mock("~/utils/billing/paidPlan.server", () => ({ isProStore }));

const { loader, action } = await import("./route");

const SHOP = "source-shop.myshopify.com";

function actionRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request("https://example.myshopify.com/app/stores", {
    method: "POST",
    body,
  });
}

describe("app.stores loader", () => {
  it("authenticates the admin request and returns the dashboard data", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getDashboardData.mockResolvedValue({
      outgoing: [],
      incomingRequests: [],
      incoming: [],
    });

    const request = new Request("https://example.myshopify.com/app/stores");
    const result = await loader({
      request,
      params: {},
      context: {},
    } as never);

    expect(authenticateAdmin).toHaveBeenCalledWith(request);
    expect(getDashboardData).toHaveBeenCalledWith(SHOP);
    expect(result).toEqual({
      outgoing: [],
      incomingRequests: [],
      incoming: [],
    });
  });
});

describe("app.stores action", () => {
  it("calls requestPairing with the authenticated shop as the source on connect, and builds an authorize link", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    requestPairing.mockResolvedValue({
      ok: true,
      authToken: "raw-token",
      targetShop: "target.myshopify.com",
    });

    const result = await action({
      request: actionRequest({
        intent: "connect",
        targetDomain: "target.myshopify.com",
      }),
      params: {},
      context: {},
    } as never);

    // A free store gets the free plan's connection limit.
    expect(requestPairing).toHaveBeenCalledWith({
      sourceShop: SHOP,
      targetDomain: "target.myshopify.com",
      staff: null,
      connectionLimit: 1,
    });
    if (
      typeof (result as { authorizeUrl?: unknown }).authorizeUrl !== "string"
    ) {
      throw new Error("expected a result with an authorizeUrl");
    }
    const url = new URL((result as { authorizeUrl: string }).authorizeUrl);
    expect(url.pathname).toBe("/app/stores/authorize");
    expect(url.searchParams.get("token")).toBe("raw-token");
    expect(url.searchParams.get("shop")).toBe("target.myshopify.com");
  });

  it("passes through a requestPairing failure without building a link", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    requestPairing.mockResolvedValue({
      ok: false,
      error: "A store can't be connected to itself.",
    });

    const result = await action({
      request: actionRequest({
        intent: "connect",
        targetDomain: SHOP,
      }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({
      ok: false,
      error: "A store can't be connected to itself.",
    });
  });

  it("lifts the connection limit for a Pro store", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    isProStore.mockResolvedValueOnce(true);
    requestPairing.mockResolvedValue({ ok: false, error: "x" });

    await action({
      request: actionRequest({ intent: "connect", targetDomain: "t" }),
      params: {},
      context: {},
    } as never);

    expect(requestPairing).toHaveBeenLastCalledWith(
      expect.objectContaining({ connectionLimit: undefined }),
    );
  });

  it("calls declinePairingRequest on decline", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    declinePairingRequest.mockResolvedValue({ ok: true });

    await action({
      request: actionRequest({ intent: "decline", connectionId: "conn-1" }),
      params: {},
      context: {},
    } as never);

    expect(declinePairingRequest).toHaveBeenCalledWith({
      connectionId: "conn-1",
      shop: SHOP,
      staff: null,
    });
  });

  it("calls removeConnection on remove, as the session's shop", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    removeConnection.mockResolvedValue({ ok: true });

    const result = await action({
      request: actionRequest({ intent: "remove", connectionId: "conn-1" }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ ok: true });
    expect(removeConnection).toHaveBeenCalledWith({
      connectionId: "conn-1",
      shop: SHOP,
    });
  });

  it("calls regeneratePairingRequest on regenerate, and builds an authorize link", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    regeneratePairingRequest.mockResolvedValue({
      ok: true,
      authToken: "new-raw-token",
      targetShop: "target.myshopify.com",
    });

    const result = await action({
      request: actionRequest({ intent: "regenerate", connectionId: "conn-1" }),
      params: {},
      context: {},
    } as never);

    expect(regeneratePairingRequest).toHaveBeenCalledWith({
      connectionId: "conn-1",
      shop: SHOP,
    });
    if (
      typeof (result as { authorizeUrl?: unknown }).authorizeUrl !== "string"
    ) {
      throw new Error("expected a result with an authorizeUrl");
    }
    const url = new URL((result as { authorizeUrl: string }).authorizeUrl);
    expect(url.searchParams.get("token")).toBe("new-raw-token");
  });

  it("passes through a regeneratePairingRequest failure without building a link", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    regeneratePairingRequest.mockResolvedValue({
      ok: false,
      error: "This request was already responded to.",
    });

    const result = await action({
      request: actionRequest({ intent: "regenerate", connectionId: "conn-1" }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({
      ok: false,
      error: "This request was already responded to.",
    });
  });

  it("returns an error for an unrecognized intent", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });

    const result = await action({
      request: actionRequest({ intent: "unknown" }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ ok: false, error: "Unknown action." });
  });
});
