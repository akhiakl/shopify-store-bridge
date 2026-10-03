import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const { fetchMetafieldDefinitions } = vi.hoisted(() => ({
  fetchMetafieldDefinitions: vi.fn(),
}));
vi.mock("~/utils/sync/definitions.server", () => ({
  fetchMetafieldDefinitions,
}));

const { loader, action, default: MetafieldsPage } = await import("./route");

const careDefinition = {
  id: "gid://1",
  name: "Care",
  namespace: "custom",
  key: "care",
  description: null,
  ownerType: "PRODUCT",
  type: { name: "single_line_text_field" },
  valueCount: 3,
};

describe("metafields loader", () => {
  it("reads definitions from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    fetchMetafieldDefinitions.mockResolvedValue([careDefinition]);

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      definitions: [careDefinition],
    });
    expect(fetchMetafieldDefinitions).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });
});

function renderAt(path: string, pageAction = vi.fn()) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/metafields",
      Component: MetafieldsPage,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        definitions: [careDefinition],
      }),
      action: pageAction,
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("MetafieldsPage", () => {
  it("opens on the definitions tab", async () => {
    renderAt("/app/connections/conn-1/metafields");

    expect(await screen.findByText("Check sync status")).toBeInTheDocument();
    expect(
      document.querySelector('s-section[heading="Metafields"]'),
    ).not.toBeNull();
    expect(screen.getByText("Definitions")).toHaveAttribute(
      "variant",
      "secondary",
    );
    expect(screen.getByText("Values")).toHaveAttribute(
      "href",
      "/app/connections/conn-1/metafields?tab=values",
    );
  });

  it("shows values on the values tab", async () => {
    renderAt("/app/connections/conn-1/metafields?tab=values");

    await waitFor(() =>
      expect(screen.getByText("Values")).toHaveAttribute(
        "variant",
        "secondary",
      ),
    );
    // Definitions-only controls are gone; values render in the same card.
    expect(screen.queryByText("Check sync status")).not.toBeInTheDocument();
    expect(screen.getByText("Definitions")).toHaveAttribute(
      "variant",
      "tertiary",
    );
  });

  it("offers to select out-of-date definitions after a status check", async () => {
    const pageAction = vi.fn().mockResolvedValue({
      ok: true,
      statuses: {
        "metafield:PRODUCT:custom:care": {
          inSyncCount: 0,
          totalTargets: 1,
          perTarget: [
            { targetId: "t1", shop: "t.myshopify.com", status: "NOT_SYNCED" },
          ],
        },
      },
    });
    renderAt("/app/connections/conn-1/metafields", pageAction);

    fireEvent.submit(
      (await screen.findByText("Check sync status")).closest(
        "form",
      ) as HTMLFormElement,
    );
    fireEvent.click(await screen.findByText("Select what needs syncing"));

    expect(await screen.findByText("Sync 1 selected")).toBeInTheDocument();
  });
});
