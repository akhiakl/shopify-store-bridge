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

const { getDashboardData, requestPairing, declinePairingRequest } = vi.hoisted(
  () => ({
    getDashboardData: vi.fn(),
    requestPairing: vi.fn(),
    declinePairingRequest: vi.fn(),
  }),
);
vi.mock("./pairing.server", () => ({
  getDashboardData,
  requestPairing,
  declinePairingRequest,
}));

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
      ownedGroups: [],
      incomingRequests: [],
      memberships: [],
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
      ownedGroups: [],
      incomingRequests: [],
      memberships: [],
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
        groupName: "EU stores",
      }),
      params: {},
      context: {},
    } as never);

    expect(requestPairing).toHaveBeenCalledWith({
      sourceShop: SHOP,
      targetDomain: "target.myshopify.com",
      groupId: undefined,
      groupName: "EU stores",
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
      error: "A store can't be paired with itself.",
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
      error: "A store can't be paired with itself.",
    });
  });

  it("calls declinePairingRequest on decline", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    declinePairingRequest.mockResolvedValue({ ok: true });

    await action({
      request: actionRequest({ intent: "decline", targetId: "target-1" }),
      params: {},
      context: {},
    } as never);

    expect(declinePairingRequest).toHaveBeenCalledWith({
      targetId: "target-1",
      shop: SHOP,
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
