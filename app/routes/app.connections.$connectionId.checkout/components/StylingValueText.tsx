import type { StylingValue } from "~/utils/sync/checkoutStylingAreas";

const HEX = /^#[0-9a-f]{3,8}$/i;
const PALETTE_REF = /^--palette-color-(\d+)$/;

/** One setting's value: a swatch beside colors, palette references by
 * their editor name, and "Not set" for a default. */
export function StylingValueText({ value }: { value: StylingValue }) {
  if (value === null) return <s-text color="subdued">Not set</s-text>;
  const text = String(value);
  const palette = text.match(PALETTE_REF);
  if (palette) return <s-text>{`Palette color ${palette[1]}`}</s-text>;
  if (!HEX.test(text)) return <s-text>{text}</s-text>;
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 16,
          height: 16,
          borderRadius: 4,
          background: text,
          border: "1px solid rgba(0, 0, 0, 0.15)",
        }}
      />
      <s-text>{text}</s-text>
    </s-stack>
  );
}
