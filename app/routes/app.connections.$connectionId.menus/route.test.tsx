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

const { getMenus } = vi.hoisted(() => ({ getMenus: vi.fn() }));
vi.mock("~/utils/sync/menus.server", () => ({ getMenus }));

const { loader, action, default: Page } = await import("./route");

describe("menus loader", () => {
  it("reads from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    getMenus.mockResolvedValue([]);

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      menus: [],
    });
    expect(getMenus).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });
});

function renderAt(path: string) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/menus",
      Component: Page,
      loader: () => ({ connectionId: "conn-1", isApproved: true, menus: [] }),
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("menus page", () => {
  it("renders its section and a sync button linking to job history", async () => {
    renderAt("/app/connections/conn-1/menus");

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Navigation menus"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });
});
