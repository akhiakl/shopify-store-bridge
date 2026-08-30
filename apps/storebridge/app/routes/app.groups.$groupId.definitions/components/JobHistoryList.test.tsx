import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobHistoryList } from "./JobHistoryList";

describe("JobHistoryList", () => {
  it("shows an empty state when no jobs have run", () => {
    render(<JobHistoryList jobs={[]} />);

    expect(screen.getByText("No syncs have been run yet.")).toBeInTheDocument();
  });

  it("renders a job's overall status and each target's outcome", () => {
    render(
      <JobHistoryList
        jobs={
          [
            {
              id: "job-1",
              status: "PARTIAL",
              startedAt: new Date("2024-01-01T00:00:00Z"),
              selection: ["metaobject:size_chart"],
              targets: [
                {
                  id: "t-1",
                  status: "SUCCEEDED",
                  itemsSynced: 1,
                  itemsFailed: 0,
                  errorMessage: null,
                  store: { shop: "target-1.myshopify.com" },
                },
                {
                  id: "t-2",
                  status: "FAILED",
                  itemsSynced: 0,
                  itemsFailed: 1,
                  errorMessage: "Type has already been taken",
                  store: { shop: "target-2.myshopify.com" },
                },
              ],
            },
          ] as never
        }
      />,
    );

    expect(screen.getByText("PARTIAL")).toBeInTheDocument();
    expect(screen.getByText("target-1.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("1 synced")).toBeInTheDocument();
    expect(screen.getByText("0 synced, 1 failed")).toBeInTheDocument();
    expect(screen.getByText("Type has already been taken")).toBeInTheDocument();
  });
});
