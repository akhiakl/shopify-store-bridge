import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessions } from "~/db/schema.server";

const { webhookMock, dbMock } = vi.hoisted(() => ({
  webhookMock: vi.fn(),
  dbMock: { delete: vi.fn() },
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { action } = await import("./webhooks.app.uninstalled");

function chain() {
  return { where: vi.fn(() => Promise.resolve(undefined)) };
}

describe("webhooks.app.uninstalled action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the shop's session when one exists", async () => {
    webhookMock.mockResolvedValue({
      topic: "APP_UNINSTALLED",
      shop: "shop.myshopify.com",
      session: { id: "offline_shop.myshopify.com" },
    });
    dbMock.delete.mockReturnValueOnce(chain());

    const response = await action({
      request: new Request("https://example.com/webhooks/app/uninstalled"),
    } as never);

    expect(response.status).toBe(200);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(dbMock.delete).toHaveBeenCalledWith(sessions);
  });

  it("skips the delete when the session was already removed", async () => {
    webhookMock.mockResolvedValue({
      topic: "APP_UNINSTALLED",
      shop: "shop.myshopify.com",
      session: undefined,
    });

    const response = await action({
      request: new Request("https://example.com/webhooks/app/uninstalled"),
    } as never);

    expect(response.status).toBe(200);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});
