import { render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { requireConnectionPage, connectionPageAction } = vi.hoisted(() => ({
  requireConnectionPage: vi.fn(),
  connectionPageAction: vi.fn(),
}));
vi.mock("~/utils/sync/connectionRoute.server", () => ({
  requireConnectionPage,
  connectionPageAction,
}));

const { getDeliveryProfiles } = vi.hoisted(() => ({
  getDeliveryProfiles: vi.fn(),
}));
vi.mock("~/utils/sync/deliveryProfiles.server", () => ({
  getDeliveryProfiles,
}));

const { getMarketShipping } = vi.hoisted(() => ({
  getMarketShipping: vi.fn(),
}));
vi.mock("~/utils/sync/marketShipping.server", () => ({ getMarketShipping }));

const { loader, action, default: Page } = await import("./route");

describe("shipping loader", () => {
  it("reads from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    getMarketShipping.mockResolvedValue({
      marketDrivenShipping: false,
      markets: [],
    });
    getDeliveryProfiles.mockResolvedValue([]);

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      marketDrivenShipping: false,
      markets: [],
      profiles: [],
    });
    expect(getMarketShipping).toHaveBeenCalledWith(sourceAdmin);
    expect(getDeliveryProfiles).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });

  it("skips delivery profiles for a source on market-driven shipping", async () => {
    getDeliveryProfiles.mockClear();
    getMarketShipping.mockResolvedValue({
      marketDrivenShipping: true,
      markets: [{ handle: "ca" }],
    });

    expect(await loader({} as never)).toMatchObject({
      marketDrivenShipping: true,
      markets: [{ handle: "ca" }],
      profiles: [],
    });
    expect(getDeliveryProfiles).not.toHaveBeenCalled();
  });
});

function renderAt(path: string, marketDrivenShipping = false) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/shipping",
      Component: Page,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        marketDrivenShipping,
        markets: [],
        profiles: [],
      }),
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("shipping page", () => {
  it("renders its section and a sync button linking to job history", async () => {
    renderAt("/app/connections/conn-1/shipping");

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Shipping profiles"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });

  it("shows market shipping for a source on market-driven shipping", async () => {
    renderAt("/app/connections/conn-1/shipping", true);

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Market shipping"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector('s-section[heading="Shipping profiles"]'),
    ).toBeNull();
  });
});
