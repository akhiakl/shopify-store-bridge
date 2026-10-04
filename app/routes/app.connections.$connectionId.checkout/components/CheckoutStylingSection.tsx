import { SyncStatusBadge } from "~/components/SyncStatusBadge";
import { CHECKOUT_STYLING_KEY } from "~/utils/sync/definitionKey";
import type { StylingSummary } from "~/utils/sync/checkoutStyling.server";
import type { DefinitionSyncStatus } from "~/utils/sync/syncStatus.server";

interface CheckoutStylingSectionProps {
  summary: StylingSummary;
  status: DefinitionSyncStatus | null;
  targetShop: string;
  selected: Set<string>;
  onToggle: (keys: string[], select: boolean) => void;
}

/** The source's checkout look as one selectable item, with its palette and
 * fonts shown so a merchant can tell what they're about to copy. */
export function CheckoutStylingSection({
  summary,
  status,
  targetShop,
  selected,
  onToggle,
}: CheckoutStylingSectionProps) {
  return (
    <s-stack gap="base">
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-checkbox
          label="Checkout & accounts styling"
          details="Colors, fonts, corners, logos and layout for checkout, customer accounts and sign-in. Market-specific overrides aren't copied."
          checked={selected.has(CHECKOUT_STYLING_KEY)}
          onChange={(e) =>
            onToggle([CHECKOUT_STYLING_KEY], e.currentTarget.checked)
          }
        ></s-checkbox>
        <SyncStatusBadge
          summary={
            status
              ? {
                  inSyncCount: status === "IN_SYNC" ? 1 : 0,
                  totalTargets: 1,
                  perTarget: [
                    { targetId: targetShop, shop: targetShop, status },
                  ],
                }
              : undefined
          }
        />
      </s-grid>

      {summary.colors.length > 0 && (
        <s-stack gap="small-200">
          <s-text type="strong">Colors</s-text>
          <s-stack direction="inline" gap="small-200">
            {summary.colors.map((color, index) => (
              <span
                key={`${color}-${index}`}
                title={color}
                aria-label={color}
                style={{
                  display: "inline-block",
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  background: color,
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                }}
              />
            ))}
          </s-stack>
        </s-stack>
      )}

      {(summary.fonts.length > 0 || summary.baseSize !== null) && (
        <s-stack gap="small-200">
          <s-text type="strong">Typography</s-text>
          {summary.fonts.map((font) => (
            <s-text key={font.role}>{`${font.role}: ${font.name}`}</s-text>
          ))}
          {summary.baseSize !== null && (
            <s-text>{`Base size: ${summary.baseSize}px`}</s-text>
          )}
        </s-stack>
      )}
    </s-stack>
  );
}
