import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { ClosingCta } from "./ClosingCta";

describe("ClosingCta", () => {
  it("shows the heading and a login form", () => {
    const Stub = createRoutesStub([{ path: "/", Component: ClosingCta }]);
    render(<Stub initialEntries={["/"]} />);

    expect(screen.getByText("Pair your first two stores")).toBeInTheDocument();
    expect(document.querySelector("form")).toHaveAttribute(
      "action",
      "/auth/login",
    );
  });
});
