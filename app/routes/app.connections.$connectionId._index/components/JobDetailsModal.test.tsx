import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobDetailsModal } from "./JobDetailsModal";

const job = {
  id: "job-1",
  status: "FAILED",
  startedAt: new Date("2026-10-04T00:14:55Z"),
  selection: ["menu:main-menu", "policy:PRIVACY_POLICY"],
  errorMessage: null,
  itemsSynced: 3,
  itemsSkipped: 2,
  itemsFailed: 1,
  items: [
    // A plain "already exists" skip: no reason, so no row.
    {
      key: "menu:main-menu",
      kind: "DEFINITION",
      status: "SKIPPED",
      errorMessage: null,
    },
    {
      key: "menuItem:main-menu:Contact",
      kind: "DEFINITION",
      status: "SKIPPED",
      errorMessage: "page links can't be synced yet.",
    },
    {
      key: "policy:PRIVACY_POLICY",
      kind: "VALUE",
      status: "FAILED",
      errorMessage: "Automatic management must be turned off.",
    },
  ],
};

function issueRows() {
  return [
    ...document.querySelectorAll("s-modal s-table-body > s-table-row"),
  ] as HTMLElement[];
}

describe("JobDetailsModal", () => {
  it("lists only items that need attention, with readable names", () => {
    render(<JobDetailsModal id="job-job-1" job={job as never} />);

    const rows = issueRows();
    expect(rows).toHaveLength(2);
    const [skipped, failed] = rows;
    expect(
      within(skipped).getByText("main-menu › Contact"),
    ).toBeInTheDocument();
    expect(within(skipped).getByText("Menu item")).toBeInTheDocument();
    expect(within(skipped).getByText("Skipped")).toHaveAttribute(
      "tone",
      "warning",
    );
    expect(within(failed).getByText("Privacy policy")).toBeInTheDocument();
    expect(within(failed).getByText("Failed")).toHaveAttribute(
      "tone",
      "critical",
    );
  });

  it("shows the counts and what was requested", () => {
    render(<JobDetailsModal id="job-job-1" job={job as never} />);

    expect(
      screen.getByText("3 synced · 2 skipped · 1 failed"),
    ).toBeInTheDocument();
    expect(screen.getByText("Requested (2)")).toBeInTheDocument();
    expect(screen.getByText("Shop policy: Privacy policy")).toBeInTheDocument();
  });

  it("shows a job-level error and nothing-to-fix when no item failed", () => {
    render(
      <JobDetailsModal
        id="job-job-1"
        job={
          { ...job, errorMessage: "Source unreachable.", items: [] } as never
        }
      />,
    );

    expect(
      document.querySelector('s-banner[heading="Source unreachable."]'),
    ).not.toBeNull();
    expect(
      screen.getByText("Nothing needs your attention."),
    ).toBeInTheDocument();
  });
});
