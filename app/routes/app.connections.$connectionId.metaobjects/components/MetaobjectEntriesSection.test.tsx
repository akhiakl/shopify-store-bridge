import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetaobjectDefinitionRow } from "~/utils/sync/definitions.server";
import { MetaobjectEntriesSection } from "./MetaobjectEntriesSection";

function definition(type: string, entryCount: number): MetaobjectDefinitionRow {
  return {
    id: `gid://${type}`,
    type,
    name: type.toUpperCase(),
    fieldDefinitions: [],
    fieldCount: 0,
    entryCount,
  };
}

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("MetaobjectEntriesSection", () => {
  it("shows an empty state when no type has entries", () => {
    render(
      <MetaobjectEntriesSection
        definitions={[definition("faq", 0)]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no metaobject entries found/i,
    );
  });

  it("lists only types with entries, warning when the per-run cap applies", () => {
    render(
      <MetaobjectEntriesSection
        definitions={[
          definition("faq", 12),
          definition("empty", 0),
          definition("product_card", 1500),
        ]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toBeInTheDocument();
    expect(checkboxByLabel("EMPTY (empty)")).not.toBeInTheDocument();
    expect(checkboxByLabel("FAQ (faq)")).toHaveAttribute(
      "details",
      "12 entries",
    );
    expect(checkboxByLabel("PRODUCT_CARD (product_card)")).toHaveAttribute(
      "details",
      "1500 entries. Only the first 1000 sync per job.",
    );
  });

  it("marks select-all indeterminate when only some types are selected", () => {
    render(
      <MetaobjectEntriesSection
        definitions={[definition("faq", 1), definition("chef", 1)]}
        selected={new Set(["metaobjectEntries:faq"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toHaveAttribute("indeterminate");
    expect(checkboxByLabel("FAQ (faq)")).toHaveAttribute("checked");
  });

  it("marks select-all checked once every type is selected", () => {
    render(
      <MetaobjectEntriesSection
        definitions={[definition("faq", 1)]}
        selected={new Set(["metaobjectEntries:faq"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (1)")).toHaveAttribute("checked");
  });
});
