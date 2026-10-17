import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MarketShippingRow } from "~/utils/sync/marketShipping.server";
import { MarketShippingSection } from "./MarketShippingSection";

const markets: MarketShippingRow[] = [
  {
    id: "gid://M/1",
    handle: "ca",
    name: "Canada",
    shipping: { isEnabled: true, optionCount: 1 },
  },
  {
    id: "gid://M/2",
    handle: "us",
    name: "United States",
    shipping: { isEnabled: false, optionCount: 3 },
  },
  { id: "gid://M/3", handle: "eu", name: "Europe", shipping: null },
];

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("MarketShippingSection", () => {
  it("shows an empty state when no market has shipping", () => {
    const { getByText } = render(
      <MarketShippingSection
        markets={[markets[2]]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(getByText("No markets with shipping found.")).toBeInTheDocument();
  });

  it("lists markets with their options, disabling one without shipping", () => {
    render(
      <MarketShippingSection
        markets={markets}
        selected={new Set(["marketShipping:ca"])}
        onToggle={vi.fn()}
      />,
    );
    expect(checkboxByLabel("Select all (2)")).toHaveAttribute("indeterminate");
    expect(checkboxByLabel("Canada")?.getAttribute("details")).toBe(
      "ca. 1 delivery option.",
    );
    expect(checkboxByLabel("United States")?.getAttribute("details")).toBe(
      "us. 3 delivery options, shipping off.",
    );
    expect(checkboxByLabel("Europe")).toHaveAttribute(
      "details",
      "eu. No shipping set up.",
    );
    expect(checkboxByLabel("Europe")).toHaveAttribute("disabled");
  });
});
