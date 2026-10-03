import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { waitUntil } from "@vercel/functions";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";

import { authenticate } from "~/shopify.server";

import { getConnectionAccess, sourceAdminFor } from "./connectionAccess.server";
import { driveSyncJob, enqueueSyncJob } from "./syncQueue.server";
import {
  runStatusCheck,
  type DefinitionStatusSummary,
} from "./syncStatus.server";

export type StatusCheckResult =
  | { ok: true; statuses: Record<string, DefinitionStatusSummary> }
  | { ok: false; error: string };

/**
 * Shared guard for every page under /app/connections/:connectionId. Each
 * page's loader and action calls it itself (React Router runs a layout's
 * loader in parallel with its children's, so a child can't rely on the
 * layout's check). 404s for a shop with no access (see
 * getConnectionAccess). `sourceAdmin` is the client to browse with: the
 * source's own catalog even when the target is viewing.
 */
export async function requireConnectionPage({
  request,
  params,
}: LoaderFunctionArgs | ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const access = await getConnectionAccess(
    params.connectionId as string,
    session.shop,
  );
  if (!access) {
    throw data("Connection not found.", { status: 404 });
  }
  const sourceAdmin: AdminApiContext = await sourceAdminFor(access, admin);
  return {
    ...access,
    sourceAdmin,
    isApproved: access.connection.status === "APPROVED",
  };
}

/** Handles the "sync" and "checkStatus" intents for any connection page:
 * each page posts only its own type's selection keys, and the worker
 * re-reads everything from the source anyway (never trusts the form). */
export async function connectionPageAction(args: ActionFunctionArgs) {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);

  const formData = await args.request.formData();
  const intent = formData.get("intent");

  if (intent === "checkStatus") {
    const statuses = await runStatusCheck({ connection, sourceAdmin });
    return { ok: true, statuses } satisfies StatusCheckResult;
  }

  if (intent !== "sync") {
    throw data("Unknown intent.", { status: 400 });
  }
  const selection = formData.getAll("selection").map(String);
  if (selection.length === 0) {
    return { ok: false, error: "Select at least one item." } as const;
  }
  if (!isApproved) {
    return {
      ok: false,
      error: `${connection.target.shop} hasn't approved this connection yet.`,
    } as const;
  }

  // Runs in the background: the first run starts now, after the response
  // is sent, and hands off to further runs until the job is done.
  const job = await enqueueSyncJob(connection.id, selection);
  waitUntil(driveSyncJob(job.id));
  return { ok: true, jobId: job.id } as const;
}
