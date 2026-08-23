import { describe, expect, it, vi } from "vitest";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getPendingRequestByToken, approvePairingRequest } = vi.hoisted(() => ({
  getPendingRequestByToken: vi.fn(),
  approvePairingRequest: vi.fn(),
}));
vi.mock("~/routes/app.stores/pairing.server", () => ({
  getPendingRequestByToken,
  approvePairingRequest,
}));

const { loader, action } = await import("./app.stores_.authorize");

const SHOP = "target-shop.myshopify.com";

function loaderRequest(token: string) {
  return new Request(
    `https://example.myshopify.com/app/stores/authorize?token=${token}`,
  );
}

describe("app.stores.authorize loader", () => {
  it("returns ok:false when the token doesn't resolve to a pending request", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPendingRequestByToken.mockResolvedValue(null);

    const result = await loader({
      request: loaderRequest("bad"),
      params: {},
      context: {},
    } as never);

    expect(getPendingRequestByToken).toHaveBeenCalledWith("bad", SHOP);
    expect(result).toEqual({ ok: false });
  });

  it("returns the source shop and group name for a valid token", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPendingRequestByToken.mockResolvedValue({
      group: { name: "EU stores", source: { shop: "source.myshopify.com" } },
    });

    const result = await loader({
      request: loaderRequest("good"),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({
      ok: true,
      token: "good",
      sourceShop: "source.myshopify.com",
      groupName: "EU stores",
    });
  });
});

describe("app.stores.authorize action", () => {
  it("calls approvePairingRequest with the token and authenticated shop", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    approvePairingRequest.mockResolvedValue({ ok: true });

    const body = new URLSearchParams({ token: "good" });
    const result = await action({
      request: new Request(
        "https://example.myshopify.com/app/stores/authorize",
        { method: "POST", body },
      ),
      params: {},
      context: {},
    } as never);

    expect(approvePairingRequest).toHaveBeenCalledWith({
      token: "good",
      shop: SHOP,
    });
    expect(result).toEqual({ ok: true });
  });
});
