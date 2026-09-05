import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessions, stores } from "~/db/schema.server";

const { webhookMock, dbMock } = vi.hoisted(() => ({
  webhookMock: vi.fn(),
  dbMock: { delete: vi.fn(), transaction: vi.fn() },
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { action } = await import("./webhooks.shop.redact");

function chain() {
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  obj.where = vi.fn(() => Promise.resolve(undefined));
  return obj;
}

describe("webhooks.shop.redact action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the shop's session and store rows — Store cascades to everything else", async () => {
    webhookMock.mockResolvedValue({
      topic: "SHOP_REDACT",
      shop: "shop.myshopify.com",
    });
    dbMock.delete.mockReturnValueOnce(chain()).mockReturnValueOnce(chain());
    dbMock.transaction.mockImplementation(async (callback) => callback(dbMock));

    const response = await action({
      request: new Request("https://example.com/webhooks/shop/redact"),
    } as never);

    expect(response.status).toBe(200);
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(dbMock.delete).toHaveBeenCalledTimes(2);
    expect(dbMock.delete).toHaveBeenNthCalledWith(1, sessions);
    expect(dbMock.delete).toHaveBeenNthCalledWith(2, stores);
  });

  it("propagates webhook authentication errors without touching the database", async () => {
    const authError = new Response("Unauthorized", { status: 401 });
    webhookMock.mockRejectedValue(authError);

    await expect(
      action({
        request: new Request("https://example.com/webhooks/shop/redact"),
      } as never),
    ).rejects.toBe(authError);

    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});
