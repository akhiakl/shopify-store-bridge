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

const { setAutoSync } = vi.hoisted(() => ({ setAutoSync: vi.fn() }));
vi.mock("~/utils/sync/autoSync.server", () => ({ setAutoSync }));

const {
  loader,
  action,
  default: ConnectionJobHistory,
} = await import("./route");

const connection = { id: "conn-1", autoSync: true };

function autoSyncRequest(fields: Record<string, string>) {
  return {
    request: new Request("https://example.com/app/connections/conn-1", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
  } as never;
}

describe("job history loader", () => {
  it("resumes stalled jobs and returns the connection's history", async () => {
    requireConnectionPage.mockResolvedValue({
      connection,
      role: "source",
      isApproved: true,
    });
    getJobHistory.mockResolvedValue([{ id: "job-1" }]);

    const result = await loader({} as never);

    expect(resumeStalledJobs).toHaveBeenCalledWith("conn-1");
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(getJobHistory).toHaveBeenCalledWith("conn-1");
    expect(result).toEqual({
      jobs: [{ id: "job-1" }],
      autoSync: true,
      canChangeAutoSync: true,
    });
  });

  it("only lets an approved connection's source change auto-sync", async () => {
    getJobHistory.mockResolvedValue([]);
    requireConnectionPage.mockResolvedValue({
      connection,
      role: "target",
      isApproved: true,
    });
    expect(await loader({} as never)).toMatchObject({
      canChangeAutoSync: false,
    });
  });
});

describe("auto-sync action", () => {
  it("saves the switch for the source", async () => {
    requireConnectionPage.mockResolvedValue({
      connection,
      role: "source",
      isApproved: true,
    });
    setAutoSync.mockResolvedValue({ ok: true });

    expect(
      await action(autoSyncRequest({ intent: "autoSync", enabled: "true" })),
    ).toEqual({ ok: true });
    expect(setAutoSync).toHaveBeenCalledWith(connection, true);
  });

  it("refuses the target, an unapproved connection and unknown intents", async () => {
    setAutoSync.mockClear();
    for (const access of [
      { role: "target", isApproved: true },
      { role: "source", isApproved: false },
    ]) {
      requireConnectionPage.mockResolvedValue({ connection, ...access });
      await expect(
        action(autoSyncRequest({ intent: "autoSync", enabled: "true" })),
      ).rejects.toMatchObject({ init: { status: 403 } });
    }
    await expect(
      action(autoSyncRequest({ intent: "nope" })),
    ).rejects.toMatchObject({ init: { status: 400 } });
    expect(setAutoSync).not.toHaveBeenCalled();
  });
});

describe("ConnectionJobHistory", () => {
  it("shows the empty job history", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: ConnectionJobHistory,
        loader: () => ({
          jobs: [],
          autoSync: false,
          canChangeAutoSync: true,
        }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(
      await screen.findByText("No syncs have been run yet."),
    ).toBeInTheDocument();
    expect(
      document.querySelector('s-checkbox[label="Auto-sync"]'),
    ).not.toBeNull();
  });
});
