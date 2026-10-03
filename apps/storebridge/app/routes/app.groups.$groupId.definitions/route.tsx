import { useState } from "react";
import { waitUntil } from "@vercel/functions";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import { CheckStatusButton } from "./components/CheckStatusButton";
import { JobHistoryList } from "./components/JobHistoryList";
import { MetafieldDefinitionsSection } from "./components/MetafieldDefinitionsSection";
import { MetafieldValuesSection } from "./components/MetafieldValuesSection";
import { MetaobjectDefinitionsSection } from "./components/MetaobjectDefinitionsSection";
import { MetaobjectEntriesSection } from "./components/MetaobjectEntriesSection";
import { getCollections } from "~/utils/sync/collections.server";
import { CollectionsSection } from "./components/CollectionsSection";
import { ShopPoliciesSection } from "./components/ShopPoliciesSection";
import { SyncButton } from "./components/SyncButton";
import { useRevalidateWhile } from "./hooks/useRevalidateWhile";
import {
  getDefinitionCatalog,
  getOwnedGroup,
  getShopPolicies,
} from "~/utils/sync/definitions.server";
import { getJobHistory } from "~/utils/sync/sync.server";
import {
  driveSyncJob,
  enqueueSyncJob,
  resumeStalledJobs,
} from "~/utils/sync/syncQueue.server";
import {
  runStatusCheck,
  type DefinitionStatusSummary,
} from "./syncStatus.server";

export type StatusCheckResult =
  | { ok: true; statuses: Record<string, DefinitionStatusSummary> }
  | { ok: false; error: string };

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const groupId = params.groupId as string;

  const group = await getOwnedGroup(groupId, session.shop);
  if (!group) {
    throw data("Sync group not found.", { status: 404 });
  }

  // Picks up any of this group's jobs whose run died or whose hand-off was
  // lost. The page polls while a job is unfinished, so an open page keeps
  // a stalled job moving even though Hobby's cron only runs daily.
  waitUntil(resumeStalledJobs(group.id));

  const [catalog, shopPolicies, collections, jobs] = await Promise.all([
    getDefinitionCatalog(admin),
    getShopPolicies(admin),
    getCollections(admin),
    getJobHistory(group.id),
  ]);
  return { group, jobs, shopPolicies, collections, ...catalog };
};

/** Handles the "sync" and "checkStatus" intents. `session.shop` (never
 * form input) re-confirms group ownership via `getOwnedGroup`, same guard
 * the loader already applies, since an action can be posted independently
 * of the loader — resilient to an unexpected post, and keeps behavior
 * consistent if more intents are added later. */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const groupId = params.groupId as string;

  const group = await getOwnedGroup(groupId, session.shop);
  if (!group) {
    throw data("Sync group not found.", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "checkStatus") {
    const statuses = await runStatusCheck({ group, sourceAdmin: admin });
    return { ok: true, statuses } satisfies StatusCheckResult;
  }

  if (intent !== "sync") {
    throw data("Unknown intent.", { status: 400 });
  }
  const selection = formData.getAll("selection").map(String);
  if (selection.length === 0) {
    return { ok: false, error: "Select at least one definition." } as const;
  }
  if (!group.targets.some((target) => target.status === "APPROVED")) {
    return {
      ok: false,
      error: "This group has no approved target stores yet.",
    } as const;
  }

  // Runs in the background: the first run starts now, after the response
  // is sent, and hands off to further runs until the job is done.
  const job = await enqueueSyncJob(group.id, selection);
  waitUntil(driveSyncJob(job.id));
  return { ok: true, jobId: job.id } as const;
};

export default function GroupDefinitions() {
  const {
    group,
    jobs,
    metafieldDefinitions,
    metaobjectDefinitions,
    shopPolicies,
    collections,
  } = useLoaderData<typeof loader>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useRevalidateWhile(
    jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING"),
  );
  const statusFetcher = useFetcher<StatusCheckResult>();
  const approvedTargetCount = group.targets.filter(
    (target) => target.status === "APPROVED",
  ).length;

  const toggleKeys = (keys: string[], select: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const statuses =
    statusFetcher.data?.ok === true ? statusFetcher.data.statuses : undefined;

  const selectOutOfDate = () => {
    if (!statuses) return;
    const keys = Object.entries(statuses)
      .filter(([, summary]) => summary.inSyncCount < summary.totalTargets)
      .map(([key]) => key);
    toggleKeys(keys, true);
  };

  return (
    <s-page heading={`Sync definitions — ${group.name || "Untitled group"}`}>
      <s-section heading="Source">
        <s-paragraph>
          Browsing definitions on {group.source.shop}. Select definitions below
          and sync them to this group&apos;s approved target stores.
        </s-paragraph>
        <CheckStatusButton
          fetcher={statusFetcher}
          approvedTargetCount={approvedTargetCount}
        />
        {statuses && (
          <s-button onClick={selectOutOfDate}>
            Select what needs syncing
          </s-button>
        )}
      </s-section>

      <s-section heading="Metafield definitions">
        <MetafieldDefinitionsSection
          definitions={metafieldDefinitions}
          selected={selected}
          onToggle={toggleKeys}
          statusByKey={statuses}
        />
      </s-section>

      <s-section heading="Metaobject definitions">
        <MetaobjectDefinitionsSection
          definitions={metaobjectDefinitions}
          selected={selected}
          onToggle={toggleKeys}
          statusByKey={statuses}
        />
      </s-section>

      <s-section heading="Metaobject entries">
        <MetaobjectEntriesSection
          definitions={metaobjectDefinitions}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>

      <s-section heading="Metafield values">
        <MetafieldValuesSection
          definitions={metafieldDefinitions}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>

      <s-section heading="Shop policies">
        <ShopPoliciesSection
          policies={shopPolicies}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>

      <s-section heading="Collections">
        <CollectionsSection
          collections={collections}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>

      <s-section heading="Sync">
        <SyncButton
          selected={selected}
          approvedTargetCount={approvedTargetCount}
        />
      </s-section>

      <s-section heading="Job history">
        <JobHistoryList jobs={jobs} />
      </s-section>
    </s-page>
  );
}
