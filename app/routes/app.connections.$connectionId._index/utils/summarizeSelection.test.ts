import { describe, expect, it } from "vitest";

import { summarizeSelection } from "./summarizeSelection";

describe("summarizeSelection", () => {
  it("lists each type once", () => {
    expect(
      summarizeSelection(["menu:main", "menu:footer", "policy:REFUND_POLICY"]),
    ).toBe("Menus, Shop policies");
  });

  it("collapses more than two types", () => {
    expect(
      summarizeSelection([
        "metafield:PRODUCT:custom:care",
        "collection:sale",
        "location:Depot",
      ]),
    ).toBe("Metafield definitions + 2 more");
  });

  it("labels an unknown prefix as Other", () => {
    expect(summarizeSelection(["brand:logo"])).toBe("Other");
  });
});
