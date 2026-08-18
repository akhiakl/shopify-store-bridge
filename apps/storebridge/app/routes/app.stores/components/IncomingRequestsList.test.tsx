import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { DashboardData } from "../pairing.server";
import { IncomingRequestsList } from "./IncomingRequestsList";

const requests: DashboardData["incomingRequests"] = [
  {
    id: "target-1",
    groupId: "group-1",
    storeId: "store-1",
    status: "PENDING",
    requestedAt: new Date(),
    respondedAt: null,
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
  it("renders the requesting store and group name", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <IncomingRequestsList requests={requests} />,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(
      screen.getByText("source.myshopify.com — EU stores"),
    ).toBeInTheDocument();
  });

  it("posts an approve intent with the target id when approved", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <IncomingRequestsList requests={requests} />,
        action,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    const [approveForm] = document.querySelectorAll("form");
    fireEvent.submit(approveForm);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.get("intent")).toBe("approve");
    expect(formData.get("targetId")).toBe("target-1");
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

    const [, declineForm] = document.querySelectorAll("form");
    fireEvent.submit(declineForm);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.get("intent")).toBe("decline");
    expect(formData.get("targetId")).toBe("target-1");
  });

  it("keeps approve and decline loading state independent", async () => {
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

    const [approveForm, declineForm] = document.querySelectorAll("form");
    fireEvent.submit(approveForm);
    await waitFor(() => expect(action).toHaveBeenCalled());

    expect(approveForm.querySelector("s-button")).toHaveAttribute(
      "loading",
      "true",
    );
    expect(declineForm.querySelector("s-button")).not.toHaveAttribute(
      "loading",
      "true",
    );

    resolveAction({ ok: true });
  });
});
