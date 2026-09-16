import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { DashboardData } from "~/utils/dashboard.server";
import { IncomingRequestsList } from "./IncomingRequestsList";

const requests: DashboardData["incomingRequests"] = [
  {
    id: "target-1",
    groupId: "group-1",
    storeId: "store-1",
    status: "PENDING",
    requestedAt: new Date(),
    respondedAt: null,
    authTokenHash: "hash",
    authTokenExpiresAt: new Date(),
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

describe("IncomingRequestsList", () => {
  it("renders the requesting store and group name, with no approve control", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <IncomingRequestsList requests={requests} />,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(
      screen.getByText(/source\.myshopify\.com — EU stores/),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });

  it("posts a decline intent with the target id when declined", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <IncomingRequestsList requests={requests} />,
        action,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.get("intent")).toBe("decline");
    expect(formData.get("targetId")).toBe("target-1");
  });

  it("shows a loading state on the decline button while submitting", async () => {
    let resolveAction: (value: { ok: true }) => void = () => {};
    const action = vi.fn(
      () => new Promise((resolve) => (resolveAction = resolve)),
    );
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <IncomingRequestsList requests={requests} />,
        action,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    const declineForm = document.querySelector("form")!;
    fireEvent.submit(declineForm);
    await waitFor(() => expect(action).toHaveBeenCalled());

    expect(declineForm.querySelector("s-button")).toHaveAttribute(
      "loading",
      "true",
    );

    resolveAction({ ok: true });
  });
});
