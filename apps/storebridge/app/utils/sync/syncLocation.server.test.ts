import { describe, expect, it, vi } from "vitest";

import type { LocationRow } from "./locations.server";
import { syncLocation } from "./syncLocation.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

const location: LocationRow = {
  name: "Warehouse",
  fulfillsOnlineOrders: true,
  address: {
    address1: "1 Main St",
    address2: null,
    city: "Ottawa",
    provinceCode: "ON",
    countryCode: "CA",
    zip: "K1A 0A1",
    phone: null,
  },
};

const sentAddress = {
  address1: "1 Main St",
  city: "Ottawa",
  provinceCode: "ON",
  countryCode: "CA",
  zip: "K1A 0A1",
};

/** A target with `existing` locations; every write succeeds. */
function target(existing: unknown[]) {
  return {
    graphql: vi.fn((query: string) =>
      Promise.resolve(
        query.includes("TargetLocations")
          ? jsonResponse({ locations: { nodes: existing } })
          : jsonResponse({
              result: { location: { id: "gid://L/9" }, userErrors: [] },
            }),
      ),
    ),
  };
}

describe("syncLocation", () => {
  it("creates the location when no target location has its name", async () => {
    const admin = target([
      { id: "gid://L/1", name: "Store", isFulfillmentService: false },
    ]);

    expect(await syncLocation(admin as never, location)).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("locationAdd"),
      {
        variables: {
          input: {
            name: "Warehouse",
            fulfillsOnlineOrders: true,
            address: sentAddress,
          },
        },
      },
    );
  });

  it("edits the target location with the same name, leaving its name and active state alone", async () => {
    const admin = target([
      { id: "gid://L/1", name: "Warehouse", isFulfillmentService: false },
    ]);

    expect(await syncLocation(admin as never, location)).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("locationEdit"),
      {
        variables: {
          id: "gid://L/1",
          input: { fulfillsOnlineOrders: true, address: sentAddress },
        },
      },
    );
  });

  it("fails when the name belongs to a fulfillment service's location, or the lookup errors", async () => {
    const taken = target([
      { id: "gid://L/1", name: "Warehouse", isFulfillmentService: true },
    ]);
    expect(await syncLocation(taken as never, location)).toEqual({
      ok: false,
      error: "A fulfillment service's location on this store has this name.",
    });
    expect(taken.graphql).toHaveBeenCalledTimes(1);

    const denied = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse(null, [{ message: "Access denied for locations" }]),
        ),
      ),
    };
    expect(await syncLocation(denied as never, location)).toEqual({
      ok: false,
      error: "Access denied for locations",
    });
  });
});
