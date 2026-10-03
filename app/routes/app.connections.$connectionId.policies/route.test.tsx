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

const { getShopPolicies } = vi.hoisted(() => ({ getShopPolicies: vi.fn() }));
vi.mock("~/utils/sync/definitions.server", () => ({ getShopPolicies }));

const { loader, action, default: Page } = await import("./route");

describe("policies loader", () => {
  it("reads from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    getShopPolicies.mockResolvedValue([]);

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      policies: [],
    });
    expect(getShopPolicies).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });
});

function renderAt(path: string) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/policies",
      Component: Page,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        policies: [],
      }),
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("policies page", () => {
  it("renders its section and a sync button linking to job history", async () => {
    renderAt("/app/connections/conn-1/policies");

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Shop policies"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });
});
