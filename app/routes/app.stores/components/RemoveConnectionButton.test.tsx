import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { RemoveConnectionButton } from "./RemoveConnectionButton";

function renderButton(
  status: "PENDING" | "APPROVED" | "DECLINED",
  action = vi.fn().mockResolvedValue({ ok: true }),
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <RemoveConnectionButton
          connectionId="conn-1"
          status={status}
          shop="other.myshopify.com"
        />
      ),
      action,
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return action;
}

/** The dialog's confirm button: the one in its primary-action slot. */
function confirmButton() {
  return document.querySelector(
    's-button[slot="primary-action"]',
  ) as HTMLElement;
}

describe("RemoveConnectionButton", () => {
  it("names the action and the other store per status", () => {
    renderButton("PENDING");
    expect(screen.getAllByText("Cancel invite")).toHaveLength(2);
    expect(document.querySelector("s-modal")).toHaveAttribute(
      "heading",
      "Cancel the invite to other.myshopify.com?",
    );
  });

  it("only submits once confirmed in the dialog", async () => {
    const action = renderButton("APPROVED");
    expect(document.querySelector("s-modal")).toHaveAttribute(
      "heading",
      "Disconnect other.myshopify.com?",
    );
    expect(action).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const form = await (
      action.mock.calls[0][0] as { request: Request }
    ).request.formData();
    expect(Object.fromEntries(form)).toEqual({
      intent: "remove",
      connectionId: "conn-1",
    });
  });

  it("shows the error when removing fails", async () => {
    renderButton(
      "DECLINED",
      vi.fn().mockResolvedValue({ ok: false, error: "Connection not found." }),
    );
    fireEvent.click(confirmButton());
    expect(
      await screen.findByText("Connection not found."),
    ).toBeInTheDocument();
  });
});
