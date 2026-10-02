import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, processSyncJob, stalled } = vi.hoisted(() => {
  const stalled: { id: string }[] = [];
  return {
    stalled,
    processSyncJob: vi.fn(),
    dbMock: {
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) => ({
          returning: () =>
            Promise.resolve([{ id: "job-1", ...(values as object) }]),
        })),
      })),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve(stalled) }),
        }),
      })),
    },
  };
});
vi.mock("~/db.server", () => ({ default: dbMock }));
vi.mock("./syncWorker.server", () => ({ processSyncJob }));

const { enqueueSyncJob, driveSyncJob, resumeStalledJobs, WORKER_PATH } =
  await import("./syncQueue.server");

const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));

beforeEach(() => {
  vi.clearAllMocks();
  stalled.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("SHOPIFY_APP_URL", "https://app.example.com");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("enqueueSyncJob", () => {
  it("inserts the job as QUEUED", async () => {
    const job = await enqueueSyncJob("group-1", ["metaobject:faq"]);

    expect(job).toMatchObject({
      id: "job-1",
      groupId: "group-1",
      selection: ["metaobject:faq"],
      status: "QUEUED",
    });
  });
});

describe("driveSyncJob", () => {
  it("hands off to a fresh authenticated run when work is left", async () => {
    processSyncJob.mockResolvedValue("more");

    await driveSyncJob("job-1");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(WORKER_PATH, "https://app.example.com"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer s3cret" }),
        body: JSON.stringify({ jobId: "job-1" }),
      }),
    );
  });

  it("stops when the job is done or another run holds it", async () => {
    processSyncJob.mockResolvedValueOnce("done").mockResolvedValueOnce("busy");

    await driveSyncJob("job-1");
    await driveSyncJob("job-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can't hand off without CRON_SECRET, and says so", async () => {
    vi.stubEnv("CRON_SECRET", "");
    processSyncJob.mockResolvedValue("more");

    await driveSyncJob("job-1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("never throws, since it runs unattended in waitUntil", async () => {
    processSyncJob.mockRejectedValueOnce(new Error("db down"));
    await expect(driveSyncJob("job-1")).resolves.toBeUndefined();

    processSyncJob.mockResolvedValue("more");
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(driveSyncJob("job-1")).resolves.toBeUndefined();
  });
});

describe("resumeStalledJobs", () => {
  it("runs each stalled job", async () => {
    stalled.push({ id: "a" }, { id: "b" });
    processSyncJob.mockResolvedValue("done");

    await resumeStalledJobs("group-1");

    expect(processSyncJob.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
  });

  it("never throws when the lookup fails", async () => {
    dbMock.select.mockImplementationOnce(() => {
      throw new Error("db down");
    });

    await expect(resumeStalledJobs()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
