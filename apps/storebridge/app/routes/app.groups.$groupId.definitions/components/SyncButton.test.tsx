import { fireEvent, render, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { SyncButton } from "./SyncButton";

describe("SyncButton", () => {
  it("disables submit when nothing is selected", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <SyncButton selected={new Set()} approvedTargetCount={1} />
        ),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(document.querySelector("s-button")).toHaveAttribute("disabled");
  });

  it("disables submit when there are no approved targets", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <SyncButton
            selected={new Set(["metaobject:x"])}
            approvedTargetCount={0}
          />
        ),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(document.querySelector("s-button")).toHaveAttribute("disabled");
  });

  it("submits the selection as hidden inputs and shows the result", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: true, jobId: "job-1", status: "SUCCEEDED" });
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <SyncButton
            selected={
              new Set([
                "metaobject:size_chart",
                "metafield:PRODUCT:custom:care",
              ])
            }
            approvedTargetCount={1}
          />
        ),
        action,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.getAll("selection")).toEqual([
      "metaobject:size_chart",
      "metafield:PRODUCT:custom:care",
    ]);
    expect(formData.get("intent")).toBe("sync");

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "Sync succeeded",
      ),
    );
  });

  it("shows a critical banner on failure", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: "Select at least one definition.",
    });
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <SyncButton selected={new Set()} approvedTargetCount={1} />
        ),
        action,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "Select at least one definition.",
      ),
    );
  });
});
