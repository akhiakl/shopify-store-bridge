import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetafieldDefinitionRow } from "~/utils/sync/definitions.server";
import { MetafieldValuesSection } from "./MetafieldValuesSection";

function definition(
  ownerType: string,
  valueCount: number,
  key = "care",
): MetafieldDefinitionRow {
  return {
    id: `gid://${ownerType}/${key}`,
    name: key,
    namespace: "custom",
    key,
    description: null,
    type: "single_line_text_field",
    ownerType: ownerType as MetafieldDefinitionRow["ownerType"],
    valueCount,
  };
}

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("MetafieldValuesSection", () => {
  it("shows an empty state when nothing has syncable values", () => {
    render(
      <MetafieldValuesSection
        definitions={[definition("ORDER", 5), definition("PRODUCT", 0)]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no shop, product, collection or customer metafield values found/i,
    );
  });

  it("lists the shop's own value alongside matched record types", () => {
    render(
      <MetafieldValuesSection
        definitions={[
          definition("SHOP", 1, "support_email"),
          definition("SHOP", 0, "unset"),
        ]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );

    expect(
      checkboxByLabel("support_email (shop: custom.support_email)"),
    ).toHaveAttribute("details", "This store's own value.");
    // A Shop definition with no value set has nothing to copy.
    expect(checkboxByLabel("unset (shop: custom.unset)")).toBeNull();
  });

  it("lists product, collection and customer definitions with how each is matched", () => {
    render(
      <MetafieldValuesSection
        definitions={[
          definition("PRODUCT", 12),
          definition("COLLECTION", 3, "banner"),
          definition("CUSTOMER", 1500, "tier"),
          definition("PRODUCTVARIANT", 9, "size"),
        ]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (3)")).toBeInTheDocument();
    expect(checkboxByLabel("care (product: custom.care)")).toHaveAttribute(
      "details",
      "12 values. Products matched by handle.",
    );
    expect(
      checkboxByLabel("banner (collection: custom.banner)"),
    ).toHaveAttribute("details", "3 values. Collections matched by handle.");
    expect(checkboxByLabel("tier (customer: custom.tier)")).toHaveAttribute(
      "details",
      "1500 values. Customers matched by email. Only the first 1000 sync per job.",
    );
    expect(checkboxByLabel("size (productvariant: custom.size)")).toBeNull();
  });

  it("reflects partial and full selection on select-all", () => {
    const defs = [definition("PRODUCT", 1), definition("COLLECTION", 1)];
    const { unmount } = render(
      <MetafieldValuesSection
        definitions={defs}
        selected={new Set(["metafieldValues:PRODUCT:custom:care"])}
        onToggle={vi.fn()}
      />,
    );
    expect(checkboxByLabel("Select all (2)")).toHaveAttribute(
      "indeterminate",
      "true",
    );
    unmount();

    render(
      <MetafieldValuesSection
        definitions={defs}
        selected={
          new Set([
            "metafieldValues:PRODUCT:custom:care",
            "metafieldValues:COLLECTION:custom:care",
          ])
        }
        onToggle={vi.fn()}
      />,
    );
    expect(checkboxByLabel("Select all (2)")).toHaveAttribute(
      "checked",
      "true",
    );
  });
});
