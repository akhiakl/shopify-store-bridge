import { beforeEach, describe, expect, it, vi } from "vitest";

const { unauthenticatedAdmin, canStyleCheckout, readCheckoutStyling } =
  vi.hoisted(() => ({
    unauthenticatedAdmin: vi.fn(),
    canStyleCheckout: vi.fn(),
    readCheckoutStyling: vi.fn(),
  }));
vi.mock("~/shopify.server", () => ({
  unauthenticated: { admin: unauthenticatedAdmin },
}));
vi.mock("~/utils/sync/checkoutStyling.server", () => ({
  canStyleCheckout,
  readCheckoutStyling,
}));

const { getCheckoutOverview } = await import("./getCheckoutOverview.server");

const sourceAdmin = { name: "source" };
const targetAdmin = { name: "target" };
const SCOPES =
  "read_checkout_and_accounts_configurations,write_checkout_and_accounts_configurations";
const summary = { colors: ["#111111"], fonts: [], baseSize: null };

function connection(status = "APPROVED") {
  return {
    id: "conn-1",
    status,
    source: { shop: "a.myshopify.com" },
    target: { shop: "b.myshopify.com" },
  } as never;
}

function styling(color: string) {
  return {
    configurationId: "gid://C/1",
    summary,
    styling: {
      branding: { designTokens: { colors: { palette: { color1: color } } } },
      files: [],
    },
  };
}

describe("getCheckoutOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unauthenticatedAdmin.mockImplementation(async (shop: string) => ({
      admin: shop === "b.myshopify.com" ? targetAdmin : sourceAdmin,
      session: { scope: SCOPES },
    }));
    canStyleCheckout.mockResolvedValue(true);
    readCheckoutStyling.mockImplementation(async (admin) =>
      admin === sourceAdmin ? styling("#111111") : styling("#111111"),
    );
  });

  it("names whichever stores aren't on Plus", async () => {
    canStyleCheckout.mockImplementation(async (admin) => admin === sourceAdmin);
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toEqual({
      blocked:
        "Shopify only lets apps change checkout styling on Shopify Plus stores, and b.myshopify.com isn't on Plus.",
    });

    canStyleCheckout.mockResolvedValue(false);
    const both = await getCheckoutOverview({
      connection: connection(),
      sourceAdmin: sourceAdmin as never,
    });
    expect(both.blocked).toContain(
      "a.myshopify.com and b.myshopify.com aren't on Plus",
    );
    expect(readCheckoutStyling).not.toHaveBeenCalled();
  });

  it("compares with the target once approved", async () => {
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toEqual({ blocked: null, summary, status: "IN_SYNC" });

    readCheckoutStyling.mockImplementation(async (admin) =>
      admin === sourceAdmin ? styling("#111111") : styling("#222222"),
    );
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toMatchObject({ status: "OUT_OF_SYNC" });

    readCheckoutStyling.mockImplementation(async (admin) =>
      admin === sourceAdmin ? styling("#111111") : null,
    );
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toMatchObject({ status: "NOT_SYNCED" });
  });

  it("skips the target's styling before approval", async () => {
    expect(
      await getCheckoutOverview({
        connection: connection("PENDING"),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toEqual({ blocked: null, summary, status: null });
    expect(readCheckoutStyling).toHaveBeenCalledTimes(1);
  });

  it("blocks without a published source configuration or on errors", async () => {
    readCheckoutStyling.mockResolvedValue(null);
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toEqual({
      blocked:
        "a.myshopify.com has no published checkout configuration to copy.",
    });

    canStyleCheckout.mockRejectedValue(new Error("Access denied"));
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toEqual({ blocked: "Couldn't read checkout styling. Access denied" });

    canStyleCheckout.mockRejectedValue("offline");
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toEqual({ blocked: "Couldn't read checkout styling. offline" });
  });

  it("names the store a read error came from", async () => {
    readCheckoutStyling.mockImplementation(async (admin) => {
      if (admin === targetAdmin) {
        throw new Error(
          "Access denied for checkoutAndAccountsConfigurations field.",
        );
      }
      return styling("#111111");
    });
    expect(
      (
        await getCheckoutOverview({
          connection: connection(),
          sourceAdmin: sourceAdmin as never,
        })
      ).blocked,
    ).toBe(
      "Couldn't read checkout styling. Shopify denied access to b.myshopify.com's checkout styling. It may not have the new checkout and accounts editor yet.",
    );

    readCheckoutStyling.mockRejectedValue("timeout");
    expect(
      (
        await getCheckoutOverview({
          connection: connection(),
          sourceAdmin: sourceAdmin as never,
        })
      ).blocked,
    ).toBe("Couldn't read checkout styling. a.myshopify.com: timeout");
  });

  it("asks stores missing the new scopes to approve them first", async () => {
    unauthenticatedAdmin.mockImplementation(async (shop: string) => ({
      admin: targetAdmin,
      session: {
        scope: shop === "b.myshopify.com" ? "write_products" : SCOPES,
      },
    }));
    expect(
      await getCheckoutOverview({
        connection: connection(),
        sourceAdmin: sourceAdmin as never,
      }),
    ).toEqual({
      blocked:
        "StoreBridge needs new permissions for checkout styling. Open StoreBridge in b.myshopify.com's admin to approve them.",
      approveIn: ["b.myshopify.com"],
    });

    unauthenticatedAdmin.mockResolvedValue({
      admin: targetAdmin,
      session: { scope: undefined },
    });
    expect(
      (
        await getCheckoutOverview({
          connection: connection(),
          sourceAdmin: sourceAdmin as never,
        })
      ).blocked,
    ).toContain("a.myshopify.com and b.myshopify.com's admin");
    expect(canStyleCheckout).not.toHaveBeenCalled();
  });
});
