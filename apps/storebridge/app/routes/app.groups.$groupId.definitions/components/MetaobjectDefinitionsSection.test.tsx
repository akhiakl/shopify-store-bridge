import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetaobjectDefinitionRow } from "../definitions.server";
import { MetaobjectDefinitionsSection } from "./MetaobjectDefinitionsSection";

const definitions: MetaobjectDefinitionRow[] = [
  {
    id: "1",
    type: "size_chart",
    name: "Size chart",
    fieldDefinitions: [],
    fieldCount: 3,
  },
  {
    id: "2",
    type: "faq_entry",
    name: "FAQ entry",
    fieldDefinitions: [],
    fieldCount: 2,
  },
];

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("MetaobjectDefinitionsSection", () => {
  it("shows an empty state when there are no definitions", () => {
    render(
      <MetaobjectDefinitionsSection
        definitions={[]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no metaobject definitions found/i,
    );
  });

  it("renders a select-all checkbox and one row per definition", () => {
    render(
      <MetaobjectDefinitionsSection
        definitions={definitions}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toBeInTheDocument();
    expect(checkboxByLabel("Size chart (size_chart)")).toHaveAttribute(
      "details",
      "3 field(s)",
    );
    expect(checkboxByLabel("FAQ entry (faq_entry)")).toHaveAttribute(
      "details",
      "2 field(s)",
    );
  });

  it("marks select-all indeterminate when only some definitions are selected", () => {
    render(
      <MetaobjectDefinitionsSection
        definitions={definitions}
        selected={new Set(["metaobject:size_chart"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toHaveAttribute(
      "indeterminate",
      "true",
    );
    expect(checkboxByLabel("Size chart (size_chart)")).toHaveAttribute(
      "checked",
      "true",
    );
  });

  it("marks select-all checked once every definition is selected", () => {
    render(
      <MetaobjectDefinitionsSection
        definitions={definitions}
        selected={new Set(["metaobject:size_chart", "metaobject:faq_entry"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toHaveAttribute(
      "checked",
      "true",
    );
  });
});
