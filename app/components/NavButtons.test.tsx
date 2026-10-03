import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NavButtons } from "./NavButtons";

describe("NavButtons", () => {
  it("links every item and highlights only the current one", () => {
    render(
      <NavButtons
        items={[
          { label: "Overview", href: "/a", current: true },
          { label: "Metafields", href: "/b", current: false },
        ]}
      />,
    );

    const overview = screen.getByText("Overview");
    expect(overview).toHaveAttribute("href", "/a");
    expect(overview).toHaveAttribute("variant", "primary");
    expect(screen.getByText("Metafields")).toHaveAttribute(
      "variant",
      "secondary",
    );
  });

  it("uses the lighter tab look inside a card", () => {
    render(
      <NavButtons
        appearance="tabs"
        items={[
          { label: "Definitions", href: "/a", current: true },
          { label: "Values", href: "/b", current: false },
        ]}
      />,
    );

    expect(screen.getByText("Definitions")).toHaveAttribute(
      "variant",
      "secondary",
    );
    expect(screen.getByText("Values")).toHaveAttribute("variant", "tertiary");
  });
});
