import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessions } from "~/db/schema.server";

const { webhookMock, dbMock } = vi.hoisted(() => ({
  webhookMock: vi.fn(),
  dbMock: { update: vi.fn() },
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { action } = await import("./webhooks.app.scopes_update");

function chain() {
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  obj.set = vi.fn(() => obj);
  obj.where = vi.fn(() => Promise.resolve(undefined));
  return obj;
}

describe("webhooks.app.scopes_update action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the session's stored scope when a session exists", async () => {
    webhookMock.mockResolvedValue({
      topic: "APP_SCOPES_UPDATE",
      shop: "shop.myshopify.com",
      session: { id: "offline_shop.myshopify.com" },
      payload: { current: ["read_products", "write_products"] },
    });
    const updateChain = chain();
    dbMock.update.mockReturnValueOnce(updateChain);

    const response = await action({
      request: new Request("https://example.com/webhooks/app/scopes_update"),
    } as never);

    expect(response.status).toBe(200);
    expect(dbMock.update).toHaveBeenCalledWith(sessions);
    expect(updateChain.set).toHaveBeenCalledWith({
      scope: "read_products,write_products",
    });
  });

  it("skips the update when there's no session for the shop", async () => {
    webhookMock.mockResolvedValue({
      topic: "APP_SCOPES_UPDATE",
      shop: "shop.myshopify.com",
      session: undefined,
      payload: { current: ["read_products"] },
    });

    const response = await action({
      request: new Request("https://example.com/webhooks/app/scopes_update"),
    } as never);

    expect(response.status).toBe(200);
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});
