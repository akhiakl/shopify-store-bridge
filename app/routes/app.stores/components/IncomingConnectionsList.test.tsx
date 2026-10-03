import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardData } from "~/utils/dashboard.server";
import { IncomingConnectionsList } from "./IncomingConnectionsList";

type Connection = DashboardData["incoming"][number];

function connection(id: string, status: Connection["status"]): Connection {
  return {
    id,
    sourceStoreId: `store-${id}`,
    targetStoreId: "target-1",
    status,
    requestedAt: new Date(),
    respondedAt: new Date(),
    authTokenHash: null,
    authTokenExpiresAt: null,
    source: {
      id: `store-${id}`,
      shop: `${id}.myshopify.com`,
      name: null,
      createdAt: new Date(),
    },
  };
}

describe("IncomingConnectionsList", () => {
  it("lets an approved connection open its pages to pull from the source", () => {
    render(
      <IncomingConnectionsList connections={[connection("a", "APPROVED")]} />,
    );

    expect(screen.getByText("a.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toHaveAttribute("tone", "success");
    expect(screen.getByText("Sync from source")).toHaveAttribute(
      "href",
      "/app/connections/a",
    );
  });

  it("offers nothing to open for a declined one", () => {
    render(
      <IncomingConnectionsList connections={[connection("d", "DECLINED")]} />,
    );

    expect(screen.getByText("Declined")).toHaveAttribute("tone", "critical");
    expect(screen.queryByText("Sync from source")).not.toBeInTheDocument();
  });
});
