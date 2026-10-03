import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("../shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getDashboardData, getRecentJobs } = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
  getRecentJobs: vi.fn(),
}));
vi.mock("~/utils/dashboard.server", () => ({
  getDashboardData,
  getRecentJobs,
}));

const { loader } = await import("./app._index");
const Index = (await import("./app._index")).default;

const SHOP = "source-shop.myshopify.com";

type Dashboard = {
  outgoing: unknown[];
  incomingRequests: unknown[];
  incoming: unknown[];
  recentJobs: unknown[];
};

const empty: Dashboard = {
  outgoing: [],
  incomingRequests: [],
  incoming: [],
  recentJobs: [],
};

function renderAtRoute(overrides: Partial<Dashboard>) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: Index,
      loader: () => ({ ...empty, ...overrides }),
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("App Home loader", () => {
  it("loads dashboard data and recent jobs across both directions", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getDashboardData.mockResolvedValue({
      outgoing: [{ id: "out-1" }],
      incomingRequests: [],
      incoming: [{ id: "in-1" }],
    });
    getRecentJobs.mockResolvedValue([]);

    const request = new Request("https://example.myshopify.com/app");
    const result = await loader({
      request,
      params: {},
      context: {},
      url: new URL(request.url),
      pattern: "/app",
    } as never);

    expect(authenticateAdmin).toHaveBeenCalledWith(request);
    expect(getRecentJobs).toHaveBeenCalledWith(["out-1", "in-1"]);
    expect(result).toEqual({
      outgoing: [{ id: "out-1" }],
      incomingRequests: [],
      incoming: [{ id: "in-1" }],
      recentJobs: [],
    });
  });
});

describe("App Home", () => {
  it("shows the empty state with no connections", async () => {
    renderAtRoute({});

    expect(
      await screen.findByText(/haven.t connected any stores yet/i),
    ).toBeInTheDocument();
  });

  it("still shows the empty state when the only incoming connection was declined", async () => {
    renderAtRoute({ incoming: [{ id: "in-1", status: "DECLINED" }] });

    expect(
      await screen.findByText(/haven.t connected any stores yet/i),
    ).toBeInTheDocument();
  });

  it("counts a store it pulls from as connected", async () => {
    renderAtRoute({ incoming: [{ id: "in-1", status: "APPROVED" }] });

    expect(
      await screen.findByText("Pulls from 1 store(s)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/haven.t connected any stores yet/i),
    ).not.toBeInTheDocument();
  });

  it("shows the overview when the only activity is an incoming request", async () => {
    renderAtRoute({ incomingRequests: [{ id: "request-1" }] });

    expect(
      await screen.findByText(/1 pairing request\(s\) awaiting/i),
    ).toBeInTheDocument();
  });

  it("shows counts and recent activity", async () => {
    renderAtRoute({
      outgoing: [
        { id: "out-1", status: "APPROVED" },
        { id: "out-2", status: "PENDING" },
      ],
      recentJobs: [
        {
          id: "job-1",
          connectionId: "out-1",
          status: "SUCCEEDED",
          startedAt: new Date("2026-01-01T00:00:00Z"),
          connection: {
            source: { shop: "a.myshopify.com" },
            target: { shop: "b.myshopify.com" },
          },
        },
      ],
    });

    expect(await screen.findByText("Syncs to 1 store(s)")).toBeInTheDocument();
    expect(
      screen.getByText("1 invite(s) awaiting approval"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("a.myshopify.com → b.myshopify.com"),
    ).toHaveAttribute("href", "/app/connections/out-1");
    expect(document.querySelector("s-badge")).toHaveAttribute(
      "tone",
      "success",
    );
  });
});
