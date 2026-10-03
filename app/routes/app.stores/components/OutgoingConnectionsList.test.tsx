import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { DashboardData } from "~/utils/dashboard.server";
import { OutgoingConnectionsList } from "./OutgoingConnectionsList";

type Connection = DashboardData["outgoing"][number];

function connection(
  id: string,
  status: Connection["status"],
  shop = `${id}.myshopify.com`,
): Connection {
  return {
    id,
    sourceStoreId: "source-1",
    targetStoreId: `store-${id}`,
    status,
    requestedAt: new Date(),
    respondedAt: null,
    authTokenHash: null,
    authTokenExpiresAt: null,
    target: { id: `store-${id}`, shop, name: null, createdAt: new Date() },
  };
}

function renderList(connections: Connection[], action = vi.fn()) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <OutgoingConnectionsList connections={connections} />,
      action,
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("OutgoingConnectionsList", () => {
  it("shows an empty state with no connections", () => {
    renderList([]);

    expect(
      screen.getByText(/haven.t connected to any stores yet/i),
    ).toBeInTheDocument();
  });

  it("names each store with its status and a link in", () => {
    renderList([connection("a", "APPROVED"), connection("b", "DECLINED")]);

    expect(screen.getByText("a.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toHaveAttribute("tone", "success");
    expect(screen.getByText("Declined")).toHaveAttribute("tone", "critical");
    expect(screen.getAllByText("Open")[0]).toHaveAttribute(
      "href",
      "/app/connections/a",
    );
    // Only a pending request has a link to resend.
    expect(screen.queryByText("Resend link")).not.toBeInTheDocument();
  });

  it("resends a pending request's link and shows the new one", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: true,
      authorizeUrl: "https://app.example.com/app/stores/authorize?token=new",
    });
    renderList([connection("p", "PENDING")], action);
    expect(screen.getByText("Waiting for approval")).toHaveAttribute(
      "tone",
      "warning",
    );

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.get("intent")).toBe("regenerate");
    expect(formData.get("connectionId")).toBe("p");
    await waitFor(() =>
      expect(
        document.querySelector('s-banner[heading="New link generated"]'),
      ).not.toBeNull(),
    );
  });

  it("shows why a resend failed", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: "This request was already responded to.",
    });
    renderList([connection("p", "PENDING")], action);

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "This request was already responded to.",
      ),
    );
  });
});
