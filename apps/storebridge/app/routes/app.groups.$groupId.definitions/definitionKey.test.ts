import { describe, expect, it } from "vitest";

import {
  collectionKey,
  metafieldDefinitionKey,
  metaobjectDefinitionKey,
  metaobjectEntriesKey,
  metaobjectEntryKey,
  shopPolicyKey,
} from "./definitionKey";

describe("metaobjectDefinitionKey", () => {
  it("keys by type only", () => {
    expect(
      metaobjectDefinitionKey({
        id: "gid://1",
        type: "size_chart",
        name: "Size chart",
        fieldDefinitions: [],
        fieldCount: 0,
        entryCount: 0,
      }),
    ).toBe("metaobject:size_chart");
  });
});

describe("metafieldDefinitionKey", () => {
  it("keys by ownerType, namespace, and key", () => {
    expect(
      metafieldDefinitionKey({
        id: "gid://1",
        name: "Care instructions",
        namespace: "custom",
        key: "care",
        description: null,
        type: "single_line_text_field",
        ownerType: "PRODUCT",
      }),
    ).toBe("metafield:PRODUCT:custom:care");
  });
});

describe("shopPolicyKey", () => {
  it("keys by policy type", () => {
    expect(shopPolicyKey("REFUND_POLICY")).toBe("policy:REFUND_POLICY");
  });
});

describe("collectionKey", () => {
  it("keys by handle", () => {
    expect(collectionKey("summer-sale")).toBe("collection:summer-sale");
  });
});

describe("metaobject entry keys", () => {
  it("keys a type's entry selection separately from its definition", () => {
    expect(metaobjectEntriesKey("faq")).toBe("metaobjectEntries:faq");
  });

  it("keys one entry by type and handle", () => {
    expect(metaobjectEntryKey({ type: "faq", handle: "q1" })).toBe(
      "metaobjectEntry:faq:q1",
    );
  });
});
