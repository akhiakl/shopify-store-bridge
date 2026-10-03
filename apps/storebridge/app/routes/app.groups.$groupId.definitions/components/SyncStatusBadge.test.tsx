import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncStatusBadge } from "./SyncStatusBadge";

describe("SyncStatusBadge", () => {
  it("renders nothing when no status check has run yet", () => {
    const { container } = render(<SyncStatusBadge summary={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a success-toned aggregate badge when every target is in sync", () => {
    render(
      <SyncStatusBadge
        summary={{
          inSyncCount: 2,
          totalTargets: 2,
          perTarget: [
            { targetId: "t1", shop: "a.myshopify.com", status: "IN_SYNC" },
            { targetId: "t2", shop: "b.myshopify.com", status: "IN_SYNC" },
          ],
        }}
      />,
    );

    const badge = document.querySelector("s-badge");
    expect(badge).toHaveAttribute("tone", "success");
    expect(badge).toHaveTextContent("2/2 in sync");
  });

  it("shows a warning-toned badge when at least one target is out of sync", () => {
    render(
      <SyncStatusBadge
        summary={{
          inSyncCount: 1,
          totalTargets: 2,
          perTarget: [
            { targetId: "t1", shop: "a.myshopify.com", status: "IN_SYNC" },
            { targetId: "t2", shop: "b.myshopify.com", status: "OUT_OF_SYNC" },
          ],
        }}
      />,
    );

    expect(document.querySelector("s-badge")).toHaveAttribute(
      "tone",
      "warning",
    );
  });

  it("shows a critical-toned badge when no target has the definition at all", () => {
    render(
      <SyncStatusBadge
        summary={{
          inSyncCount: 0,
          totalTargets: 1,
          perTarget: [
            { targetId: "t1", shop: "a.myshopify.com", status: "NOT_SYNCED" },
          ],
        }}
      />,
    );

    expect(document.querySelector("s-badge")).toHaveAttribute(
      "tone",
      "critical",
    );
  });

  it("reveals the per-target breakdown inside the disclosure", () => {
    render(
      <SyncStatusBadge
        summary={{
          inSyncCount: 1,
          totalTargets: 1,
          perTarget: [
            { targetId: "t1", shop: "a.myshopify.com", status: "IN_SYNC" },
          ],
        }}
      />,
    );

    expect(screen.getByText("a.myshopify.com")).toBeInTheDocument();
  });
});
