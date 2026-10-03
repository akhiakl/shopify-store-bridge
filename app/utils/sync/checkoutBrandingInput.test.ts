import { describe, expect, it } from "vitest";

import {
  fileNameFromUrl,
  isStylingInSync,
  shopifyFontHandle,
  toCheckoutStyling,
  withFileIds,
} from "./checkoutBrandingInput";

const IMAGE = "CheckoutAndAccountsConfigurationBrandingImage";

describe("toCheckoutStyling", () => {
  it("keeps set values and drops nulls and empty branches", () => {
    const { branding, files } = toCheckoutStyling({
      designTokens: {
        colors: { palette: { color1: "#111111", color2: null } },
        cornerRadius: { base: null, large: null, small: null },
      },
      components: { header: { alignment: "CENTER", divided: false } },
    });

    expect(branding).toEqual({
      designTokens: { colors: { palette: { color1: "#111111" } } },
      components: { header: { alignment: "CENTER", divided: false } },
    });
    expect(files).toEqual([]);
  });

  it("turns images into a file slot named after the file", () => {
    const { branding, files } = toCheckoutStyling({
      components: {
        favicon: {
          __typename: IMAGE,
          image: { url: "https://cdn.shopify.com/s/files/logo%20a.png?v=1" },
        },
        header: { logo: { image: { __typename: IMAGE, image: null } } },
      },
    });

    expect(branding).toEqual({
      components: { favicon: { mediaImageId: "logo a.png" } },
    });
    expect(files).toEqual([
      {
        path: ["components", "favicon", "mediaImageId"],
        kind: "IMAGE",
        url: "https://cdn.shopify.com/s/files/logo%20a.png?v=1",
      },
    ]);
  });

  it("turns a Shopify font group into font handles", () => {
    const { branding } = toCheckoutStyling({
      designTokens: {
        typography: {
          primary: {
            __typename:
              "CheckoutAndAccountsConfigurationBrandingShopifyFontGroup",
            name: "Playfair Display",
            loadingStrategy: null,
            base: {
              weight: 400,
              sources:
                "url(https://fonts.shopifycdn.com/playfair_display/playfair_display_n4.abc.woff2?h1=x) format('woff2')",
            },
            bold: { weight: 700, sources: null },
          },
        },
      },
    });

    expect(branding).toEqual({
      designTokens: {
        typography: {
          primary: {
            shopifyFontGroup: {
              baseFontHandle: "playfair_display_n4",
              boldFontHandle: "playfair_display_n7",
            },
          },
        },
      },
    });
  });

  it("turns a custom font group into file slots", () => {
    const { branding, files } = toCheckoutStyling({
      designTokens: {
        typography: {
          secondary: {
            __typename:
              "CheckoutAndAccountsConfigurationBrandingCustomFontGroup",
            name: "Brand",
            loadingStrategy: "SWAP",
            base: {
              genericFileId: "gid://shopify/GenericFile/1",
              weight: 400,
              sources: "url('https://cdn.shopify.com/files/brand.woff2')",
            },
            bold: null,
          },
        },
      },
    });

    expect(branding).toEqual({
      designTokens: {
        typography: {
          secondary: {
            customFontGroup: {
              base: { genericFileId: "brand.woff2", weight: 400 },
              loadingStrategy: "SWAP",
            },
          },
        },
      },
    });
    expect(files).toEqual([
      {
        path: [
          "designTokens",
          "typography",
          "secondary",
          "customFontGroup",
          "base",
          "genericFileId",
        ],
        kind: "FONT",
        url: "https://cdn.shopify.com/files/brand.woff2",
      },
    ]);
  });

  it("skips a custom font face without a file URL and unknown union members", () => {
    expect(
      toCheckoutStyling({
        designTokens: {
          typography: {
            primary: {
              __typename:
                "CheckoutAndAccountsConfigurationBrandingCustomFontGroup",
              base: { weight: 400, sources: null },
              bold: null,
              loadingStrategy: null,
            },
            secondary: { __typename: "SomethingNew" },
          },
        },
      }),
    ).toEqual({ branding: {}, files: [] });
    expect(toCheckoutStyling(null)).toEqual({ branding: {}, files: [] });
  });
});

describe("shopifyFontHandle", () => {
  it("falls back to the name and weight without a CDN file name", () => {
    expect(shopifyFontHandle("Work Sans", { weight: 600 })).toBe(
      "work_sans_n6",
    );
    expect(shopifyFontHandle("Inter", {})).toBe("inter_n4");
  });
});

describe("fileNameFromUrl", () => {
  it("returns the decoded last path segment", () => {
    expect(fileNameFromUrl("https://x.test/a/b/c%20d.png?v=2")).toBe("c d.png");
  });
});

describe("isStylingInSync", () => {
  const source = { a: { b: "#fff", c: 2 } };

  it("is true when the target has every source value", () => {
    expect(isStylingInSync(source, { a: { b: "#fff", c: 2, d: 1 } })).toBe(
      true,
    );
  });

  it("is false on a different or missing value", () => {
    expect(isStylingInSync(source, { a: { b: "#000", c: 2 } })).toBe(false);
    expect(isStylingInSync(source, { a: null })).toBe(false);
    expect(isStylingInSync(source, {})).toBe(false);
  });
});

describe("withFileIds", () => {
  it("fills slots in a copy, leaving the original alone", () => {
    const branding = { components: { favicon: { mediaImageId: "a.png" } } };
    const result = withFileIds(branding, [
      { path: ["components", "favicon", "mediaImageId"], id: "gid://M/1" },
    ]);

    expect(result).toEqual({
      components: { favicon: { mediaImageId: "gid://M/1" } },
    });
    expect(branding.components.favicon.mediaImageId).toBe("a.png");
  });
});
