import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HandleListSection } from "./HandleListSection";

const items = [
  { handle: "about", title: "About" },
  { handle: "news", title: "News", note: "2 articles" },
];
const toKey = (handle: string) => `page:${handle}`;

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here.
function checkbox(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

function renderWith(selected: string[], list = items) {
  return render(
    <HandleListSection
      items={list}
      toKey={toKey}
      details="What syncs"
      emptyText="Nothing here."
      selected={new Set(selected)}
      onToggle={vi.fn()}
    />,
  );
}

describe("HandleListSection", () => {
  it("shows the empty text when there are no items", () => {
    renderWith([], []);
    expect(document.querySelector("s-paragraph")?.textContent).toBe(
      "Nothing here.",
    );
  });

  it("lists each item with its handle, note and what syncs", () => {
    renderWith([]);
    expect(checkbox("Select all (2)")).toBeInTheDocument();
    expect(checkbox("About (about)")).toHaveAttribute("details", "What syncs");
    expect(checkbox("News (news, 2 articles)")).toBeInTheDocument();
  });

  it("marks select-all indeterminate when only some items are selected", () => {
    renderWith(["page:about"]);
    expect(checkbox("Select all (2)")).toHaveAttribute("indeterminate");
    expect(checkbox("About (about)")).toHaveAttribute("checked");
  });

  it("marks select-all checked once every item is selected", () => {
    renderWith(["page:about", "page:news"]);
    expect(checkbox("Select all (2)")).toHaveAttribute("checked");
  });
});
