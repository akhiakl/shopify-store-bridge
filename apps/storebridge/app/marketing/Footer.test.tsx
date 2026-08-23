import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Footer } from "./Footer";

describe("Footer", () => {
  it("shows the brand and section links", () => {
    render(<Footer />);

    expect(screen.getByText(/StoreBridge/)).toBeInTheDocument();
    expect(screen.getAllByText("How it works")[0]).toHaveAttribute(
      "href",
      "#how",
    );
    expect(screen.getAllByText("Features")[0]).toHaveAttribute(
      "href",
      "#features",
    );
  });
});
