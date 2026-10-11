import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StylingAreaDiff } from "~/utils/sync/checkoutStylingAreas";

import type { OverrideStatus } from "../utils/getCheckoutOverview.server";
import { CheckoutStylingSection } from "./CheckoutStylingSection";

const COLORS = "checkoutStyling:designTokens.colors";
const ORDER_SUMMARY =
  "checkoutStyling:surfaces.checkout.components.orderSummary";

const areas: StylingAreaDiff[] = [
  {
    area: "designTokens.colors",
    rows: [
      {
        setting: "palette.color1",
        source: "#111111",
        target: null,
        same: false,
      },
      {
        setting: "palette.color2",
        source: "--palette-color-1",
        target: "--palette-color-1",
        same: true,
      },
    ],
    inSync: false,
  },
  {
    area: "surfaces.checkout.components.orderSummary",
    rows: [
      { setting: "colors.base.background", source: 4, target: 4, same: true },
    ],
    inSync: true,
  },
];

const overrides: OverrideStatus[] = [
  { name: "EU", status: "OUT_OF_SYNC", areaCount: 2, outOfSyncCount: 1 },
  { name: "US", status: "IN_SYNC", areaCount: 1, outOfSyncCount: 0 },
  { name: "UK", status: "MISSING", areaCount: 1, outOfSyncCount: 0 },
];

function checkbox(label: string) {
  return document.querySelector(`s-checkbox[label="${label}"]`) as
    (Element & { checked?: boolean }) | null;
}

function renderSection(
  props: Partial<Parameters<typeof CheckoutStylingSection>[0]> = {},
) {
  const onToggle = vi.fn();
  render(
    <CheckoutStylingSection
      areas={areas}
      overrides={overrides}
      compared
      targetShop="b.myshopify.com"
      selected={new Set()}
      onToggle={onToggle}
      {...props}
    />,
  );
  return onToggle;
}

describe("CheckoutStylingSection", () => {
  it("groups areas by where they apply, with each one's status", () => {
    renderSection();

    expect(screen.getByText("Design tokens")).toBeInTheDocument();
    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(checkbox("Colors")).toHaveAttribute(
      "details",
      "2 settings, 1 differ",
    );
    expect(checkbox("Order summary")).toHaveAttribute("details", "1 setting");
    expect(screen.getByText(/1 of 2 areas are in sync/)).toBeInTheDocument();
    expect(screen.getAllByText("Out of sync").length).toBeGreaterThan(0);
  });

  it("lists every setting beside the target's value", () => {
    renderSection();

    expect(screen.getByText("Palette › Color 1")).toBeInTheDocument();
    expect(screen.getByText("#111111")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getAllByText("Palette color 1")).toHaveLength(2);
    expect(screen.getAllByText("4")).toHaveLength(2);
    expect(screen.getAllByText("Target").length).toBe(2);
  });

  it("shows market overrides, disabling ones the target lacks", () => {
    renderSection();

    expect(checkbox("EU")).toHaveAttribute("details", "2 areas, 1 differ");
    expect(checkbox("US")).toHaveAttribute("details", "1 area");
    expect(checkbox("UK")).toHaveAttribute("disabled");
    expect(checkbox("UK")?.getAttribute("details")).toMatch(/Create it/);
    expect(screen.getByText("Not on target")).toBeInTheDocument();
    expect(checkbox("Select all (4)")).toBeInTheDocument();
  });

  it("selects areas one by one, all at once, or what's out of sync", () => {
    const onToggle = renderSection({ selected: new Set([COLORS]) });
    expect(checkbox("Select all (4)")).toHaveAttribute("indeterminate");

    const colors = checkbox("Colors")!;
    colors.checked = false;
    fireEvent.change(colors);
    expect(onToggle).toHaveBeenLastCalledWith([COLORS], false);

    const all = checkbox("Select all (4)")!;
    all.checked = true;
    fireEvent.change(all);
    expect(onToggle).toHaveBeenLastCalledWith(
      [
        COLORS,
        ORDER_SUMMARY,
        "checkoutStyling:override:EU",
        "checkoutStyling:override:US",
      ],
      true,
    );

    const eu = checkbox("EU")!;
    eu.checked = true;
    fireEvent.change(eu);
    expect(onToggle).toHaveBeenLastCalledWith(
      ["checkoutStyling:override:EU"],
      true,
    );

    fireEvent.click(screen.getByText("Select out of sync (2)"));
    expect(onToggle).toHaveBeenLastCalledWith(
      [COLORS, "checkoutStyling:override:EU"],
      true,
    );
  });

  it("shows only the source's values before the target approves", () => {
    renderSection({
      compared: false,
      overrides: [
        { name: "EU", status: null, areaCount: 1, outOfSyncCount: 0 },
      ],
    });

    expect(checkbox("Colors")).toHaveAttribute("details", "2 settings");
    expect(screen.queryByText("Target")).toBeNull();
    expect(document.querySelector("s-badge")).toBeNull();
    expect(screen.queryByText(/Select out of sync/)).toBeNull();
    expect(screen.queryByText(/areas are in sync/)).toBeNull();
  });

  it("says when there's nothing to sync", () => {
    renderSection({ areas: [], overrides: [] });
    expect(screen.getByText(/nothing to sync/)).toBeInTheDocument();
    expect(document.querySelector("s-checkbox")).toBeNull();
  });
});
