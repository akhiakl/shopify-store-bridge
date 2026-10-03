import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LocationRow } from "~/utils/sync/locations.server";
import { LocationsSection } from "./LocationsSection";

const address = {
  address1: null,
  address2: null,
  city: null,
  provinceCode: null,
  countryCode: null,
  zip: null,
  phone: null,
};

const locations: LocationRow[] = [
  {
    name: "Warehouse",
    fulfillsOnlineOrders: true,
    address: {
      ...address,
      city: "Ottawa",
      provinceCode: "ON",
      countryCode: "CA",
    },
  },
  { name: "Pop-up", fulfillsOnlineOrders: false, address },
];

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("LocationsSection", () => {
  it("shows an empty state when there are no locations", () => {
    render(
      <LocationsSection
        locations={[]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no active locations found/i,
    );
  });

  it("shows where each location is and whether it fulfills online orders", () => {
    render(
      <LocationsSection
        locations={locations}
        selected={new Set(["location:Pop-up"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Warehouse")).toHaveAttribute(
      "details",
      "Ottawa, ON, CA. Fulfills online orders.",
    );
    expect(checkboxByLabel("Pop-up")).toHaveAttribute(
      "details",
      "Doesn't fulfill online orders.",
    );
    expect(checkboxByLabel("Pop-up")).toHaveAttribute("checked", "true");
    expect(checkboxByLabel("Select all (2)")).toHaveAttribute(
      "indeterminate",
      "true",
    );
  });
});
