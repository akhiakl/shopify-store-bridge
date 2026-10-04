import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { useStatusCheck } from "./useStatusCheck";

function Probe() {
  const { fetcher, statuses, outOfDateKeys } = useStatusCheck("metafield:");
  return (
    <fetcher.Form method="post">
      <button type="submit">check</button>
      <p>{statuses ? "has statuses" : "no statuses"}</p>
      <p>{outOfDateKeys.join(",")}</p>
    </fetcher.Form>
  );
}

describe("useStatusCheck", () => {
  it("lists only this page's keys that some target is missing", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: true,
      statuses: {
        "metafield:PRODUCT:custom:care": { inSyncCount: 0, totalTargets: 1 },
        "metafield:PRODUCT:custom:size": { inSyncCount: 1, totalTargets: 1 },
        "metaobject:faq": { inSyncCount: 0, totalTargets: 1 },
      },
    });
    const Stub = createRoutesStub([{ path: "/", Component: Probe, action }]);
    render(<Stub initialEntries={["/"]} />);
    expect(screen.getByText("no statuses")).toBeInTheDocument();

    fireEvent.click(screen.getByText("check"));

    expect(await screen.findByText("has statuses")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("metafield:PRODUCT:custom:care"),
      ).toBeInTheDocument(),
    );
  });
});
