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

const { getCheckoutOverview } = vi.hoisted(() => ({
  getCheckoutOverview: vi.fn(),
}));
vi.mock("./utils/getCheckoutOverview.server", () => ({ getCheckoutOverview }));

const { loader, action, default: Page } = await import("./route");

describe("checkout styling loader", () => {
  it("returns the overview for the connection", async () => {
    const connection = { id: "conn-1", target: { shop: "b.myshopify.com" } };
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection,
      sourceAdmin,
      isApproved: true,
    });
    getCheckoutOverview.mockResolvedValue({ blocked: "Nope" });

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      targetShop: "b.myshopify.com",
      overview: { blocked: "Nope" },
      apiKey: expect.any(String),
    });
    expect(getCheckoutOverview).toHaveBeenCalledWith({
      connection,
      sourceAdmin,
    });
    expect(action).toBe(connectionPageAction);
  });
});

function renderWith(overview: unknown) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/checkout",
      Component: Page,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        targetShop: "b.myshopify.com",
        overview,
        apiKey: "key-1",
      }),
    },
  ]);
  return render(<Stub initialEntries={["/app/connections/conn-1/checkout"]} />);
}

describe("checkout styling page", () => {
  it("explains why it's unavailable instead of offering a sync", async () => {
    renderWith({ blocked: "b.myshopify.com isn't on Plus." });

    await waitFor(() =>
      expect(
        screen.getByText("b.myshopify.com isn't on Plus."),
      ).toBeInTheDocument(),
    );
    expect(document.querySelector("s-checkbox")).toBeNull();
    expect(screen.queryByText(/Open StoreBridge/)).toBeNull();
  });

  it("links to StoreBridge in each store that has to approve scopes", async () => {
    renderWith({
      blocked: "StoreBridge needs new permissions.",
      approveIn: ["b.myshopify.com"],
    });

    expect(
      await screen.findByText("Open StoreBridge in b.myshopify.com"),
    ).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/b/apps/key-1/app/connections/conn-1/checkout",
    );
  });

  it("shows the styling with a confirmation before syncing", async () => {
    renderWith({
      blocked: null,
      summary: {
        colors: ["#111111"],
        fonts: [{ role: "Primary", name: "Assistant" }],
        baseSize: 14,
      },
      status: "OUT_OF_SYNC",
    });

    await waitFor(() =>
      expect(screen.getByText("Out of sync")).toBeInTheDocument(),
    );
    expect(screen.getByText("Primary: Assistant")).toBeInTheDocument();
    expect(screen.getByText("Base size: 14px")).toBeInTheDocument();
    expect(screen.getByLabelText("#111111")).toBeInTheDocument();

    expect(document.querySelector("s-checkbox")).toHaveAttribute(
      "label",
      "Checkout & accounts styling",
    );
    expect(
      document.querySelector('s-modal[heading="Change the live checkout?"]'),
    ).not.toBeNull();
  });

  it("leaves out empty parts of the summary", async () => {
    renderWith({
      blocked: null,
      summary: { colors: [], fonts: [], baseSize: null },
      status: null,
    });

    await waitFor(() =>
      expect(document.querySelector("s-checkbox")).not.toBeNull(),
    );
    expect(screen.queryByText("Colors")).toBeNull();
    expect(screen.queryByText("Typography")).toBeNull();
    expect(document.querySelector("s-badge")).toBeNull();
  });
});
