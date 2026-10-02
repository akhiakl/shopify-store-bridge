import { describe, expect, it } from "vitest";

import {
  metafieldDefinitionKey,
  metaobjectDefinitionKey,
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
