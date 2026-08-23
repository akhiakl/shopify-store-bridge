import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Features } from "./Features";

describe("Features", () => {
  it("lists all three feature cards", () => {
    render(<Features />);

    expect(screen.getByText("No shared logins")).toBeInTheDocument();
    expect(screen.getByText("A status for every request")).toBeInTheDocument();
    expect(screen.getByText("One source, many targets")).toBeInTheDocument();
  });
});
