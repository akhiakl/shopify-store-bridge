import { beforeEach, describe, expect, it, vi } from "vitest";

const { webhookMock, dbMock, inserted } = vi.hoisted(() => {
  const inserted = { values: vi.fn(), onConflictDoNothing: vi.fn() };
  return {
    inserted,
    webhookMock: vi.fn(),
    dbMock: {
      insert: vi.fn(() => ({
        values: (row: unknown) => {
          inserted.values(row);
          return {
            onConflictDoNothing: () => {
              inserted.onConflictDoNothing();
              return Promise.resolve();
            },
          };
        },
      })),
    },
  };
});
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { action } = await import("./webhooks.customers.data_request");
const { customerDataRequests } = await import("~/db/complianceSchema.server");

function call() {
  return action({
    request: new Request("https://example.com/webhooks/customers/data_request"),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.customers.data_request action", () => {
  it("records the request by customer ID, never storing the email, and ignores redeliveries", async () => {
    webhookMock.mockResolvedValue({
      topic: "CUSTOMERS_DATA_REQUEST",
      shop: "shop.myshopify.com",
      payload: {
        customer: { id: 191167, email: "john@example.com" },
        data_request: { id: 9999 },
      },
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect(dbMock.insert).toHaveBeenCalledWith(customerDataRequests);
    expect(inserted.values).toHaveBeenCalledWith({
      shop: "shop.myshopify.com",
      customerId: "191167",
      dataRequestId: "9999",
    });
    expect(inserted.onConflictDoNothing).toHaveBeenCalled();
  });

  it("acknowledges without recording when the payload is incomplete", async () => {
    webhookMock.mockResolvedValue({
      topic: "CUSTOMERS_DATA_REQUEST",
      shop: "shop.myshopify.com",
      payload: { customer: { id: 1 } },
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
