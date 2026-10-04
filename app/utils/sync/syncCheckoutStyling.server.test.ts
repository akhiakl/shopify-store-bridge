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

const styling = {
  branding: { components: { favicon: { mediaImageId: "logo.png" } } },
  files: [
    {
      path: ["components", "favicon", "mediaImageId"],
      kind: "IMAGE" as const,
      url: "https://cdn.test/logo.png",
    },
  ],
};
const targetAdmin = { graphql: vi.fn() };

describe("syncCheckoutStyling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canStyleCheckout.mockResolvedValue(true);
    readCheckoutStyling.mockResolvedValue({ configurationId: "gid://C/9" });
    ensureTargetFile.mockResolvedValue("gid://M/5");
    createOne.mockResolvedValue({ ok: true });
  });

  it("copies files, then updates the published configuration", async () => {
    const cache = new Map();
    expect(
      await syncCheckoutStyling(targetAdmin as never, styling, cache),
    ).toEqual({ ok: true });

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
          branding: { components: { favicon: { mediaImageId: "gid://M/5" } } },
        },
      },
    );
  });

  it("fails on a store that isn't on Plus", async () => {
    canStyleCheckout.mockResolvedValue(false);
    const result = await syncCheckoutStyling(
      targetAdmin as never,
      styling,
      new Map(),
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("isn't on Shopify Plus"),
    });
    expect(createOne).not.toHaveBeenCalled();
  });

  it("fails without a published configuration", async () => {
    readCheckoutStyling.mockResolvedValue(null);
    expect(
      await syncCheckoutStyling(targetAdmin as never, styling, new Map()),
    ).toEqual({
      ok: false,
      error: "This store has no published checkout configuration.",
    });
  });

  it("reports a thrown error as a failure", async () => {
    ensureTargetFile.mockRejectedValue(new Error("Bad URL"));
    expect(
      await syncCheckoutStyling(targetAdmin as never, styling, new Map()),
    ).toEqual({ ok: false, error: "Bad URL" });

    canStyleCheckout.mockRejectedValue("boom");
    expect(
      await syncCheckoutStyling(targetAdmin as never, styling, new Map()),
    ).toEqual({ ok: false, error: "boom" });
  });
});
