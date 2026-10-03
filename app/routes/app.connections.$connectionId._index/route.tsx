import { waitUntil } from "@vercel/functions";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { requireConnectionPage } from "~/utils/sync/connectionRoute.server";
import { getJobHistory } from "~/utils/sync/sync.server";
import { resumeStalledJobs } from "~/utils/sync/syncQueue.server";

import { JobHistoryList } from "./components/JobHistoryList";
import { useRevalidateWhile } from "./hooks/useRevalidateWhile";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection } = await requireConnectionPage(args);

  // Picks up any of this connection's jobs whose run died or whose
  // hand-off was lost. The page polls while a job is unfinished, so an
  // open page keeps a stalled job moving even though Hobby's cron only
  // runs daily.
  waitUntil(resumeStalledJobs(connection.id));

  return { jobs: await getJobHistory(connection.id) };
};

/** Every sync run on this connection (from any of the type pages),
 * newest first, refreshing on its own while one is still going. Both
 * stores see the same history: there's only the one target. */
export default function ConnectionJobHistory() {
  const { jobs } = useLoaderData<typeof loader>();
  useRevalidateWhile(
    jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING"),
  );

  return (
    <s-section heading="Job history">
      <JobHistoryList jobs={jobs} />
    </s-section>
  );
}
