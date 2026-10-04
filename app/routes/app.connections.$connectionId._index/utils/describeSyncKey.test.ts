import { describe, expect, it } from "vitest";

import { describeSyncKey } from "./describeSyncKey";

describe("describeSyncKey", () => {
  it.each([
    ["metaobject:faq", "Metaobject definition", "faq"],
    ["checkoutStyling", "Checkout styling", "Checkout & accounts"],
    ["metaobjectEntries:faq", "Metaobject entries", "faq"],
    ["metaobjectEntry:faq:shipping", "Metaobject entry", "faq › shipping"],
    [
      "metafield:PRODUCT:custom:care",
      "Metafield definition",
      "Product · custom.care",
    ],
    [
      "metafieldValues:COLLECTION:custom:banner",
      "Metafield values",
      "Collection · custom.banner",
    ],
    [
      "metafieldValue:PRODUCT:custom:care:red-hat",
      "Metafield value",
      "Product · custom.care on red-hat",
    ],
    ["policy:PRIVACY_POLICY", "Shop policy", "Privacy policy"],
    ["collection:sale", "Collection", "sale"],
    ["collectionRules:sale", "Collection rules", "sale"],
    ["location:Shop location", "Location", "Shop location"],
    ["menu:main-menu", "Menu", "main-menu"],
    [
      "menuItem:main-menu:Shop > Shoes",
      "Menu item",
      "main-menu › Shop › Shoes",
    ],
  ])("describes %s", (key, type, name) => {
    expect(describeSyncKey(key)).toEqual({ type, name });
  });

  it("keeps a ':' that's part of a name", () => {
    expect(describeSyncKey("location:Depot: North").name).toBe("Depot: North");
  });

  it("falls back to the raw key for an unknown type", () => {
    expect(describeSyncKey("brand:logo")).toEqual({
      type: "Item",
      name: "brand:logo",
    });
  });
});
