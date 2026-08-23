import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";

// The loader in this file imports shopify.server -> db.server (Drizzle/pg)
// and pairing.server. Stub both so this test exercises just the route's
// own wiring, not Postgres.
const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getDashboardData } = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
}));
vi.mock("~/routes/app.stores/pairing.server", () => ({ getDashboardData }));

const { default: Index, loader } = await import("./app._index");

const SHOP = "source-shop.myshopify.com";

describe("App Home", () => {
  it("authenticates the admin request and returns the dashboard data", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getDashboardData.mockResolvedValue({
      ownedGroups: [],
      incomingRequests: [],
      memberships: [],
    });

    const request = new Request("https://example.myshopify.com/app");
    const result = await loader({
      request,
      params: {},
      context: {},
    } as never);

    expect(authenticateAdmin).toHaveBeenCalledWith(request);
    expect(getDashboardData).toHaveBeenCalledWith(SHOP);
    expect(result).toEqual({
      ownedGroups: [],
      incomingRequests: [],
      memberships: [],
    });
  });

  it("shows the overview counts and no pending banner when nothing is waiting", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: Index,
        loader: () => ({
          ownedGroups: [{ id: "g1" }, { id: "g2" }],
          incomingRequests: [],
          memberships: [{ id: "m1" }],
        }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    // Polaris Web Components render their `heading` prop through the
    // CDN-loaded custom element definition, which isn't present in jsdom —
    // so heading text lives on the attribute, not as rendered DOM text.
    await waitFor(() =>
      expect(document.querySelector("s-page")).toHaveAttribute(
        "heading",
        "StoreBridge",
      ),
    );
    expect(document.querySelector("s-banner")).not.toBeInTheDocument();
    const headings = document.querySelectorAll("s-heading");
    expect(headings[0]).toHaveTextContent("2");
    expect(headings[1]).toHaveTextContent("0");
    expect(headings[2]).toHaveTextContent("1");
  });

  it("shows a banner naming the pending count when requests are waiting", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: Index,
        loader: () => ({
          ownedGroups: [],
          incomingRequests: [{ id: "r1" }, { id: "r2" }],
          memberships: [],
        }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "2 pairing requests waiting on you",
      ),
    );
  });
});
