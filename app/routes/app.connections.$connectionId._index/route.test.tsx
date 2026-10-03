import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { requireConnectionPage } = vi.hoisted(() => ({
  requireConnectionPage: vi.fn(),
}));
vi.mock("~/utils/sync/connectionRoute.server", () => ({
  requireConnectionPage,
}));

const { getJobHistory } = vi.hoisted(() => ({ getJobHistory: vi.fn() }));
vi.mock("~/utils/sync/sync.server", () => ({ getJobHistory }));

const { resumeStalledJobs, waitUntil } = vi.hoisted(() => ({
  resumeStalledJobs: vi.fn(),
  waitUntil: vi.fn(),
}));
vi.mock("~/utils/sync/syncQueue.server", () => ({ resumeStalledJobs }));
vi.mock("@vercel/functions", () => ({ waitUntil }));

const { loader, default: ConnectionJobHistory } = await import("./route");

describe("job history loader", () => {
  it("resumes stalled jobs and returns the connection's history", async () => {
    requireConnectionPage.mockResolvedValue({ connection: { id: "conn-1" } });
    getJobHistory.mockResolvedValue([{ id: "job-1" }]);

    const result = await loader({} as never);

    expect(resumeStalledJobs).toHaveBeenCalledWith("conn-1");
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(getJobHistory).toHaveBeenCalledWith("conn-1");
    expect(result).toEqual({ jobs: [{ id: "job-1" }] });
  });
});

describe("ConnectionJobHistory", () => {
  it("shows the empty job history", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: ConnectionJobHistory,
        loader: () => ({ jobs: [] }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(
      await screen.findByText("No syncs have been run yet."),
    ).toBeInTheDocument();
  });
});
