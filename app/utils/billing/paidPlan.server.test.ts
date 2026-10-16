import { afterEach, describe, expect, it, vi } from "vitest";

import { billingIsTest, isProStore } from "./paidPlan.server";

function admin(subscriptions: { name: string; status: string }[] | null) {
  return {
    graphql: vi.fn(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            data: subscriptions
              ? {
                  currentAppInstallation: {
                    activeSubscriptions: subscriptions,
                  },
                }
              : {},
          }),
      }),
    ),
  };
}

describe("isProStore", () => {
  it("is true with an active Pro subscription", async () => {
    expect(
      await isProStore(
        admin([{ name: "StoreBridge Pro", status: "ACTIVE" }]) as never,
      ),
    ).toBe(true);
  });

  it("is false without one, or with another plan or a pending one", async () => {
    expect(await isProStore(admin([]) as never)).toBe(false);
    expect(await isProStore(admin(null) as never)).toBe(false);
    expect(
      await isProStore(
        admin([
          { name: "Other", status: "ACTIVE" },
          { name: "StoreBridge Pro", status: "PENDING" },
        ]) as never,
      ),
    ).toBe(false);
  });

  it("treats a failed read as free", async () => {
    const failing = { graphql: vi.fn(() => Promise.reject(new Error("x"))) };
    expect(await isProStore(failing as never)).toBe(false);
  });
});

describe("billingIsTest", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("charges for real only in production, unless forced to test", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHOPIFY_BILLING_TEST", "");
    expect(billingIsTest()).toBe(false);
    vi.stubEnv("SHOPIFY_BILLING_TEST", "true");
    expect(billingIsTest()).toBe(true);
    vi.stubEnv("SHOPIFY_BILLING_TEST", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(billingIsTest()).toBe(true);
  });
});
