import { describe, expect, it, vi } from "vitest";

import { usesMarketDrivenShipping } from "./shopFeatures.server";

function admin(data: unknown, errors?: { message: string }[]) {
  return {
    graphql: vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ data, errors }) }),
    ),
  };
}

describe("usesMarketDrivenShipping", () => {
  it("reads the shop feature flag, defaulting to false", async () => {
    const on = { shop: { features: { marketDrivenShipping: true } } };
    expect(await usesMarketDrivenShipping(admin(on) as never)).toBe(true);
    expect(await usesMarketDrivenShipping(admin(undefined) as never)).toBe(
      false,
    );
  });

  it("throws on a GraphQL error", async () => {
    await expect(
      usesMarketDrivenShipping(admin(null, [{ message: "Denied" }]) as never),
    ).rejects.toThrow("Denied");
  });
});
