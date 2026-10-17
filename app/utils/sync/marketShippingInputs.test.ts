import { describe, expect, it } from "vitest";

import type { PlannedOption } from "./marketShipping.server";
import { optionCreateInput, type Skip } from "./marketShippingInputs";

const ids = {
  locations: new Map([["Warehouse", "gid://T/L/1"]]),
  collections: new Map([["sofas", "gid://T/C/1"]]),
};

const rate = { price: { amount: "10.0", currencyCode: "CAD" } };

function option(overrides: Partial<PlannedOption>): PlannedOption {
  return {
    type: "flatRate",
    name: "Standard",
    description: null,
    isActive: true,
    currency: "CAD",
    freeDeliveryMinimumValue: null,
    rateGroups: [],
    ...overrides,
  };
}

describe("optionCreateInput", () => {
  it("points a flat rate's groups at the target's locations and collections", () => {
    const skips: Skip[] = [];
    const input = optionCreateInput(
      option({
        rateGroups: [
          {
            locations: ["Warehouse", "Closed"],
            collections: ["sofas"],
            rates: [rate],
          },
          { locations: [], collections: [], rates: [rate] },
        ],
      }),
      ids,
      skips,
    );
    expect(input).toEqual({
      flatRate: {
        name: "Standard",
        description: null,
        isActive: true,
        currency: "CAD",
        freeDeliveryMinimumValue: null,
        rateGroups: [
          {
            conditions: {
              originLocationsToAdd: ["gid://T/L/1"],
              collectionsToAdd: ["gid://T/C/1"],
            },
            rate,
          },
          { conditions: {}, rate },
        ],
      },
    });
    expect(skips.map((s) => s.item)).toEqual(["Standard > Location Closed"]);
  });

  it("passes tiered rates through, and keeps an option with no groups", () => {
    const skips: Skip[] = [];
    expect(
      optionCreateInput(
        option({
          type: "weightBased",
          rateGroups: [{ locations: [], collections: [], rates: [rate, rate] }],
        }),
        ids,
        skips,
      ),
    ).toMatchObject({
      weightBased: { rateGroups: [{ conditions: {}, rates: [rate, rate] }] },
    });
    expect(optionCreateInput(option({}), ids, skips)).toMatchObject({
      flatRate: { rateGroups: [] },
    });
    expect(skips).toEqual([]);
  });

  it("drops groups whose conditions match nothing, and the option if none remain", () => {
    const skips: Skip[] = [];
    const input = optionCreateInput(
      option({
        type: "valueBased",
        rateGroups: [
          { locations: ["Nowhere"], collections: [], rates: [rate] },
          { locations: [], collections: ["gone"], rates: [rate] },
        ],
      }),
      ids,
      skips,
    );
    expect(input).toBeNull();
    expect(skips.map((s) => s.item)).toEqual([
      "Standard > Location Nowhere",
      "Standard > Collection gone",
      "Standard",
    ]);
  });
});
