import { useFetcher } from "react-router";

import type { AutoSyncResult } from "~/utils/sync/autoSync.server";

interface AutoSyncSettingProps {
  enabled: boolean;
  /** Only the source turns it on, and only once the target approved. */
  canChange: boolean;
}

/** The connection's auto-sync switch (#65), saved as soon as it's
 * changed. */
export function AutoSyncSetting({ enabled, canChange }: AutoSyncSettingProps) {
  const fetcher = useFetcher<AutoSyncResult>();
  const saving = fetcher.state !== "idle";
  // Show the requested state while saving, so the box doesn't flick back.
  const pending = fetcher.formData?.get("enabled");
  const checked = pending === undefined ? enabled : pending === "true";

  return (
    <s-stack gap="small-100">
      <s-checkbox
        label="Auto-sync"
        details="When a metafield definition, metaobject, collection or location changes on the source, run the last sync again. Deletes aren't synced."
        checked={checked}
        disabled={!canChange || saving}
        onChange={(e) =>
          fetcher.submit(
            { intent: "autoSync", enabled: String(e.currentTarget.checked) },
            { method: "post" },
          )
        }
      ></s-checkbox>
      {fetcher.data?.ok === false && (
        <s-banner tone="critical">{fetcher.data.error}</s-banner>
      )}
    </s-stack>
  );
}
