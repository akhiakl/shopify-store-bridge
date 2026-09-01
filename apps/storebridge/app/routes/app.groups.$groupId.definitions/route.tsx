import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import { JobHistoryList } from "./components/JobHistoryList";
import { MetafieldDefinitionsSection } from "./components/MetafieldDefinitionsSection";
import { MetaobjectDefinitionsSection } from "./components/MetaobjectDefinitionsSection";
import { SyncButton } from "./components/SyncButton";
import { getDefinitionCatalog, getOwnedGroup } from "./definitions.server";
import { getJobHistory, runSyncJob } from "./sync.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const groupId = params.groupId as string;

  const group = await getOwnedGroup(groupId, session.shop);
  if (!group) {
    throw data("Sync group not found.", { status: 404 });
  }

  const [catalog, jobs] = await Promise.all([
    getDefinitionCatalog(admin),
    getJobHistory(group.id),
  ]);
  return { group, jobs, ...catalog };
};

/** Handles the "sync" intent — kicks off one `runSyncJob` run for the
 * selected definitions. `session.shop` (never form input) re-confirms
 * group ownership via `getOwnedGroup`, same guard the loader already
 * applies, since an action can be posted independently of the loader. */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const groupId = params.groupId as string;

  const group = await getOwnedGroup(groupId, session.shop);
  if (!group) {
    throw data("Sync group not found.", { status: 404 });
  }

  const formData = await request.formData();
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

  const job = await runSyncJob({ group, selection, sourceAdmin: admin });
  return { ok: true, jobId: job.id, status: job.status } as const;
};

export default function GroupDefinitions() {
  const { group, jobs, metafieldDefinitions, metaobjectDefinitions } =
    useLoaderData<typeof loader>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  return (
    <s-page heading={`Sync definitions — ${group.name || "Untitled group"}`}>
      <s-section heading="Source">
        <s-paragraph>
          Browsing definitions on {group.source.shop}. Select definitions below
          and sync them to this group&apos;s approved target stores.
        </s-paragraph>
      </s-section>

      <s-section heading="Metafield definitions">
        <MetafieldDefinitionsSection
          definitions={metafieldDefinitions}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>

      <s-section heading="Metaobject definitions">
        <MetaobjectDefinitionsSection
          definitions={metaobjectDefinitions}
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
