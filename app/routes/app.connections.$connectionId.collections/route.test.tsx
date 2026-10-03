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

const { getCollections } = vi.hoisted(() => ({ getCollections: vi.fn() }));
vi.mock("~/utils/sync/collections.server", () => ({ getCollections }));

const { loader, action, default: Page } = await import("./route");

describe("collections loader", () => {
  it("reads from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    getCollections.mockResolvedValue([]);

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      collections: [],
    });
    expect(getCollections).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });
});

function renderAt(path: string) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/collections",
      Component: Page,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        collections: [],
      }),
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("collections page", () => {
  it("renders its section and a sync button linking to job history", async () => {
    renderAt("/app/connections/conn-1/collections");

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Collections"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });
});
