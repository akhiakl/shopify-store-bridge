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

describe("MobileMenu dismissal", () => {
  function openMenu() {
    const { container } = render(
      <>
        <p>outside</p>
        <MobileMenu links={[{ href: "#faq", label: "FAQ" }]} />
      </>,
    );
    const details = container.querySelector("details")!;
    details.setAttribute("open", "");
    return details;
  }

  it("closes on a tap outside, but not inside", () => {
    const details = openMenu();
    fireEvent.pointerDown(screen.getByLabelText("Menu"));
    expect(details).toHaveAttribute("open");
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(details).not.toHaveAttribute("open");
  });

  it("closes on Escape only", () => {
    const details = openMenu();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(details).toHaveAttribute("open");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details).not.toHaveAttribute("open");
  });
});
