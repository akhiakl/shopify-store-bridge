import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import MarketingLayout from "./route";

describe("marketing layout", () => {
  it("renders the nav, footer, and the routed page content", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: MarketingLayout,
        children: [{ index: true, Component: () => <p>page content</p> }],
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(screen.getByText("StoreBridge")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
