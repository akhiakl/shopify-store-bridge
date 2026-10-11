import { SyncStatusBadge } from "~/components/SyncStatusBadge";
import { describeStylingArea } from "~/utils/describeStylingArea";
import type { StylingAreaDiff } from "~/utils/sync/checkoutStylingAreas";
import {
  checkoutOverrideKey,
  checkoutStylingAreaKey,
} from "~/utils/sync/definitionKey";

import type { OverrideStatus } from "../utils/getCheckoutOverview.server";
import { StylingAreaRow } from "./StylingAreaRow";

interface CheckoutStylingSectionProps {
  areas: StylingAreaDiff[];
  overrides: OverrideStatus[];
  compared: boolean;
  targetShop: string;
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/** Areas in page order, grouped under where in checkout they apply. */
function bySection(areas: StylingAreaDiff[]) {
  const sections = new Map<string, StylingAreaDiff[]>();
  for (const diff of areas) {
    const { section } = describeStylingArea(diff.area);
    sections.set(section, [...(sections.get(section) ?? []), diff]);
  }
  return [...sections];
}

function overrideDetails(override: OverrideStatus): string {
  if (override.status === "MISSING") {
    return "The target has no market override with this name. Create it in the target's checkout editor, then sync it here.";
  }
  const areas = `${override.areaCount} area${override.areaCount === 1 ? "" : "s"}`;
  return override.outOfSyncCount
    ? `${areas}, ${override.outOfSyncCount} differ`
    : areas;
}

function badge(targetShop: string, status: OverrideStatus["status"]) {
  if (!status) return null;
  const mapped = status === "MISSING" ? "NOT_SYNCED" : status;
  return (
    <SyncStatusBadge
      summary={{
        inSyncCount: mapped === "IN_SYNC" ? 1 : 0,
        totalTargets: 1,
        perTarget: [{ targetId: targetShop, shop: targetShop, status: mapped }],
      }}
    />
  );
}

/**
 * Every part of the source's checkout look the sync can copy, each one
 * selectable with its own status, and the settings inside it beside the
 * target's. Syncing an area makes it identical on the target, including
 * resetting settings only the target has.
 */
export function CheckoutStylingSection({
  areas,
  overrides,
  compared,
  targetShop,
  selected,
  onToggle,
}: CheckoutStylingSectionProps) {
  const syncable = overrides.filter((o) => o.status !== "MISSING");
  const keys = [
    ...areas.map((diff) => checkoutStylingAreaKey(diff.area)),
    ...syncable.map((o) => checkoutOverrideKey(o.name)),
  ];
  const outOfSync = [
    ...areas
      .filter((diff) => !diff.inSync)
      .map((diff) => checkoutStylingAreaKey(diff.area)),
    ...syncable
      .filter((o) => o.status === "OUT_OF_SYNC")
      .map((o) => checkoutOverrideKey(o.name)),
  ];
  const selectedCount = keys.filter((key) => selected.has(key)).length;
  const inSyncCount = compared
    ? areas.filter((diff) => diff.inSync).length
    : null;

  if (areas.length === 0 && overrides.length === 0) {
    return (
      <s-paragraph>
        Neither store customizes its checkout styling, so there&apos;s nothing
        to sync.
      </s-paragraph>
    );
  }

  return (
    <s-stack gap="base">
      <s-paragraph>
        Syncing an area makes it identical on {targetShop}: its settings are
        copied, and any the target sets that the source doesn&apos;t are reset
        to Shopify&apos;s default. Logos and custom fonts are copied as files.
        {inSyncCount !== null &&
          ` ${inSyncCount} of ${areas.length} areas are in sync.`}
      </s-paragraph>
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-checkbox
          label={`Select all (${keys.length})`}
          checked={keys.length > 0 && selectedCount === keys.length}
          indeterminate={selectedCount > 0 && selectedCount < keys.length}
          onChange={(e) => onToggle(keys, e.currentTarget.checked)}
        ></s-checkbox>
        {compared && outOfSync.length > 0 && (
          <s-button
            variant="tertiary"
            onClick={() => onToggle(outOfSync, true)}
          >
            {`Select out of sync (${outOfSync.length})`}
          </s-button>
        )}
      </s-stack>

      {bySection(areas).map(([section, diffs]) => (
        <s-stack key={section} gap="small-200">
          <s-heading>{section}</s-heading>
          {diffs.map((diff) => {
            const key = checkoutStylingAreaKey(diff.area);
            return (
              <StylingAreaRow
                key={key}
                diff={diff}
                compared={compared}
                targetShop={targetShop}
                checked={selected.has(key)}
                onToggle={(select) => onToggle([key], select)}
              />
            );
          })}
        </s-stack>
      ))}

      {overrides.length > 0 && (
        <s-stack gap="small-200">
          <s-heading>Market overrides</s-heading>
          <s-paragraph>
            Matched by name. Shopify doesn&apos;t let apps create overrides, so
            one must already exist on the target.
          </s-paragraph>
          {overrides.map((override) => {
            const key = checkoutOverrideKey(override.name);
            return (
              <s-grid
                key={key}
                gridTemplateColumns="1fr auto"
                gap="base"
                alignItems="center"
              >
                <s-checkbox
                  label={override.name}
                  details={overrideDetails(override)}
                  disabled={override.status === "MISSING"}
                  checked={selected.has(key)}
                  onChange={(e) => onToggle([key], e.currentTarget.checked)}
                ></s-checkbox>
                {badge(targetShop, override.status)}
              </s-grid>
            );
          })}
        </s-stack>
      )}
    </s-stack>
  );
}
