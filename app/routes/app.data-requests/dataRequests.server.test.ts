import { describe, expect, it, vi } from "vitest";

const { dbMock, results } = vi.hoisted(() => {
  const results: unknown[][] = [];
  // Every query chain resolves to the next queued result.
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(results.shift() ?? []),
  };
  return { results, dbMock: { select: vi.fn(() => chain) } };
});
vi.mock("~/db.server", () => ({ default: dbMock }));

const { getDataRequests } = await import("./dataRequests.server");

describe("getDataRequests", () => {
  it("lists the shop's requests with the rows held on each customer", async () => {
    const receivedAt = new Date("2026-10-03T00:00:00Z");
    const syncedAt = new Date("2026-10-01T00:00:00Z");
    results.push(
      [
        { id: "r1", customerId: "7", receivedAt },
        { id: "r2", customerId: "8", receivedAt },
      ],
      [
        {
          key: "metafieldValue:CUSTOMER:custom:tier:gid://shopify/Customer/7",
          status: "SUCCEEDED",
          errorMessage: null,
          syncedAt,
          targetShop: "eu.myshopify.com",
        },
      ],
      [],
    );

    expect(await getDataRequests("source.myshopify.com")).toEqual([
      {
        id: "r1",
        customerId: "7",
        receivedAt,
        rows: [
          {
            metafield: "custom.tier",
            status: "SUCCEEDED",
            errorMessage: null,
            syncedAt,
            targetShop: "eu.myshopify.com",
          },
        ],
      },
      { id: "r2", customerId: "8", receivedAt, rows: [] },
    ]);
  });
});
