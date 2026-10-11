import { beforeEach, describe, expect, it, vi } from "vitest";

const { canStyleCheckout, readCheckoutStyling, ensureTargetFile, createOne } =
  vi.hoisted(() => ({
    canStyleCheckout: vi.fn(),
    readCheckoutStyling: vi.fn(),
    ensureTargetFile: vi.fn(),
    createOne: vi.fn(),
  }));
vi.mock("./checkoutStyling.server", () => ({
  canStyleCheckout,
  readCheckoutStyling,
}));
vi.mock("./stylingFiles.server", () => ({ ensureTargetFile }));
vi.mock("./runMutation.server", () => ({ createOne }));

const { syncCheckoutStyling } = await import("./syncCheckoutStyling.server");

const FAVICON = "checkoutStyling:components.favicon";
const HEADER = "checkoutStyling:components.header";
const COLORS = "checkoutStyling:designTokens.colors";

const styling = {
  branding: {
    components: { favicon: { mediaImageId: "logo.png" } },
    designTokens: { colors: { palette: { color1: "#111111" } } },
  },
  files: [
    {
      path: ["components", "favicon", "mediaImageId"],
      kind: "IMAGE" as const,
      url: "https://cdn.test/logo.png",
    },
  ],
};
const targetAdmin = { graphql: vi.fn() };

function target(branding: unknown, overrides: unknown[] = []) {
  return {
    configurationId: "gid://C/9",
    styling: { branding, files: [] },
    overrides,
  };
}

describe("syncCheckoutStyling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canStyleCheckout.mockResolvedValue(true);
    readCheckoutStyling.mockResolvedValue(
      target({ components: { header: { alignment: "START" } } }),
    );
    ensureTargetFile.mockResolvedValue("gid://M/5");
    createOne.mockResolvedValue({ ok: true });
  });

  it("mirrors every area either store sets when none were picked", async () => {
    const cache = new Map();
    expect(
      await syncCheckoutStyling(targetAdmin as never, styling, cache),
    ).toEqual([
      { key: FAVICON, result: { ok: true } },
      { key: HEADER, result: { ok: true } },
      { key: COLORS, result: { ok: true } },
    ]);

    expect(ensureTargetFile).toHaveBeenCalledWith(
      targetAdmin,
      styling.files[0],
      cache,
    );
    expect(createOne).toHaveBeenCalledWith(
      targetAdmin,
      expect.stringContaining("checkoutAndAccountsConfigurationUpdate"),
      {
        id: "gid://C/9",
        configuration: {
          branding: {
            components: {
              favicon: { mediaImageId: "gid://M/5" },
              header: null,
            },
            designTokens: { colors: { palette: { color1: "#111111" } } },
          },
        },
      },
    );
  });

  it("sends only the picked areas, and only their files", async () => {
    expect(
      await syncCheckoutStyling(
        targetAdmin as never,
        { ...styling, areas: ["designTokens.colors"] },
        new Map(),
      ),
    ).toEqual([{ key: COLORS, result: { ok: true } }]);
    expect(ensureTargetFile).not.toHaveBeenCalled();
    expect(createOne.mock.calls[0][2].configuration).toEqual({
      branding: {
        designTokens: { colors: { palette: { color1: "#111111" } } },
      },
    });
  });

  it("updates same-named overrides and reports missing ones", async () => {
    readCheckoutStyling.mockResolvedValue(
      target({}, [
        {
          id: "gid://O/2",
          name: "Europe",
          styling: { branding: { components: { main: { x: 1 } } } },
        },
      ]),
    );
    const override = (name: string) => ({
      name,
      styling: {
        branding: { components: { header: { alignment: "END" } } },
        files: [],
      },
    });
    const results = await syncCheckoutStyling(
      targetAdmin as never,
      {
        ...styling,
        areas: [],
        overrides: [override("Europe"), override("US")],
      },
      new Map(),
    );

    expect(createOne.mock.calls[0][2].configuration).toEqual({
      overrides: [
        {
          id: "gid://O/2",
          branding: {
            components: { header: { alignment: "END" }, main: null },
          },
        },
      ],
    });
    expect(results).toEqual([
      { key: "checkoutStyling:override:Europe", result: { ok: true } },
      {
        key: "checkoutStyling:override:US",
        result: {
          ok: false,
          error: expect.stringContaining('no "US" market override'),
        },
      },
    ]);
  });

  it("skips the update when there's nothing to send", async () => {
    readCheckoutStyling.mockResolvedValue(target({}));
    expect(
      await syncCheckoutStyling(
        targetAdmin as never,
        { branding: {}, files: [] },
        new Map(),
      ),
    ).toEqual([
      { key: "checkoutStyling", result: { ok: true, skipped: true } },
    ]);

    const missingOnly = await syncCheckoutStyling(
      targetAdmin as never,
      {
        branding: {},
        files: [],
        areas: [],
        overrides: [{ name: "US", styling: { branding: {}, files: [] } }],
      },
      new Map(),
    );
    expect(missingOnly).toHaveLength(1);
    expect(missingOnly[0].result.ok).toBe(false);
    expect(createOne).not.toHaveBeenCalled();
  });

  it("fails every planned key on a store that isn't on Plus", async () => {
    canStyleCheckout.mockResolvedValue(false);
    const result = await syncCheckoutStyling(
      targetAdmin as never,
      {
        ...styling,
        areas: ["designTokens.colors"],
        overrides: [{ name: "EU", styling }],
      },
      new Map(),
    );
    expect(result.map((r) => r.key)).toEqual([
      COLORS,
      "checkoutStyling:override:EU",
    ]);
    expect(result[0].result).toEqual({
      ok: false,
      error: expect.stringContaining("isn't on Shopify Plus"),
    });
    expect(createOne).not.toHaveBeenCalled();
  });

  it("fails without a published configuration", async () => {
    readCheckoutStyling.mockResolvedValue(null);
    expect(
      await syncCheckoutStyling(targetAdmin as never, styling, new Map()),
    ).toEqual([
      {
        key: "checkoutStyling",
        result: {
          ok: false,
          error: "This store has no published checkout configuration.",
        },
      },
    ]);
  });

  it("reports a thrown error as a failure", async () => {
    ensureTargetFile.mockRejectedValue(new Error("Bad URL"));
    expect(
      await syncCheckoutStyling(targetAdmin as never, styling, new Map()),
    ).toEqual([
      { key: "checkoutStyling", result: { ok: false, error: "Bad URL" } },
    ]);

    canStyleCheckout.mockRejectedValue("boom");
    expect(
      (await syncCheckoutStyling(targetAdmin as never, styling, new Map()))[0]
        .result,
    ).toEqual({ ok: false, error: "boom" });
  });
});
