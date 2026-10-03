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

const { fetchMetaobjectDefinitions } = vi.hoisted(() => ({
  fetchMetaobjectDefinitions: vi.fn(),
}));
vi.mock("~/utils/sync/definitions.server", () => ({
  fetchMetaobjectDefinitions,
}));

const { loader, action, default: Page } = await import("./route");

describe("metaobjects loader", () => {
  it("reads from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    fetchMetaobjectDefinitions.mockResolvedValue([]);

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      definitions: [],
    });
    expect(fetchMetaobjectDefinitions).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });
});

function renderAt(path: string) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/metaobjects",
      Component: Page,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        definitions: [],
      }),
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("metaobjects page", () => {
  it("renders its section and a sync button linking to job history", async () => {
    renderAt("/app/connections/conn-1/metaobjects");

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Metaobjects"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });

  it("switches to the entries tab", async () => {
    renderAt("/app/connections/conn-1/metaobjects?tab=entries");

    await waitFor(() =>
      expect(screen.getByText("Entries")).toHaveAttribute(
        "variant",
        "secondary",
      ),
    );
    expect(screen.queryByText("Check sync status")).not.toBeInTheDocument();
  });
});
