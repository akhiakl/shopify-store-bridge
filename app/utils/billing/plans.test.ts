import { describe, expect, it } from "vitest";

import { isFreeSelectionKey } from "./plans";

describe("isFreeSelectionKey", () => {
  it("allows metafields, metaobjects and collections", () => {
    for (const key of [
      "metafield:PRODUCT:custom:care",
      "metafieldValues:PRODUCT:custom:care",
      "metaobject:faq",
      "metaobjectEntries:faq",
      "collection:summer",
    ]) {
      expect(isFreeSelectionKey(key)).toBe(true);
    }
  });

  it("keeps everything else for Pro", () => {
    for (const key of [
      "policy:REFUND_POLICY",
      "menu:main-menu",
      "location:Main",
      "deliveryProfile:1",
      "checkoutStyling",
      "page:about",
      "blog:news",
    ]) {
      expect(isFreeSelectionKey(key)).toBe(false);
    }
  });
});
