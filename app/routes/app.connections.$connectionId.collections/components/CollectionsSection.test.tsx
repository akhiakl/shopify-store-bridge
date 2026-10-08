import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CollectionRow } from "~/utils/sync/collections.server";
import { CollectionsSection } from "./CollectionsSection";

const base = {
  descriptionHtml: "",
  sortOrder: "MANUAL",
  templateSuffix: null,
  seo: { title: null, description: null },
};

const collections: CollectionRow[] = [
  { ...base, handle: "summer", title: "Summer" },
  { ...base, handle: "hats", title: "Hats" },
];

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("CollectionsSection", () => {
  it("shows an empty state when there are no collections", () => {
    render(
      <CollectionsSection
        collections={[]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no collections found/i,
    );
  });

  it("explains on each row what syncs and when rules are left alone", () => {
    render(
      <CollectionsSection
        collections={collections}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toBeInTheDocument();
    expect(checkboxByLabel("Summer (summer)")).toHaveAttribute(
      "details",
      expect.stringMatching(/rules replace the target's, unless/i),
    );
    expect(checkboxByLabel("Hats (hats)")).toBeInTheDocument();
  });

  it("marks select-all indeterminate when only some collections are selected", () => {
    render(
      <CollectionsSection
        collections={collections}
        selected={new Set(["collection:summer"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toHaveAttribute("indeterminate");
    expect(checkboxByLabel("Summer (summer)")).toHaveAttribute("checked");
  });

  it("marks select-all checked once every collection is selected", () => {
    render(
      <CollectionsSection
        collections={collections}
        selected={new Set(["collection:summer", "collection:hats"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toHaveAttribute("checked");
  });
});
