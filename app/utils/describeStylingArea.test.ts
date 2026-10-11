import { describe, expect, it } from "vitest";

import { describeStylingArea } from "./describeStylingArea";

describe("describeStylingArea", () => {
  it.each([
    ["designTokens.colors", "Design tokens", "Colors"],
    ["components.headingLevel1", "All pages", "Heading level 1"],
    ["surfaces.checkout.components.orderSummary", "Checkout", "Order summary"],
    ["surfaces.customerAccounts.components.main", "Customer accounts", "Main"],
    ["surfaces.signIn.components.main", "Sign-in", "Main"],
    ["somethingNew", "Other", "Something new"],
  ])("names %s", (area, section, name) => {
    expect(describeStylingArea(area)).toEqual({ section, name });
  });

  it("names a setting within an area", () => {
    expect(
      describeStylingArea("components.header", "colors.base.background").name,
    ).toBe("Colors › Base › Background");
  });
});
