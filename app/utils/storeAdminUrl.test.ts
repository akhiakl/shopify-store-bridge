import { describe, expect, it } from "vitest";

import { storeAdminUrl } from "./storeAdminUrl";

describe("storeAdminUrl", () => {
  it("links to the store's admin, or the app inside it", () => {
    expect(storeAdminUrl("poc-liquid.myshopify.com")).toBe(
      "https://admin.shopify.com/store/poc-liquid",
    );
    expect(storeAdminUrl("poc-liquid.myshopify.com", "abc123")).toBe(
      "https://admin.shopify.com/store/poc-liquid/apps/abc123",
    );
    expect(
      storeAdminUrl("poc-liquid.myshopify.com", "abc123", "/app/connections/1"),
    ).toBe(
      "https://admin.shopify.com/store/poc-liquid/apps/abc123/app/connections/1",
    );
  });
});
