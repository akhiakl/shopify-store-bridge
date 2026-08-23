import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Nav } from "./Nav";

describe("Nav", () => {
  it("always shows the brand and section links", () => {
    render(<Nav showLoginLink={false} />);

    expect(screen.getByText("StoreBridge")).toBeInTheDocument();
    expect(screen.getByText("How it works")).toHaveAttribute("href", "#how");
    expect(screen.getByText("Features")).toHaveAttribute("href", "#features");
  });

  it("only shows the login link when a form is available", () => {
    const { rerender } = render(<Nav showLoginLink={false} />);
    expect(screen.queryByText("Log in")).not.toBeInTheDocument();

    rerender(<Nav showLoginLink={true} />);
    expect(screen.getByText("Log in")).toHaveAttribute("href", "#login");
  });
});
