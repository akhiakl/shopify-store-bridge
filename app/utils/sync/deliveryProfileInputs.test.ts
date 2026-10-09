import { describe, expect, it } from "vitest";

import { replaceGroupsInput, zoneInput } from "./deliveryProfileInputs";

const zone = {
  name: "Domestic",
  countries: [{ code: "CA", includeAllProvinces: true }],
  methods: [
    {
      name: "Standard",
      description: null,
      active: true,
      price: { amount: "5.0", currencyCode: "CAD" },
      priceConditions: [
        {
          operator: "GREATER_THAN_OR_EQUAL_TO",
          criteria: { amount: "0.0", currencyCode: "CAD" },
        },
      ],
      weightConditions: [],
    },
  ],
};

describe("zoneInput", () => {
  it("creates the zone with each rate and its conditions", () => {
    expect(zoneInput(zone)).toEqual({
      name: "Domestic",
      countries: [{ code: "CA", includeAllProvinces: true }],
      methodDefinitionsToCreate: [
        {
          name: "Standard",
          description: null,
          active: true,
          rateDefinition: { price: { amount: "5.0", currencyCode: "CAD" } },
          priceConditionsToCreate: zone.methods[0].priceConditions,
          weightConditionsToCreate: [],
        },
      ],
    });
  });
});

describe("replaceGroupsInput", () => {
  const target = [
    { id: "g1", locations: ["Warehouse", "Store"], zoneIds: ["z1", "z2"] },
    { id: "g2", locations: ["Pop-up"], zoneIds: ["z3"] },
  ];

  it("deletes every target zone, refills the group with the same locations, and creates the rest", () => {
    const input = replaceGroupsInput(
      target,
      [
        {
          locations: ["Store", "Warehouse"],
          locationIds: ["L1", "L2"],
          zones: [zone],
        },
        { locations: ["Outlet"], locationIds: ["L9"], zones: [zone] },
      ],
      { isDefault: false },
    );

    expect(input.zonesToDelete).toEqual(["z1", "z2", "z3"]);
    expect(input.locationGroupsToUpdate).toEqual([
      { id: "g1", zonesToCreate: [zoneInput(zone)] },
    ]);
    expect(input.locationGroupsToCreate).toEqual([
      { locations: ["L9"], zonesToCreate: [zoneInput(zone)] },
    ]);
    // A custom profile drops groups the source doesn't have.
    expect(input.locationGroupsToDelete).toEqual(["g2"]);
  });

  it("keeps the default profile's groups, only clearing their zones", () => {
    const input = replaceGroupsInput(target, [], { isDefault: true });

    expect(input).toEqual({
      zonesToDelete: ["z1", "z2", "z3"],
      locationGroupsToUpdate: [],
      locationGroupsToCreate: [],
    });
  });
});
