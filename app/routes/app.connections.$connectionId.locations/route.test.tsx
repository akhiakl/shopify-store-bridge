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

const { getLocations } = vi.hoisted(() => ({ getLocations: vi.fn() }));
vi.mock("~/utils/sync/locations.server", () => ({ getLocations }));

const { loader, action, default: Page } = await import("./route");

describe("locations loader", () => {
  it("reads from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    getLocations.mockResolvedValue([]);

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      locations: [],
    });
    expect(getLocations).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });
});

function renderAt(path: string) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/locations",
      Component: Page,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        locations: [],
      }),
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("locations page", () => {
  it("renders its section and a sync button linking to job history", async () => {
    renderAt("/app/connections/conn-1/locations");

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Locations"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });
});
