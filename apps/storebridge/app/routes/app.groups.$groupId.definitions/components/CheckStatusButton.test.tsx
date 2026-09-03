import { fireEvent, render, waitFor } from "@testing-library/react";
import { createRoutesStub, useFetcher } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { CheckStatusButton } from "./CheckStatusButton";

/** useFetcher must be called from a component rendered under a router —
 * this wrapper lets the test still pass approvedTargetCount as a prop. */
function Wrapper({ approvedTargetCount }: { approvedTargetCount: number }) {
  const fetcher = useFetcher();
  return (
    <CheckStatusButton
      fetcher={fetcher}
      approvedTargetCount={approvedTargetCount}
    />
  );
}

describe("CheckStatusButton", () => {
  it("disables the button when there are no approved targets", () => {
    const Stub = createRoutesStub([
      { path: "/", Component: () => <Wrapper approvedTargetCount={0} /> },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(document.querySelector("s-button")).toHaveAttribute("disabled");
  });

  it("submits the checkStatus intent and shows an error banner on failure", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Couldn't reach a target." });
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <Wrapper approvedTargetCount={1} />,
        action,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData =
      (await action.mock.calls[0][0].request.formData()) as FormData;
    expect(formData.get("intent")).toBe("checkStatus");

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "Couldn't reach a target.",
      ),
    );
  });
});
