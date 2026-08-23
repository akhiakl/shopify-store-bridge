import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HowItWorks } from "./HowItWorks";

describe("HowItWorks", () => {
  it("lists the three steps in order", () => {
    render(<HowItWorks />);

    expect(screen.getByText("Name a target store")).toBeInTheDocument();
    expect(
      screen.getByText("The target approves it themselves"),
    ).toBeInTheDocument();
    expect(screen.getByText("Stores stay linked")).toBeInTheDocument();
  });
});
