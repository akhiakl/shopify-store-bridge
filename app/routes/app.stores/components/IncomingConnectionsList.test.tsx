import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
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
    autoSync: false,
    requestedBy: null,
    respondedBy: null,
    source: {
      id: `store-${id}`,
      shop: `${id}.myshopify.com`,
      name: null,
      createdAt: new Date(),
    },
  };
}

// The remove button submits through a fetcher, which needs a router.
function renderList(connections: Connection[]) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <IncomingConnectionsList connections={connections} />,
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("IncomingConnectionsList", () => {
  it("lets an approved connection open its pages to pull from the source", () => {
    renderList([connection("a", "APPROVED")]);

    expect(screen.getByText("a.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toHaveAttribute("tone", "success");
    expect(screen.getByText("Sync from source")).toHaveAttribute(
      "href",
      "/app/connections/a",
    );
    expect(screen.getAllByText("Disconnect")[0]).toBeInTheDocument();
  });

  it("shows who requested and who responded", () => {
    renderList([
      { ...connection("a", "DECLINED"), requestedBy: "Ana", respondedBy: "Bo" },
    ]);

    expect(
      screen.getByText("Requested by Ana · Declined by Bo"),
    ).toBeInTheDocument();
  });

  it("offers nothing to open for a declined one", () => {
    renderList([connection("d", "DECLINED")]);

    expect(screen.getByText("Declined")).toHaveAttribute("tone", "critical");
    expect(screen.queryByText("Sync from source")).not.toBeInTheDocument();
    expect(screen.getAllByText("Remove")[0]).toBeInTheDocument();
  });
});
