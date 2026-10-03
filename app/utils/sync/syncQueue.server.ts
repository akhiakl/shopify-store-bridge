import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import db from "~/db.server";
import { syncJobs } from "~/db/syncJobsSchema.server";

import { processSyncJob } from "./syncWorker.server";

/** Work budget for one run. Well under Vercel's function duration (300s
 * with Fluid compute, on Hobby too), leaving room for the step that's in
 * flight when the budget runs out plus saving progress. */
export const RUN_BUDGET_MS = 25_000;

/** Path of the worker endpoint (routes/api.sync-worker.ts). Also the
 * Vercel Cron path in vercel.json. */
export const WORKER_PATH = "/api/sync-worker";

export async function enqueueSyncJob(
  connectionId: string,
  selection: string[],
) {
  const [job] = await db
    .insert(syncJobs)
    .values({ connectionId, selection, status: "QUEUED" })
    .returning();
  return job;
}

/** Asks the worker endpoint to run the job again, in a fresh invocation
 * with its own time budget. Skipped (the job then waits for the next page
 * visit or the daily cron) when CRON_SECRET or SHOPIFY_APP_URL isn't set. */
async function requestNextRun(jobId: string) {
  const secret = process.env.CRON_SECRET;
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!secret || !appUrl) {
    console.warn(
      `Sync job ${jobId} has work left, but CRON_SECRET or SHOPIFY_APP_URL isn't set, so it can't continue on its own.`,
    );
    return;
  }
  try {
    await fetch(new URL(WORKER_PATH, appUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    });
  } catch (error) {
    console.error(`Couldn't request the next run of sync job ${jobId}`, error);
  }
}

/** One time-boxed run of a job, then hands off to a fresh run if work is
 * left. Meant to be passed to `waitUntil`, so it never throws. */
export async function driveSyncJob(jobId: string): Promise<void> {
  try {
    const outcome = await processSyncJob(jobId, Date.now() + RUN_BUDGET_MS);
    if (outcome === "more") await requestNextRun(jobId);
  } catch (error) {
    console.error(`Sync job ${jobId} run failed`, error);
  }
}

/** Restarts unfinished jobs nobody is working on: one whose run died, or
 * whose hand-off to the next run was lost. Called by the daily cron and
 * whenever a connection's Job history page loads. Each restart is lock-protected, so
 * overlapping calls are harmless. Runs unattended in `waitUntil`, so it
 * never throws. */
export async function resumeStalledJobs(connectionId?: string): Promise<void> {
  try {
    await Promise.all(
      (await findStalledJobs(connectionId)).map((job) => driveSyncJob(job.id)),
    );
  } catch (error) {
    console.error("Couldn't look up stalled sync jobs", error);
  }
}

function findStalledJobs(connectionId?: string) {
  return db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(
      and(
        inArray(syncJobs.status, ["QUEUED", "RUNNING"]),
        or(isNull(syncJobs.lockedUntil), lt(syncJobs.lockedUntil, sql`now()`)),
        connectionId ? eq(syncJobs.connectionId, connectionId) : undefined,
      ),
    )
    .limit(5);
}
