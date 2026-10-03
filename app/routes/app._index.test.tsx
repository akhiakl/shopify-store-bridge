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

function renderAtRoute(dashboardData: {
  ownedGroups: unknown[];
  incomingRequests: unknown[];
  memberships: unknown[];
  recentJobs: unknown[];
}) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: Index,
      loader: () => dashboardData,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("App Home loader", () => {
  it("authenticates, loads dashboard data, and recent jobs scoped to owned groups", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getDashboardData.mockResolvedValue({
      ownedGroups: [{ id: "group-1" }],
      incomingRequests: [],
      memberships: [],
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
    expect(getRecentJobs).toHaveBeenCalledWith(["group-1"]);
    expect(result).toEqual({
      ownedGroups: [{ id: "group-1" }],
      incomingRequests: [],
      memberships: [],
      recentJobs: [],
    });
  });
});

describe("App Home", () => {
  it("shows the empty state with no owned groups", async () => {
    renderAtRoute({
      ownedGroups: [],
      incomingRequests: [],
      memberships: [],
      recentJobs: [],
    });

    expect(
      await screen.findByText(/haven.t connected any stores yet/i),
    ).toBeInTheDocument();
  });

  it("shows counts and recent activity when groups exist", async () => {
    renderAtRoute({
      ownedGroups: [
        {
          id: "group-1",
          targets: [{ status: "APPROVED" }, { status: "PENDING" }],
        },
      ],
      incomingRequests: [{ id: "incoming-1" }],
      memberships: [],
      recentJobs: [
        {
          id: "job-1",
          groupId: "group-1",
          status: "SUCCEEDED",
          startedAt: new Date("2026-01-01T00:00:00Z"),
          group: { name: "EU stores" },
        },
      ],
    });

    expect(await screen.findByText("1 sync group(s)")).toBeInTheDocument();
    expect(screen.getByText("1 approved target(s)")).toBeInTheDocument();
    expect(
      screen.getByText(/1 pairing request\(s\) awaiting/i),
    ).toBeInTheDocument();
    expect(screen.getByText("EU stores")).toHaveAttribute(
      "href",
      "/app/groups/group-1/definitions",
    );
    const badge = document.querySelector("s-badge");
    expect(badge).toHaveAttribute("tone", "success");
  });
});
