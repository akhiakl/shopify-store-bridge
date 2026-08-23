import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardData } from "../pairing.server";
import { OwnedGroupsList } from "./OwnedGroupsList";

const baseStore = {
  id: "store-1",
  shop: "target.myshopify.com",
  name: null,
  createdAt: new Date(),
};

describe("OwnedGroupsList", () => {
  it("shows an empty state when there are no groups", () => {
    render(<OwnedGroupsList groups={[]} />);
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

    render(<OwnedGroupsList groups={groups} />);

    expect(document.querySelector("s-heading")).toHaveTextContent("EU stores");
    expect(screen.getByText(baseStore.shop)).toBeInTheDocument();
    const badge = document.querySelector("s-badge");
    expect(badge).toHaveAttribute("tone", "warning");
    expect(badge).toHaveTextContent("PENDING");
    expect(screen.getByText("Sync definitions")).toHaveAttribute(
      "href",
      "/app/groups/group-1/definitions",
    );
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

    render(<OwnedGroupsList groups={groups} />);
    expect(screen.getByText(/untitled group/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no target stores invited yet/i),
    ).toBeInTheDocument();
  });
});
