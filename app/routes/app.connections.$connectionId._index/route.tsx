import { waitUntil } from "@vercel/functions";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";

import { isProStore } from "~/utils/billing/paidPlan.server";
import { setAutoSync } from "~/utils/sync/autoSync.server";
import { refreshMetaobjectSubscriptions } from "~/utils/sync/metaobjectSubscriptions.server";
import { requireConnectionPage } from "~/utils/sync/connectionRoute.server";
import { getJobHistory } from "~/utils/sync/sync.server";
import { resumeStalledJobs } from "~/utils/sync/syncQueue.server";

import { AutoSyncSetting } from "./components/AutoSyncSetting";
import { JobHistoryList } from "./components/JobHistoryList";
import { useRevalidateWhile } from "./hooks/useRevalidateWhile";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, role, isApproved } = await requireConnectionPage(args);

  // Picks up any of this connection's jobs whose run died or whose
  // hand-off was lost. The page polls while a job is unfinished, so an
  // open page keeps a stalled job moving even though Hobby's cron only
  // runs daily.
  waitUntil(resumeStalledJobs(connection.id));

  return {
    jobs: await getJobHistory(connection.id),
    autoSync: connection.autoSync,
    canChangeAutoSync: role === "source" && isApproved,
  };
};

/** The auto-sync switch. Only the source can change it: it's the source's
 * edits that trigger syncs into the target. */
export const action = async (args: ActionFunctionArgs) => {
  const { connection, role, isApproved, sourceAdmin } =
    await requireConnectionPage(args);
  const formData = await args.request.formData();
  if (formData.get("intent") !== "autoSync") {
    throw data("Unknown intent.", { status: 400 });
  }
  if (role !== "source" || !isApproved) {
    throw data("Only the source store can change auto-sync.", {
      status: 403,
    });
  }
  const enabled = formData.get("enabled") === "true";
  if (enabled && !(await isProStore(sourceAdmin))) {
    return {
      ok: false,
      error: "Auto-sync is part of StoreBridge Pro. Upgrade on the Plan page.",
    } as const;
  }
  const result = await setAutoSync(connection, enabled);
  // Metaobject webhooks are per store (#149), so they follow the switch.
  if (result.ok) {
    waitUntil(refreshMetaobjectSubscriptions(connection.source.shop));
  }
  return result;
};

/** Every sync run on this connection (from any of the type pages),
 * newest first, refreshing on its own while one is still going. Both
 * stores see the same history: there's only the one target. */
export default function ConnectionJobHistory() {
  const { jobs, autoSync, canChangeAutoSync } = useLoaderData<typeof loader>();
  useRevalidateWhile(
    jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING"),
  );

  return (
    <>
      <s-section heading="Auto-sync">
        <AutoSyncSetting enabled={autoSync} canChange={canChangeAutoSync} />
      </s-section>
      <s-section heading="Job history">
        <JobHistoryList jobs={jobs} />
      </s-section>
    </>
  );
}
