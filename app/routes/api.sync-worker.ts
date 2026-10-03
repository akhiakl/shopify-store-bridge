import { createHash, timingSafeEqual } from "node:crypto";

import { waitUntil } from "@vercel/functions";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { driveSyncJob, resumeStalledJobs } from "~/utils/sync/syncQueue.server";

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`, the
 * header Vercel Cron sends. Hashing both sides first gives equal-length
 * buffers, so the comparison can't leak the secret's length either.
 * Fails closed when CRON_SECRET isn't set. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}

/** Vercel Cron (GET, daily on Hobby): restart any job whose run died or
 * whose hand-off to the next run was lost. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthorized(request)) return new Response(null, { status: 401 });
  waitUntil(resumeStalledJobs());
  return new Response(null, { status: 202 });
};

/** A run that had work left asks for the next one here (POST { jobId }).
 * Responds immediately; the run itself continues in `waitUntil`, so the
 * caller never waits on the whole chain. */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!isAuthorized(request)) return new Response(null, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    jobId?: unknown;
  } | null;
  if (typeof body?.jobId !== "string") {
    return new Response(null, { status: 400 });
  }
  waitUntil(driveSyncJob(body.jobId));
  return new Response(null, { status: 202 });
};
