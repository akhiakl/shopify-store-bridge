import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobHistoryList } from "./JobHistoryList";

function job(overrides: Record<string, unknown>) {
  return {
    id: "job-1",
    status: "SUCCEEDED",
    startedAt: new Date("2026-10-04T00:14:55Z"),
    selection: ["menu:main-menu", "menu:footer"],
    errorMessage: null,
    itemsSynced: 3,
    itemsSkipped: 3,
    itemsFailed: 0,
    stepsDone: 6,
    stepsTotal: 6,
    items: [],
    ...overrides,
  };
}

function rows() {
  return [
    ...document.querySelectorAll("s-table-body > s-table-row"),
  ] as HTMLElement[];
}

describe("JobHistoryList", () => {
  it("shows an empty state when no jobs have run", () => {
    render(<JobHistoryList jobs={[]} />);

    expect(screen.getByText("No syncs have been run yet.")).toBeInTheDocument();
  });

  it("puts each job on one row: status, what synced, result, details", () => {
    render(<JobHistoryList jobs={[job({})] as never} />);

    const [row] = rows();
    expect(within(row).getByText("Succeeded")).toHaveAttribute(
      "tone",
      "success",
    );
    expect(within(row).getByText("Menus (2)")).toBeInTheDocument();
    expect(within(row).getByText("3 synced · 3 skipped")).toBeInTheDocument();
    expect(within(row).getByText("View details")).toHaveAttribute(
      "commandFor",
      "job-job-1",
    );
    // Its modal exists outside the table, under the same id.
    expect(document.querySelector("s-modal#job-job-1")).not.toBeNull();
  });

  it("shows failures, and an older job's partial status", () => {
    render(
      <JobHistoryList
        jobs={
          [
            job({ id: "a", status: "FAILED", itemsFailed: 2 }),
            job({ id: "b", status: "PARTIAL" }),
          ] as never
        }
      />,
    );

    const [failed, partial] = rows();
    expect(within(failed).getByText("Failed")).toHaveAttribute(
      "tone",
      "critical",
    );
    expect(
      within(failed).getByText("3 synced · 3 skipped · 2 failed"),
    ).toBeInTheDocument();
    expect(within(partial).getByText("Partly failed")).toHaveAttribute(
      "tone",
      "warning",
    );
  });

  it("shows progress for unfinished work and a job-level error", () => {
    render(
      <JobHistoryList
        jobs={
          [
            job({ id: "q", status: "QUEUED" }),
            job({ id: "r", status: "RUNNING", stepsDone: 40, stepsTotal: 120 }),
            job({
              id: "f",
              status: "FAILED",
              errorMessage: "Couldn't read the source store.",
              itemsSynced: 0,
              itemsSkipped: 0,
            }),
          ] as never
        }
      />,
    );

    const [queued, running, failed] = rows();
    expect(
      within(queued).getByText("Reading the source store…"),
    ).toBeInTheDocument();
    expect(
      within(running).getByText("40 of 120 steps done"),
    ).toBeInTheDocument();
    expect(
      within(failed).getByText("Couldn't read the source store."),
    ).toBeInTheDocument();
  });
});
