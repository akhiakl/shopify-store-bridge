import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { waitUntil, driveSyncJob, resumeStalledJobs } = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  driveSyncJob: vi.fn(() => Promise.resolve()),
  resumeStalledJobs: vi.fn(() => Promise.resolve()),
}));
vi.mock("@vercel/functions", () => ({ waitUntil }));
vi.mock("~/utils/sync/syncQueue.server", () => ({
  driveSyncJob,
  resumeStalledJobs,
}));

const { loader, action } = await import("./api.sync-worker");

const URL_ = "https://app.example.com/api/sync-worker";

function request(init: RequestInit & { auth?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.auth) headers.set("authorization", init.auth);
  return new Request(URL_, { ...init, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("api.sync-worker", () => {
  it("rejects a request without the right bearer secret", async () => {
    const noAuth = await loader({
      request: request(),
      params: {},
      context: {},
    } as never);
    const wrong = await loader({
      request: request({ auth: "Bearer nope" }),
      params: {},
      context: {},
    } as never);

    expect(noAuth.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await loader({
      request: request({ auth: "Bearer " }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(401);
  });

  it("GET (Vercel Cron) resumes stalled jobs in the background", async () => {
    const response = await loader({
      request: request({ auth: "Bearer s3cret" }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(202);
    expect(resumeStalledJobs).toHaveBeenCalledWith();
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("POST continues the given job in the background", async () => {
    const response = await action({
      request: request({
        method: "POST",
        auth: "Bearer s3cret",
        body: JSON.stringify({ jobId: "job-1" }),
      }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(202);
    expect(driveSyncJob).toHaveBeenCalledWith("job-1");
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("POST rejects a body without a job id", async () => {
    const response = await action({
      request: request({ method: "POST", auth: "Bearer s3cret", body: "{}" }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(400);
    expect(driveSyncJob).not.toHaveBeenCalled();
  });
});
