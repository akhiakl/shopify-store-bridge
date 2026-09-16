import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetafieldDefinitionRow } from "../definitions.server";
import { MetafieldDefinitionsSection } from "./MetafieldDefinitionsSection";

const definitions: MetafieldDefinitionRow[] = [
  {
    id: "1",
    name: "Care instructions",
    namespace: "custom",
    key: "care",
    description: null,
    type: "single_line_text_field",
    ownerType: "PRODUCT",
  },
  {
    id: "2",
    name: "Fit notes",
    namespace: "custom",
    key: "fit",
    description: null,
    type: "single_line_text_field",
    ownerType: "PRODUCT",
  },
];

// Polaris Web Components only get their real interactive behavior once
// upgraded by the CDN-loaded custom element definitions (unavailable in
// jsdom - see the other route folders' test comments), so `onChange`
// can't be exercised via a simulated DOM event here. These tests cover
// the part that's actually this component's own logic: grouping and the
// checked/indeterminate state derived from the `selected` prop.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("MetafieldDefinitionsSection", () => {
  it("shows an empty state when there are no definitions", () => {
    render(
      <MetafieldDefinitionsSection
        definitions={[]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no metafield definitions found/i,
    );
  });

  it("groups definitions by owner type then namespace", () => {
    render(
      <MetafieldDefinitionsSection
        definitions={definitions}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );

    expect(document.querySelector("s-heading")).toHaveTextContent("PRODUCT");
    expect(checkboxByLabel("custom (2)")).toBeInTheDocument();
    expect(checkboxByLabel("Care instructions (care)")).toHaveAttribute(
      "details",
      "single_line_text_field",
    );
  });

  it("marks the namespace group checked once every definition in it is selected", () => {
    render(
      <MetafieldDefinitionsSection
        definitions={definitions}
        selected={
          new Set([
            "metafield:PRODUCT:custom:care",
            "metafield:PRODUCT:custom:fit",
          ])
        }
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("custom (2)")).toHaveAttribute("checked", "true");
    expect(checkboxByLabel("custom (2)")).not.toHaveAttribute(
      "indeterminate",
      "true",
    );
  });

  it("marks the namespace group indeterminate when only some definitions are selected", () => {
    render(
      <MetafieldDefinitionsSection
        definitions={definitions}
        selected={new Set(["metafield:PRODUCT:custom:care"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("custom (2)")).toHaveAttribute(
      "indeterminate",
      "true",
    );
    expect(checkboxByLabel("Care instructions (care)")).toHaveAttribute(
      "checked",
      "true",
    );
    expect(checkboxByLabel("Fit notes (fit)")).not.toHaveAttribute(
      "checked",
      "true",
    );
  });

  it("renders a status badge for a definition once a status check has run", () => {
    render(
      <MetafieldDefinitionsSection
        definitions={definitions}
        selected={new Set()}
        onToggle={vi.fn()}
        statusByKey={{
          "metafield:PRODUCT:custom:care": {
            inSyncCount: 0,
            totalTargets: 1,
            perTarget: [
              { targetId: "t1", shop: "a.myshopify.com", status: "NOT_SYNCED" },
            ],
          },
        }}
      />,
    );

    expect(document.querySelector("s-badge")).toHaveTextContent("0/1 in sync");
  });
});
