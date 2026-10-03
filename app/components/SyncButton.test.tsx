import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { SyncButton } from "./SyncButton";

function renderButton(
  { selected, isApproved }: { selected: string[]; isApproved: boolean },
  action = vi.fn(),
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <SyncButton
          selected={new Set(selected)}
          isApproved={isApproved}
          historyHref="/app/connections/conn-1"
        />
      ),
      action,
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return document.querySelector("s-button") as HTMLElement;
}

describe("SyncButton", () => {
  it("is the page's primary action, disabled while nothing is selected", () => {
    const button = renderButton({ selected: [], isApproved: true });

    expect(button).toHaveAttribute("slot", "primary-action");
    expect(button).toHaveAttribute("disabled");
    expect(button).toHaveTextContent("Sync now");
  });

  it("warns and stays disabled until the connection is approved", () => {
    const button = renderButton({
      selected: ["metaobject:x"],
      isApproved: false,
    });

    expect(button).toHaveAttribute("disabled");
    expect(document.querySelector("s-banner")).toHaveAttribute(
      "heading",
      "Waiting for approval",
    );
  });

  it("submits each selected key and confirms the sync started", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, jobId: "job-1" });
    const button = renderButton(
      {
        selected: ["metaobject:size_chart", "metafield:PRODUCT:custom:care"],
        isApproved: true,
      },
      action,
    );
    expect(button).toHaveTextContent("Sync 2 selected");

    fireEvent.click(button);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.get("intent")).toBe("sync");
    expect(formData.getAll("selection")).toEqual([
      "metaobject:size_chart",
      "metafield:PRODUCT:custom:care",
    ]);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "Sync started",
      ),
    );
    expect(screen.getByText("Job history")).toHaveAttribute(
      "href",
      "/app/connections/conn-1",
    );
  });

  it("shows a critical banner on failure", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: "Select at least one item.",
    });
    const button = renderButton(
      { selected: ["metaobject:x"], isApproved: true },
      action,
    );

    fireEvent.click(button);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "Select at least one item.",
      ),
    );
    expect(document.querySelector("s-banner")).toHaveAttribute(
      "tone",
      "critical",
    );
  });
});
