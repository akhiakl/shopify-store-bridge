import { describe, expect, it, vi } from "vitest";

import {
  getDeliveryProfiles,
  planDeliveryProfile,
} from "./deliveryProfiles.server";

function admin(data: unknown, errors?: { message: string }[]) {
  return {
    graphql: vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ data, errors }) }),
    ),
  };
}

const flat = {
  name: "Standard",
  description: "3-5 days",
  active: true,
  rateProvider: {
    __typename: "DeliveryRateDefinition",
    price: { amount: "5.0", currencyCode: "CAD" },
  },
  methodConditions: [
    {
      field: "TOTAL_PRICE",
      operator: "LESS_THAN_OR_EQUAL_TO",
      conditionCriteria: {
        __typename: "MoneyV2",
        amount: "50.0",
        currencyCode: "CAD",
      },
    },
    {
      field: "TOTAL_WEIGHT",
      operator: "GREATER_THAN_OR_EQUAL_TO",
      conditionCriteria: { __typename: "Weight", unit: "KILOGRAMS", value: 1 },
    },
  ],
};

const carrier = {
  name: "UPS Ground",
  description: null,
  active: true,
  rateProvider: { __typename: "DeliveryParticipant" },
  methodConditions: [],
};

function profile(overrides: Record<string, unknown> = {}) {
  return {
    deliveryProfile: {
      name: "Oversized",
      default: false,
      profileItems: {
        nodes: [{ product: { handle: "sofa" } }],
        pageInfo: { hasNextPage: true },
      },
      profileLocationGroups: [
        {
          locationGroup: { locations: { nodes: [{ name: "Warehouse" }] } },
          locationGroupZones: {
            nodes: [
              {
                zone: {
                  name: "Canada",
                  countries: [
                    {
                      code: { countryCode: "CA", restOfWorld: false },
                      provinces: [{ code: "ON" }],
                    },
                    {
                      code: { countryCode: "PM", restOfWorld: false },
                      provinces: [],
                    },
                    {
                      code: { countryCode: null, restOfWorld: true },
                      provinces: [],
                    },
                  ],
                },
                methodDefinitions: { nodes: [flat, carrier] },
              },
            ],
          },
        },
      ],
      ...overrides,
    },
  };
}

describe("getDeliveryProfiles", () => {
  it("lists merchant-owned profiles, or none without data", async () => {
    const nodes = [{ id: "gid://shopify/DeliveryProfile/1", name: "General" }];
    expect(
      await getDeliveryProfiles(
        admin({ deliveryProfiles: { nodes } }) as never,
      ),
    ).toEqual(nodes);
    expect(await getDeliveryProfiles(admin({}) as never)).toEqual([]);
  });
});

describe("planDeliveryProfile", () => {
  it("plans locations and products by name and handle, keeping flat rates and skipping carrier ones", async () => {
    const source = admin(profile());

    expect(await planDeliveryProfile(source as never, "gid://P/1")).toEqual({
      name: "Oversized",
      isDefault: false,
      products: ["sofa"],
      locationGroups: [
        {
          locations: ["Warehouse"],
          zones: [
            {
              name: "Canada",
              countries: [
                { code: "CA", provinces: [{ code: "ON" }] },
                { code: "PM", includeAllProvinces: true },
                { restOfWorld: true },
              ],
              methods: [
                {
                  name: "Standard",
                  description: "3-5 days",
                  active: true,
                  price: { amount: "5.0", currencyCode: "CAD" },
                  priceConditions: [
                    {
                      operator: "LESS_THAN_OR_EQUAL_TO",
                      criteria: { amount: "50.0", currencyCode: "CAD" },
                    },
                  ],
                  weightConditions: [
                    {
                      operator: "GREATER_THAN_OR_EQUAL_TO",
                      criteria: { unit: "KILOGRAMS", value: 1 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      skipped: [
        {
          item: "Products",
          reason: "Only the first 250 products in this profile sync.",
        },
        {
          item: "Canada > UPS Ground",
          reason:
            "It's a carrier-calculated rate. Set up the carrier on this store, then add the rate there.",
        },
      ],
    });
    expect(source.graphql).toHaveBeenCalledWith(expect.any(String), {
      variables: { id: "gid://P/1" },
    });
  });

  it("plans no products for the default profile", async () => {
    const plan = await planDeliveryProfile(
      admin(profile({ default: true })) as never,
      "gid://P/1",
    );
    expect(plan?.isDefault).toBe(true);
    expect(plan?.products).toEqual([]);
  });

  it("returns null for a profile gone from the source, and throws on a GraphQL error", async () => {
    expect(
      await planDeliveryProfile(admin({ deliveryProfile: null }) as never, "x"),
    ).toBeNull();
    await expect(
      planDeliveryProfile(
        admin(null, [{ message: "Access denied" }]) as never,
        "x",
      ),
    ).rejects.toThrow("Access denied");
  });
});
