import { describe, expect, it, vi } from "vitest";

import {
  canStyleCheckout,
  readCheckoutStyling,
} from "./checkoutStyling.server";

function admin(data: unknown, errors?: { message: string }[]) {
  return {
    graphql: vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ data, errors }) }),
    ),
  };
}

/** Lists `nodes`, then answers the branding read for the published one. */
function configured(
  nodes: { id: string; isPublished: boolean }[],
  branding: unknown,
) {
  return {
    graphql: vi.fn((query: string) =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            data: query.includes("CheckoutConfigurations")
              ? { checkoutAndAccountsConfigurations: { nodes } }
              : { checkoutAndAccountsConfiguration: { branding } },
          }),
      }),
    ),
  };
}

describe("canStyleCheckout", () => {
  it("allows Plus and development stores only", async () => {
    const plan = (shopifyPlus: boolean, partnerDevelopment: boolean) =>
      admin({ shop: { plan: { shopifyPlus, partnerDevelopment } } });

    expect(await canStyleCheckout(plan(true, false) as never)).toBe(true);
    expect(await canStyleCheckout(plan(false, true) as never)).toBe(true);
    expect(await canStyleCheckout(plan(false, false) as never)).toBe(false);
    expect(await canStyleCheckout(admin({}) as never)).toBe(false);
  });

  it("throws on a top-level error", async () => {
    await expect(
      canStyleCheckout(admin(null, [{ message: "Access denied" }]) as never),
    ).rejects.toThrow("Access denied");
  });
});

describe("readCheckoutStyling", () => {
  it("reads the published configuration with a summary", async () => {
    const branding = {
      designTokens: {
        colors: { palette: { color1: "#111111", color2: null } },
        typography: {
          primary: {
            __typename:
              "CheckoutAndAccountsConfigurationBrandingShopifyFontGroup",
            name: "Assistant",
            loadingStrategy: null,
            base: { weight: 400, sources: null },
            bold: null,
          },
          secondary: null,
          size: { base: 14, ratio: null },
        },
      },
    };
    const source = configured(
      [
        { id: "gid://C/1", isPublished: false },
        { id: "gid://C/2", isPublished: true },
      ],
      branding,
    );
    const result = await readCheckoutStyling(source as never);

    expect(source.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("checkoutAndAccountsConfiguration(id: $id)"),
      { variables: { id: "gid://C/2" } },
    );
    expect(result?.configurationId).toBe("gid://C/2");
    expect(result?.summary).toEqual({
      colors: ["#111111"],
      fonts: [{ role: "Primary", name: "Assistant" }],
      baseSize: 14,
    });
    expect(result?.styling.branding).toMatchObject({
      designTokens: { colors: { palette: { color1: "#111111" } } },
    });
  });

  it("summarizes unset branding as empty", async () => {
    const result = await readCheckoutStyling(
      configured([{ id: "gid://C/1", isPublished: true }], null) as never,
    );
    expect(result?.summary).toEqual({ colors: [], fonts: [], baseSize: null });
  });

  it("returns null with nothing published and throws on errors", async () => {
    expect(
      await readCheckoutStyling(
        admin({ checkoutAndAccountsConfigurations: { nodes: [] } }) as never,
      ),
    ).toBeNull();
    expect(await readCheckoutStyling(admin({}) as never)).toBeNull();
    await expect(
      readCheckoutStyling(admin(null, [{ message: "Nope" }]) as never),
    ).rejects.toThrow("Nope");
  });
});
