import { describe, expect, it, vi } from "vitest";

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
  it("deletes the shop's session and store rows — Store cascades to everything else", async () => {
    webhookMock.mockResolvedValue({
      topic: "SHOP_REDACT",
      shop: "shop.myshopify.com",
    });
    dbMock.delete.mockReturnValue(chain());
    dbMock.transaction.mockImplementation(async (callback) => callback(dbMock));

    const response = await action({
      request: new Request("https://example.com/webhooks/shop/redact"),
    } as never);

    expect(response.status).toBe(200);
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(dbMock.delete).toHaveBeenCalledTimes(2);
  });
});
