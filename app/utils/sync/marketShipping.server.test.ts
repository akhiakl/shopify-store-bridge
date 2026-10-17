import { describe, expect, it, vi } from "vitest";

import { getMarketShipping, planMarketShipping } from "./marketShipping.server";

function admin(data: unknown, errors?: { message: string }[]) {
  return {
    graphql: vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ data, errors }) }),
    ),
  };
}

const money = (amount: string) => ({ amount, currencyCode: "CAD" });
const conditions = (locations: string[], collections: string[] | null) => ({
  originLocations: { nodes: locations.map((name) => ({ name })) },
  collections: collections && {
    nodes: collections.map((handle) => ({ handle })),
  },
});
const common = {
  currency: "CAD",
  description: null,
  isActive: true,
  freeDeliveryMinimumValue: null,
};

describe("getMarketShipping", () => {
  it("reads the feature flag and each market's shipping at a glance", async () => {
    const result = await getMarketShipping(
      admin({
        shop: { features: { marketDrivenShipping: true } },
        markets: {
          nodes: [
            {
              id: "gid://M/1",
              handle: "ca",
              name: "Canada",
              delivery: {
                shipping: {
                  isEnabled: true,
                  optionDefinitionsCount: { count: 2 },
                },
              },
            },
            {
              id: "gid://M/2",
              handle: "eu",
              name: "Europe",
              delivery: { shipping: null },
            },
          ],
        },
      }) as never,
    );
    expect(result).toEqual({
      marketDrivenShipping: true,
      markets: [
        {
          id: "gid://M/1",
          handle: "ca",
          name: "Canada",
          shipping: { isEnabled: true, optionCount: 2 },
        },
        { id: "gid://M/2", handle: "eu", name: "Europe", shipping: null },
      ],
    });
  });

  it("defaults to not market-driven, and throws on a GraphQL error", async () => {
    expect(await getMarketShipping(admin(undefined) as never)).toEqual({
      marketDrivenShipping: false,
      markets: [],
    });
    await expect(
      getMarketShipping(admin(null, [{ message: "Access denied" }]) as never),
    ).rejects.toThrow("Access denied");
  });
});

describe("planMarketShipping", () => {
  it("plans flat, value and weight options by shared keys, skipping carrier rates", async () => {
    const flatRate = { price: money("10.0"), transitTimeMinSeconds: null };
    const valueRate = { minValue: money("0.0"), price: money("5.0") };
    const plan = await planMarketShipping(
      admin({
        market: {
          handle: "ca",
          name: "Canada",
          delivery: {
            shipping: {
              isEnabled: true,
              optionDefinitions: {
                nodes: [
                  {
                    __typename: "DeliveryFlatRateOptionDefinition",
                    ...common,
                    name: "Standard",
                    rateGroups: {
                      nodes: [
                        {
                          conditions: conditions(["Warehouse"], ["sofas"]),
                          rate: flatRate,
                        },
                      ],
                    },
                  },
                  {
                    __typename: "DeliveryValueBasedOptionDefinition",
                    ...common,
                    name: "By value",
                    rateGroups: {
                      nodes: [
                        {
                          conditions: conditions([], null),
                          rates: { nodes: [valueRate] },
                        },
                      ],
                    },
                  },
                  {
                    __typename: "DeliveryWeightBasedOptionDefinition",
                    ...common,
                    name: "By weight",
                    rateGroups: null,
                  },
                  {
                    __typename: "DeliveryCarrierCalculatedOptionDefinition",
                    ...common,
                  },
                  {
                    __typename: "DeliveryCarrierCalculatedOptionDefinition",
                    ...common,
                    description: "UPS",
                  },
                ],
              },
            },
          },
        },
      }) as never,
      "gid://M/1",
    );

    const base = { description: null, isActive: true, currency: "CAD" };
    expect(plan).toEqual({
      handle: "ca",
      name: "Canada",
      isEnabled: true,
      options: [
        {
          ...base,
          type: "flatRate",
          name: "Standard",
          freeDeliveryMinimumValue: null,
          rateGroups: [
            {
              locations: ["Warehouse"],
              collections: ["sofas"],
              rates: [flatRate],
            },
          ],
        },
        {
          ...base,
          type: "valueBased",
          name: "By value",
          freeDeliveryMinimumValue: null,
          rateGroups: [{ locations: [], collections: [], rates: [valueRate] }],
        },
        {
          ...base,
          type: "weightBased",
          name: "By weight",
          freeDeliveryMinimumValue: null,
          rateGroups: [],
        },
      ],
      skipped: [
        { item: "Carrier-calculated rate", reason: expect.any(String) },
        { item: "UPS", reason: expect.any(String) },
      ],
    });
  });

  it("returns null for a missing market or one without shipping, and throws on errors", async () => {
    expect(
      await planMarketShipping(admin({ market: null }) as never, "x"),
    ).toBe(null);
    expect(
      await planMarketShipping(
        admin({
          market: { handle: "eu", name: "EU", delivery: { shipping: null } },
        }) as never,
        "x",
      ),
    ).toBe(null);
    await expect(
      planMarketShipping(admin(null, [{ message: "Throttled" }]) as never, "x"),
    ).rejects.toThrow("Throttled");
  });
});
