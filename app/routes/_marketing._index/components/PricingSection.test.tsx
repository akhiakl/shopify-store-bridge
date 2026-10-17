import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PricingSection } from "./PricingSection";

describe("PricingSection", () => {
  it("shows both plans with their prices and features", () => {
    render(<PricingSection />);

    expect(
      screen.getByRole("heading", { name: "Pricing" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$9.99")).toBeInTheDocument();
    expect(screen.getByText("Auto-sync")).toBeInTheDocument();
    expect(screen.getByText("1 connected store")).toBeInTheDocument();
    expect(screen.getByText("Install free")).toHaveAttribute("href", "#login");
  });
});
