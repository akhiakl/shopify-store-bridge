import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MobileMenu } from "./MobileMenu";

describe("MobileMenu", () => {
  it("lists the section links and closes when one is picked", () => {
    const { container } = render(
      <MobileMenu
        links={[
          { href: "#faq", label: "FAQ" },
          { href: "#pricing", label: "Pricing" },
        ]}
      />,
    );
    const details = container.querySelector("details")!;
    details.setAttribute("open", "");

    expect(screen.getByLabelText("Menu")).toBeInTheDocument();
    expect(screen.getByText("Pricing")).toHaveAttribute("href", "#pricing");

    fireEvent.click(screen.getByText("FAQ"));
    expect(details).not.toHaveAttribute("open");
  });
});
