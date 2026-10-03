import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { webhookMock, dbMock, deleted } = vi.hoisted(() => {
  const deleted = { where: vi.fn() };
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
  };
  return {
    deleted,
    webhookMock: vi.fn(),
    dbMock: {
      select: vi.fn(() => chain),
      delete: vi.fn(() => ({
        where: (condition: unknown) => {
          deleted.where(condition);
          return Promise.resolve();
        },
      })),
    },
  };
});
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { action } = await import("./webhooks.customers.redact");
const { syncJobItems } = await import("~/db/syncJobsSchema.server");
const { customerDataRequests } = await import("~/db/complianceSchema.server");

function call() {
  return action({
    request: new Request("https://example.com/webhooks/customers/redact"),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.customers.redact action", () => {
  it("deletes the customer's job-history rows and data requests for this shop", async () => {
    webhookMock.mockResolvedValue({
      topic: "CUSTOMERS_REDACT",
      shop: "source.myshopify.com",
      payload: { customer: { id: 207119551 } },
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect(dbMock.delete).toHaveBeenNthCalledWith(1, syncJobItems);
    expect(dbMock.delete).toHaveBeenNthCalledWith(2, customerDataRequests);
    expect(deleted.where).toHaveBeenCalledTimes(2);
    // The LIKE pattern pins the exact source-customer GID at the key's end.
    const { sql, params } = new PgDialect().sqlToQuery(
      deleted.where.mock.calls[0][0],
    );
    expect(sql).toContain('"key" like');
    expect(params).toContain(
      "metafieldValue:CUSTOMER:%:gid://shopify/Customer/207119551",
    );
    // Its data requests go too, matched by shop and customer.
    const requests = new PgDialect().sqlToQuery(deleted.where.mock.calls[1][0]);
    expect(requests.params).toEqual(["source.myshopify.com", "207119551"]);
  });

  it("acknowledges without touching the database when the payload has no customer", async () => {
    webhookMock.mockResolvedValue({
      topic: "CUSTOMERS_REDACT",
      shop: "source.myshopify.com",
      payload: {},
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});
