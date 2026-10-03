import { describe, expect, it, vi } from "vitest";

import { getLocations } from "./locations.server";

const address = {
  address1: "1 Main St",
  address2: null,
  city: "Ottawa",
  provinceCode: "ON",
  countryCode: "CA",
  zip: "K1A 0A1",
  phone: null,
};

function admin(data: unknown) {
  return {
    graphql: vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ data }) }),
    ),
  };
}

describe("getLocations", () => {
  it("lists the store's own locations, leaving out fulfillment services'", async () => {
    const source = admin({
      locations: {
        nodes: [
          {
            name: "Warehouse",
            isFulfillmentService: false,
            fulfillsOnlineOrders: true,
            address,
          },
          {
            name: "3PL",
            isFulfillmentService: true,
            fulfillsOnlineOrders: true,
            address,
          },
        ],
      },
    });

    expect(await getLocations(source as never)).toEqual([
      { name: "Warehouse", fulfillsOnlineOrders: true, address },
    ]);
  });

  it("returns none when the response has no data", async () => {
    expect(await getLocations(admin(undefined) as never)).toEqual([]);
  });
});
