import { describe, expect, it } from "vitest";

import { isAddressIncomplete } from "./isAddressIncomplete";

const empty = {
  address1: null,
  address2: null,
  city: null,
  provinceCode: null,
  countryCode: "CA",
  zip: null,
  phone: null,
};

describe("isAddressIncomplete", () => {
  it("flags an address with only a country", () => {
    expect(isAddressIncomplete(empty)).toBe(true);
  });

  it("flags a missing or blank city", () => {
    expect(isAddressIncomplete({ ...empty, address1: "1 Main St" })).toBe(true);
    expect(
      isAddressIncomplete({ ...empty, address1: "1 Main St", city: "  " }),
    ).toBe(true);
  });

  it("accepts a street and city even without a postal code", () => {
    expect(
      isAddressIncomplete({ ...empty, address1: "1 Main St", city: "Ottawa" }),
    ).toBe(false);
  });
});
