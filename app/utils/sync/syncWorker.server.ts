import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import db from "~/db.server";
import { syncGroups } from "~/db/schema.server";
import {
  syncJobItems,
  syncJobs,
  syncJobTargets,
} from "~/db/syncJobsSchema.server";
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
type TargetStatus = "SUCCEEDED" | "FAILED" | "SKIPPED" | "PENDING";

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
  outcome: { status: "SUCCEEDED" | "FAILED" | "PARTIAL"; error?: string },
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

function rollUp(statuses: TargetStatus[]): "SUCCEEDED" | "FAILED" | "PARTIAL" {
  if (statuses.every((s) => s === "SUCCEEDED")) return "SUCCEEDED";
  if (statuses.every((s) => s === "FAILED")) return "FAILED";
  return "PARTIAL";
}

type Source = Awaited<ReturnType<typeof sourceAdminFor>>;

async function sourceAdminFor(groupId: string) {
  const group = await db.query.syncGroups.findFirst({
    where: eq(syncGroups.id, groupId),
    with: { source: true, targets: true },
  });
  if (!group) throw new Error("This sync group no longer exists.");
  const { admin } = await unauthenticated.admin(group.source.shop);
  return { group, sourceAdmin: admin };
}

/** First run of a job: snapshot the plan from the source and create one
 * PENDING row per target that's APPROVED right now. Returns false when
 * the job finished here (nothing to sync, or no approved targets). */
async function planJob(
  job: JobRow,
  { group, sourceAdmin }: Source,
): Promise<boolean> {
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

  const approved = group.targets.filter((t) => t.status === "APPROVED");
  if (approved.length === 0) {
    await finishJob(job.id, { status: "SUCCEEDED" });
    return false;
  }
  const stepsTotal = buildSyncSteps(plan).length;
  await db.insert(syncJobTargets).values(
    approved.map((target) => ({
      jobId: job.id,
      storeId: target.storeId,
      status: "PENDING" as const,
      stepsTotal,
    })),
  );
  await db
    .update(syncJobs)
    .set({ plan, status: "RUNNING" })
    .where(eq(syncJobs.id, job.id));
  job.plan = plan;
  return true;
}

type PendingTarget = typeof syncJobTargets.$inferSelect & {
  store: { shop: string };
};

/** Works one target from its saved step index until done or `deadline`,
 * persisting the run's items and progress. Steps are idempotent upserts,
 * so if a run dies before saving, redoing those steps is harmless. */
async function workTarget(
  target: PendingTarget,
  context: { plan: SyncPlan; sourceAdmin: AdminApiContext; deadline: number },
) {
  try {
    const { admin: targetAdmin } = await unauthenticated.admin(
      target.store.shop,
    );
    const steps = buildSyncSteps(context.plan);
    const { items, next } = await runSyncSteps({
      steps,
      ctx: createStepContext(context.sourceAdmin, targetAdmin),
      from: target.stepsDone,
      deadline: context.deadline,
    });
    if (items.length > 0) {
      await db
        .insert(syncJobItems)
        .values(items.map((item) => ({ jobTargetId: target.id, ...item })));
    }
    const tallies = tallyItems(items);
    const failed = target.itemsFailed + tallies.itemsFailed;
    const done = next >= steps.length;
    await db
      .update(syncJobTargets)
      .set({
        stepsDone: next,
        itemsSynced: target.itemsSynced + tallies.itemsSynced,
        itemsSkipped: target.itemsSkipped + tallies.itemsSkipped,
        itemsFailed: failed,
        status: !done ? "PENDING" : failed === 0 ? "SUCCEEDED" : "FAILED",
      })
      .where(eq(syncJobTargets.id, target.id));
  } catch (error) {
    await db
      .update(syncJobTargets)
      .set({
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Couldn't reach this store.",
      })
      .where(eq(syncJobTargets.id, target.id));
  }
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

  let source: Source;
  try {
    source = await sourceAdminFor(job.groupId);
    if (!job.plan && !(await planJob(job, source))) return "done";
  } catch (error) {
    await finishJob(job.id, {
      status: "FAILED",
      error:
        error instanceof Error
          ? error.message
          : "Couldn't read the source store.",
    });
    return "done";
  }

  try {
    const pending = await db.query.syncJobTargets.findMany({
      where: and(
        eq(syncJobTargets.jobId, job.id),
        eq(syncJobTargets.status, "PENDING"),
      ),
      with: { store: true },
    });
    for (const target of pending) {
      if (Date.now() >= deadline) break;
      await workTarget(target, {
        plan: job.plan as SyncPlan,
        sourceAdmin: source.sourceAdmin,
        deadline,
      });
    }

    const targets = await db.query.syncJobTargets.findMany({
      where: eq(syncJobTargets.jobId, job.id),
    });
    if (targets.some((t) => t.status === "PENDING")) return "more";
    await finishJob(job.id, { status: rollUp(targets.map((t) => t.status)) });
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
