import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import db from "~/db.server";
import { connections } from "~/db/schema.server";
import { syncJobItems, syncJobs } from "~/db/syncJobsSchema.server";
import { unauthenticated } from "~/shopify.server";

import { parseSelection, resolvePlan } from "./sync.server";
import {
  buildSyncSteps,
  createStepContext,
  runSyncSteps,
  tallyItems,
  type SyncPlan,
} from "./syncTarget.server";

/** Longer than one run's work budget plus a slow final step, so a live run
 * never loses its lock, but short enough that a run that died is retried
 * soon after. */
const LOCK_SECONDS = 90;

export type RunOutcome = "done" | "more" | "busy";

type JobRow = typeof syncJobs.$inferSelect;

const UNFINISHED = ["QUEUED", "RUNNING"] as const;

/** Atomically takes the job's lock, or returns undefined if another run
 * holds it or the job has already finished. */
async function claimJob(jobId: string): Promise<JobRow | undefined> {
  const [job] = await db
    .update(syncJobs)
    .set({ lockedUntil: sql`now() + make_interval(secs => ${LOCK_SECONDS})` })
    .where(
      and(
        eq(syncJobs.id, jobId),
        inArray(syncJobs.status, [...UNFINISHED]),
        or(isNull(syncJobs.lockedUntil), lt(syncJobs.lockedUntil, sql`now()`)),
      ),
    )
    .returning();
  return job;
}

async function finishJob(
  jobId: string,
  outcome: { status: "SUCCEEDED" | "FAILED"; error?: string },
) {
  await db
    .update(syncJobs)
    .set({
      status: outcome.status,
      errorMessage: outcome.error ?? null,
      finishedAt: new Date(),
      plan: null,
      lockedUntil: null,
    })
    .where(eq(syncJobs.id, jobId));
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

async function loadConnection(connectionId: string) {
  const connection = await db.query.connections.findFirst({
    where: eq(connections.id, connectionId),
    with: { source: true, target: true },
  });
  if (!connection) throw new Error("This connection no longer exists.");
  return connection;
}

type Connection = Awaited<ReturnType<typeof loadConnection>>;

/** First run of a job: snapshot the plan from the source. Returns false
 * when the job finished here (nothing to sync, or not approved). */
async function planJob(
  job: JobRow,
  connection: Connection,
  sourceAdmin: Parameters<typeof resolvePlan>[0],
): Promise<boolean> {
  if (connection.status !== "APPROVED") {
    await finishJob(job.id, {
      status: "FAILED",
      error: `${connection.target.shop} hasn't approved this connection.`,
    });
    return false;
  }
  const plan = await resolvePlan(sourceAdmin, parseSelection(job.selection));

  // None of the selection keys matched anything in the source's current
  // catalog (stale UI, or a forged post). Running would do zero work and
  // still report SUCCEEDED, so fail the job outright instead.
  if (Object.values(plan).every((list) => list.length === 0)) {
    await finishJob(job.id, {
      status: "FAILED",
      error: "None of the selected items exist on the source store anymore.",
    });
    return false;
  }

  const stepsTotal = buildSyncSteps(plan).length;
  await db
    .update(syncJobs)
    .set({ plan, status: "RUNNING", stepsTotal })
    .where(eq(syncJobs.id, job.id));
  Object.assign(job, { plan, stepsTotal });
  return true;
}

/** Works the job from its saved step index until done or `deadline`,
 * persisting the run's items and progress. Steps are idempotent upserts,
 * so if a run dies before saving, redoing those steps is harmless.
 * Returns whether every step is done. */
async function workJob(
  job: JobRow,
  context: {
    connection: Connection;
    sourceAdmin: Parameters<typeof resolvePlan>[0];
    deadline: number;
  },
): Promise<boolean> {
  const { admin: targetAdmin } = await unauthenticated.admin(
    context.connection.target.shop,
  );
  const steps = buildSyncSteps(job.plan as SyncPlan);
  const { items, next } = await runSyncSteps({
    steps,
    ctx: createStepContext(context.sourceAdmin, targetAdmin),
    from: job.stepsDone,
    deadline: context.deadline,
  });
  if (items.length > 0) {
    await db
      .insert(syncJobItems)
      .values(items.map((item) => ({ jobId: job.id, ...item })));
  }
  const tallies = tallyItems(items);
  const itemsFailed = job.itemsFailed + tallies.itemsFailed;
  await db
    .update(syncJobs)
    .set({
      stepsDone: next,
      itemsSynced: job.itemsSynced + tallies.itemsSynced,
      itemsSkipped: job.itemsSkipped + tallies.itemsSkipped,
      itemsFailed,
    })
    .where(eq(syncJobs.id, job.id));

  if (next < steps.length) return false;
  await finishJob(job.id, {
    status: itemsFailed === 0 ? "SUCCEEDED" : "FAILED",
  });
  return true;
}

/**
 * One worker run for one job, bounded by `deadline` (epoch ms). Returns
 * "done" when the job finished, "more" when work is left for another run,
 * and "busy" when another run holds the lock (or the job already ended).
 */
export async function processSyncJob(
  jobId: string,
  deadline: number,
): Promise<RunOutcome> {
  const job = await claimJob(jobId);
  if (!job) return "busy";

  try {
    const connection = await loadConnection(job.connectionId);
    const { admin: sourceAdmin } = await unauthenticated.admin(
      connection.source.shop,
    );
    if (!job.plan && !(await planJob(job, connection, sourceAdmin))) {
      return "done";
    }
    const done = await workJob(job, { connection, sourceAdmin, deadline });
    return done ? "done" : "more";
  } catch (error) {
    await finishJob(job.id, {
      status: "FAILED",
      error: errorText(error, "Couldn't reach one of the stores."),
    });
    return "done";
  } finally {
    // Release early so the next run doesn't wait out the lock. Harmless
    // after finishJob, which already cleared it.
    await db
      .update(syncJobs)
      .set({ lockedUntil: null })
      .where(eq(syncJobs.id, job.id));
  }
}
