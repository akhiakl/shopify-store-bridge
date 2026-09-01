import { describe, expect, it, vi } from "vitest";

const { webhookMock } = vi.hoisted(() => ({ webhookMock: vi.fn() }));
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));

const { action } = await import("./webhooks.customers.data_request");

describe("webhooks.customers.data_request action", () => {
  it("acknowledges the request — StoreBridge holds no customer data to return", async () => {
    webhookMock.mockResolvedValue({
      topic: "CUSTOMERS_DATA_REQUEST",
      shop: "shop.myshopify.com",
    });

    const response = await action({
      request: new Request(
        "https://example.com/webhooks/customers/data_request",
      ),
    } as never);

    expect(response.status).toBe(200);
  });
});
