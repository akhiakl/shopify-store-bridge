import { useFetcher } from "react-router";

import type { StatusCheckResult } from "~/utils/sync/connectionRoute.server";

/**
 * The on-demand "Check sync status" run for a definitions page, plus the
 * keys that aren't in sync on every target. `keyPrefix` keeps it to this
 * page's own type: the check compares metafield and metaobject
 * definitions together, and selecting another page's keys would sync
 * things this page doesn't show.
 */
export function useStatusCheck(keyPrefix: string) {
  const fetcher = useFetcher<StatusCheckResult>();
  const statuses =
    fetcher.data?.ok === true ? fetcher.data.statuses : undefined;

  const outOfDateKeys = statuses
    ? Object.entries(statuses)
        .filter(
          ([key, summary]) =>
            key.startsWith(keyPrefix) &&
            summary.inSyncCount < summary.totalTargets,
        )
        .map(([key]) => key)
    : [];

  return { fetcher, statuses, outOfDateKeys };
}
