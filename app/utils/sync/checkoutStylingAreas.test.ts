import { describe, expect, it } from "vitest";

import {
  allStylingAreas,
  compareStyling,
  isInAreas,
  mirrorBranding,
  stylingAreas,
} from "./checkoutStylingAreas";

const source = {
  designTokens: {
    colors: { palette: { color1: "#111111" } },
    typography: { size: { base: 14 } },
  },
  components: {
    header: { alignment: "CENTER" },
    favicon: { mediaImageId: "fav.png" },
  },
  surfaces: {
    checkout: {
      components: {
        orderSummary: { colors: { base: { background: "#fff" } } },
      },
    },
  },
};

describe("stylingAreas", () => {
  it("splits branding into token groups, components and surface components", () => {
    expect(stylingAreas(source)).toEqual([
      "designTokens.colors",
      "designTokens.typography",
      "components.header",
      "components.favicon",
      "surfaces.checkout.components.orderSummary",
    ]);
  });

  it("stops at a value set above an area's depth, and handles nothing", () => {
    expect(stylingAreas({ surfaces: { checkout: "x" }, other: 1 })).toEqual([
      "surfaces.checkout",
      "other",
    ]);
    expect(stylingAreas(null)).toEqual([]);
    expect(stylingAreas({})).toEqual([]);
  });

  it("merges both stores' areas in a stable order", () => {
    expect(
      allStylingAreas(
        { components: { main: { a: 1 } } },
        { components: { header: { a: 1 }, main: { a: 2 } } },
      ),
    ).toEqual(["components.header", "components.main"]);
  });
});

describe("mirrorBranding", () => {
  it("copies the source's areas and resets what only the target sets", () => {
    const target = {
      designTokens: {
        colors: { palette: { color1: "#222222", color2: "#333333" } },
      },
      components: { header: { alignment: "START", divided: true } },
    };
    expect(
      mirrorBranding({
        source,
        target,
        areas: ["designTokens.colors", "components.header"],
      }),
    ).toEqual({
      designTokens: {
        colors: { palette: { color1: "#111111", color2: null } },
      },
      components: { header: { alignment: "CENTER", divided: null } },
    });
  });

  it("resets an area the source doesn't set and skips one neither sets", () => {
    expect(
      mirrorBranding({
        source: {},
        target: { components: { main: { a: 1 } } },
        areas: ["components.main", "components.footer"],
      }),
    ).toEqual({ components: { main: null } });
  });

  it("doesn't reset the other kind of font group", () => {
    const font = (kind: string) => ({
      designTokens: {
        typography: { primary: { [kind]: { baseFontHandle: "a_n4" } } },
      },
    });
    expect(
      mirrorBranding({
        source: font("shopifyFontGroup"),
        target: font("customFontGroup"),
        areas: ["designTokens.typography"],
      }),
    ).toEqual(font("shopifyFontGroup"));
  });

  it("replaces a target value of a different shape outright", () => {
    expect(
      mirrorBranding({
        source: { components: { main: { a: { b: 1 } } } },
        target: { components: { main: { a: "x" } } },
        areas: ["components.main"],
      }),
    ).toEqual({ components: { main: { a: { b: 1 } } } });
  });
});

describe("isInAreas", () => {
  it("matches a file slot inside an area, not one sharing a prefix", () => {
    const path = ["components", "favicon", "mediaImageId"];
    expect(isInAreas(path, ["components.favicon"])).toBe(true);
    expect(isInAreas(path, ["components.fav"])).toBe(false);
    expect(isInAreas(["components", "favicon"], ["components.favicon"])).toBe(
      true,
    );
  });
});

describe("compareStyling", () => {
  it("lists each setting of each area beside the target's", () => {
    const diffs = compareStyling(source, {
      designTokens: { colors: { palette: { color1: "#111111" } } },
      components: { header: { alignment: "START" }, main: { flag: true } },
    });

    expect(diffs.map((d) => [d.area, d.inSync])).toEqual([
      ["components.favicon", false],
      ["components.header", false],
      ["components.main", false],
      ["designTokens.colors", true],
      ["designTokens.typography", false],
      ["surfaces.checkout.components.orderSummary", false],
    ]);
    expect(diffs[1].rows).toEqual([
      { setting: "alignment", source: "CENTER", target: "START", same: false },
    ]);
    expect(diffs[2].rows).toEqual([
      { setting: "flag", source: null, target: true, same: false },
    ]);
  });

  it("shows an area set as a single value, and non-scalar values as JSON", () => {
    expect(
      compareStyling({ other: 1, components: { main: { a: [1] } } }, undefined),
    ).toEqual([
      {
        area: "components.main",
        rows: [{ setting: "a", source: "[1]", target: null, same: false }],
        inSync: false,
      },
      {
        area: "other",
        rows: [{ setting: "", source: 1, target: null, same: false }],
        inSync: false,
      },
    ]);
  });
});
