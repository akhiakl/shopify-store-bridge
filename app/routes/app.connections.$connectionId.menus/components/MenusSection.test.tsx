import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MenuRow, SourceMenuItem } from "~/utils/sync/menus.server";
import { MenusSection } from "./MenusSection";

const item = (type: string, items: SourceMenuItem[] = []): SourceMenuItem => ({
  title: type,
  type,
  url: null,
  resourceId: null,
  tags: [],
  items,
});

const menus: MenuRow[] = [
  {
    handle: "main-menu",
    title: "Main menu",
    items: [item("CATALOG", [item("PRODUCT"), item("PAGE")]), item("BLOG")],
  },
  { handle: "footer", title: "Footer", items: [item("SEARCH")] },
];

// See MetafieldDefinitionsSection.test.tsx for why interaction isn't
// simulated here - these cover this component's own rendering logic.
function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("MenusSection", () => {
  it("shows an empty state when there are no menus", () => {
    render(<MenusSection menus={[]} selected={new Set()} onToggle={vi.fn()} />);
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no menus found/i,
    );
  });

  it("counts nested items and warns about links that will be dropped", () => {
    render(
      <MenusSection menus={menus} selected={new Set()} onToggle={vi.fn()} />,
    );

    expect(checkboxByLabel("Select all (2)")).toBeInTheDocument();
    expect(checkboxByLabel("Main menu (main-menu)")).toHaveAttribute(
      "details",
      "4 items. 2 page, blog or account links can't sync yet and will be dropped.",
    );
    expect(checkboxByLabel("Footer (footer)")).toHaveAttribute(
      "details",
      "1 item.",
    );
  });

  it("reflects partial and full selection on select-all", () => {
    const { rerender } = render(
      <MenusSection
        menus={menus}
        selected={new Set(["menu:footer"])}
        onToggle={vi.fn()}
      />,
    );
    expect(checkboxByLabel("Select all (2)")).toHaveAttribute("indeterminate");

    rerender(
      <MenusSection
        menus={menus}
        selected={new Set(["menu:footer", "menu:main-menu"])}
        onToggle={vi.fn()}
      />,
    );
    expect(checkboxByLabel("Select all (2)")).toHaveAttribute("checked");
  });
});
