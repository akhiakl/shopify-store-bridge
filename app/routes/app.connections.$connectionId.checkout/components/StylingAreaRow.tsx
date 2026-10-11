import { SyncStatusBadge } from "~/components/SyncStatusBadge";
import { describeStylingArea } from "~/utils/describeStylingArea";
import type { StylingAreaDiff } from "~/utils/sync/checkoutStylingAreas";

import { StylingValueText } from "./StylingValueText";

interface StylingAreaRowProps {
  diff: StylingAreaDiff;
  /** False until the target approves: no target column or status yet. */
  compared: boolean;
  targetShop: string;
  checked: boolean;
  onToggle: (select: boolean) => void;
}

function details(diff: StylingAreaDiff, compared: boolean): string {
  const count = diff.rows.length;
  const settings = `${count} setting${count === 1 ? "" : "s"}`;
  if (!compared) return settings;
  const differ = diff.rows.filter((row) => !row.same).length;
  return differ ? `${settings}, ${differ} differ` : settings;
}

/** One area as a selectable row with its status, and every setting in it
 * side by side: what syncing it would write and what the target has. */
export function StylingAreaRow({
  diff,
  compared,
  targetShop,
  checked,
  onToggle,
}: StylingAreaRowProps) {
  const { name } = describeStylingArea(diff.area);
  return (
    <s-stack gap="small-200">
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-checkbox
          label={name}
          details={details(diff, compared)}
          checked={checked}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        ></s-checkbox>
        {compared && (
          <SyncStatusBadge
            summary={{
              inSyncCount: diff.inSync ? 1 : 0,
              totalTargets: 1,
              perTarget: [
                {
                  targetId: targetShop,
                  shop: targetShop,
                  status: diff.inSync ? "IN_SYNC" : "OUT_OF_SYNC",
                },
              ],
            }}
          />
        )}
      </s-grid>
      <details>
        <summary>Show settings</summary>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Setting</s-table-header>
            <s-table-header listSlot="inline">Source</s-table-header>
            {compared && (
              <s-table-header listSlot="secondary">Target</s-table-header>
            )}
          </s-table-header-row>
          <s-table-body>
            {diff.rows.map((row) => (
              <s-table-row key={row.setting}>
                <s-table-cell>
                  <s-text type={row.same || !compared ? undefined : "strong"}>
                    {row.setting
                      ? describeStylingArea(diff.area, row.setting).name
                      : name}
                  </s-text>
                </s-table-cell>
                <s-table-cell>
                  <StylingValueText value={row.source} />
                </s-table-cell>
                {compared && (
                  <s-table-cell>
                    <StylingValueText value={row.target} />
                  </s-table-cell>
                )}
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </details>
    </s-stack>
  );
}
