import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DeliveryProfileRow } from "~/utils/sync/deliveryProfiles.server";
import { DeliveryProfilesSection } from "./DeliveryProfilesSection";

const profiles: DeliveryProfileRow[] = [
  {
    id: "gid://shopify/DeliveryProfile/1",
    name: "General profile",
    default: true,
    zoneCountryCount: 2,
    activeMethodDefinitionsCount: 3,
    productVariantsCount: { count: 40 },
  },
  {
    id: "gid://shopify/DeliveryProfile/2",
    name: "Oversized",
    default: false,
    zoneCountryCount: 1,
    activeMethodDefinitionsCount: 1,
    productVariantsCount: { count: 1 },
  },
];

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("DeliveryProfilesSection", () => {
  it("shows an empty state when there are no profiles", () => {
    render(
      <DeliveryProfilesSection
        profiles={[]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no shipping profiles found/i,
    );
  });

  it("describes each profile's reach and how its products match", () => {
    render(
      <DeliveryProfilesSection
        profiles={profiles}
        selected={new Set(["deliveryProfile:2"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("General profile (general)")).toHaveAttribute(
      "details",
      "2 countries, 3 active rates. Covers every product not in another profile.",
    );
    expect(checkboxByLabel("Oversized")).toHaveAttribute(
      "details",
      "1 country, 1 active rate. 1 variant, matched by product handle.",
    );
    expect(checkboxByLabel("Oversized")).toHaveAttribute("checked");
    expect(checkboxByLabel("Select all (2)")).toHaveAttribute("indeterminate");
  });
});
