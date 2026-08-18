import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardData } from "../pairing.server";
import { MembershipsList } from "./MembershipsList";

describe("MembershipsList", () => {
  it("renders the source shop, group name, and status for each membership", () => {
    const memberships: DashboardData["memberships"] = [
      {
        id: "target-1",
        groupId: "group-1",
        storeId: "store-1",
        status: "APPROVED",
        requestedAt: new Date(),
        respondedAt: new Date(),
        group: {
          id: "group-1",
          name: "EU stores",
          sourceId: "source-1",
          createdAt: new Date(),
          source: {
            id: "source-1",
            shop: "source.myshopify.com",
            name: null,
            createdAt: new Date(),
          },
        },
      },
    ];

    render(<MembershipsList memberships={memberships} />);

    expect(
      screen.getByText("source.myshopify.com — EU stores"),
    ).toBeInTheDocument();
    const badge = document.querySelector("s-badge");
    expect(badge).toHaveAttribute("tone", "success");
    expect(badge).toHaveTextContent("APPROVED");
  });

  it("omits the group name suffix when the group is unnamed", () => {
    const memberships: DashboardData["memberships"] = [
      {
        id: "target-1",
        groupId: "group-1",
        storeId: "store-1",
        status: "DECLINED",
        requestedAt: new Date(),
        respondedAt: new Date(),
        group: {
          id: "group-1",
          name: null,
          sourceId: "source-1",
          createdAt: new Date(),
          source: {
            id: "source-1",
            shop: "source.myshopify.com",
            name: null,
            createdAt: new Date(),
          },
        },
      },
    ];

    render(<MembershipsList memberships={memberships} />);

    expect(screen.getByText("source.myshopify.com")).toBeInTheDocument();
  });
});
