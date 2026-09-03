import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import type { ActionFunction } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { DashboardData } from "~/utils/dashboard.server";

import { OwnedGroupsList } from "./OwnedGroupsList";

const baseStore = {
  id: "store-1",
  shop: "target.myshopify.com",
  name: null,
  createdAt: new Date(),
};

function renderAtRoute(
  groups: DashboardData["ownedGroups"],
  action?: ActionFunction,
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <OwnedGroupsList groups={groups} />,
      action,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("OwnedGroupsList", () => {
  it("shows an empty state when there are no groups", () => {
    renderAtRoute([]);
    expect(
      screen.getByText(/haven.t paired with any stores yet/i),
    ).toBeInTheDocument();
  });

  it("renders each group's targets with a status badge", () => {
    const groups: DashboardData["ownedGroups"] = [
      {
        id: "group-1",
        name: "EU stores",
        sourceId: "source-1",
        createdAt: new Date(),
        targets: [
          {
            id: "target-1",
            groupId: "group-1",
            storeId: "store-1",
            status: "PENDING",
            requestedAt: new Date(),
            respondedAt: null,
            authTokenHash: null,
            authTokenExpiresAt: null,
            store: baseStore,
          },
        ],
      },
    ];

    renderAtRoute(groups);

    expect(document.querySelector("s-heading")).toHaveTextContent("EU stores");
    expect(screen.getByText(baseStore.shop)).toBeInTheDocument();
    const badge = document.querySelector("s-badge");
    expect(badge).toHaveAttribute("tone", "warning");
    expect(badge).toHaveTextContent("PENDING");
    expect(screen.getByText("View")).toHaveAttribute(
      "href",
      "/app/groups/group-1/definitions",
    );
  });

  it('collapses target lists longer than 3 to "and N more"', () => {
    const groups: DashboardData["ownedGroups"] = [
      {
        id: "group-1",
        name: "EU stores",
        sourceId: "source-1",
        createdAt: new Date(),
        targets: Array.from({ length: 5 }, (_, i) => ({
          id: `target-${i}`,
          groupId: "group-1",
          storeId: `store-${i}`,
          status: "APPROVED" as const,
          requestedAt: new Date(),
          respondedAt: new Date(),
          authTokenHash: null,
          authTokenExpiresAt: null,
          store: {
            ...baseStore,
            id: `store-${i}`,
            shop: `store-${i}.myshopify.com`,
          },
        })),
      },
    ];

    renderAtRoute(groups);

    expect(screen.getByText("store-0.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("store-2.myshopify.com")).toBeInTheDocument();
    expect(screen.queryByText("store-3.myshopify.com")).not.toBeInTheDocument();
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
  });

  it("shows a placeholder when a group has no targets yet", () => {
    const groups: DashboardData["ownedGroups"] = [
      {
        id: "group-1",
        name: null,
        sourceId: "source-1",
        createdAt: new Date(),
        targets: [],
      },
    ];

    renderAtRoute(groups);
    expect(screen.getByText(/untitled group/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no target stores invited yet/i),
    ).toBeInTheDocument();
  });

  it("offers Resend link only for a PENDING target, and shows the new link on success", async () => {
    const groups: DashboardData["ownedGroups"] = [
      {
        id: "group-1",
        name: "EU stores",
        sourceId: "source-1",
        createdAt: new Date(),
        targets: [
          {
            id: "target-1",
            groupId: "group-1",
            storeId: "store-1",
            status: "PENDING",
            requestedAt: new Date(),
            respondedAt: null,
            authTokenHash: null,
            authTokenExpiresAt: null,
            store: baseStore,
          },
          {
            id: "target-2",
            groupId: "group-1",
            storeId: "store-2",
            status: "APPROVED",
            requestedAt: new Date(),
            respondedAt: new Date(),
            authTokenHash: null,
            authTokenExpiresAt: null,
            store: {
              ...baseStore,
              id: "store-2",
              shop: "approved.myshopify.com",
            },
          },
        ],
      },
    ];
    const action = vi.fn().mockResolvedValue({
      ok: true,
      authorizeUrl: "https://app.example.com/app/stores/authorize?token=new",
    });

    renderAtRoute(groups, action);

    // The "View" button (no submit type) plus one "Resend link" submit
    // button — only the PENDING target gets one.
    const submitButtons = document.querySelectorAll('s-button[type="submit"]');
    expect(submitButtons).toHaveLength(1);

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.get("intent")).toBe("regenerate");
    expect(formData.get("targetId")).toBe("target-1");

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "New link generated",
      ),
    );
    expect(
      document.querySelector('s-text-field[label="Authorization link"]'),
    ).toHaveAttribute(
      "value",
      "https://app.example.com/app/stores/authorize?token=new",
    );
  });
});
