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
                  itemsSkipped: 2,
                  itemsFailed: 0,
                  errorMessage: null,
                  store: { shop: "target-1.myshopify.com" },
                  items: [],
                },
                {
                  id: "t-2",
                  status: "FAILED",
                  itemsSynced: 0,
                  itemsSkipped: 0,
                  itemsFailed: 1,
                  errorMessage: "Something went wrong",
                  store: { shop: "target-2.myshopify.com" },
                  items: [
                    {
                      key: "metaobject:size_chart",
                      kind: "DEFINITION",
                      status: "FAILED",
                      errorMessage: "Name can't be blank",
                    },
                  ],
                },
              ],
            },
          ] as never
        }
      />,
    );

    expect(screen.getByText("PARTIAL")).toBeInTheDocument();
    expect(screen.getByText("target-1.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("1 synced, 2 already existed")).toBeInTheDocument();
    expect(screen.getByText("0 synced, 1 failed")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(
        "target-2.myshopify.com — metaobject:size_chart: Name can't be blank",
      ),
    ).toBeInTheDocument();
  });

  it("shows progress for unfinished work and a job-level error", () => {
    render(
      <JobHistoryList
        jobs={
          [
            {
              id: "job-2",
              status: "QUEUED",
              startedAt: new Date("2024-01-02T00:00:00Z"),
              selection: ["metaobjectEntries:faq"],
              errorMessage: null,
              targets: [],
            },
            {
              id: "job-1",
              status: "RUNNING",
              startedAt: new Date("2024-01-01T00:00:00Z"),
              selection: ["metaobjectEntries:faq"],
              errorMessage: "Couldn't read the source store.",
              targets: [
                {
                  id: "t-1",
                  status: "PENDING",
                  stepsDone: 40,
                  stepsTotal: 120,
                  itemsSynced: 40,
                  itemsSkipped: 0,
                  itemsFailed: 0,
                  errorMessage: null,
                  store: { shop: "target-1.myshopify.com" },
                  items: [],
                },
              ],
            },
          ] as never
        }
      />,
    );

    expect(screen.getByText("Reading the source store…")).toBeInTheDocument();
    expect(screen.getByText("40 of 120 done")).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't read the source store."),
    ).toBeInTheDocument();
  });
});
