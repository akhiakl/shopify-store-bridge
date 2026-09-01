import { describe, expect, it, vi } from "vitest";

const { webhookMock } = vi.hoisted(() => ({ webhookMock: vi.fn() }));
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));

const { action } = await import("./webhooks.customers.redact");

describe("webhooks.customers.redact action", () => {
  it("acknowledges the request — StoreBridge holds no customer data to redact", async () => {
    webhookMock.mockResolvedValue({
      topic: "CUSTOMERS_REDACT",
      shop: "shop.myshopify.com",
    });

    const response = await action({
      request: new Request("https://example.com/webhooks/customers/redact"),
    } as never);

    expect(response.status).toBe(200);
  });
});
