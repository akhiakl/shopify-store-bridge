import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { Hero } from "./Hero";

function renderStubbed(showForm: boolean) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <Hero showForm={showForm} /> },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("Hero", () => {
  it("shows the headline and the pairing-status mockup", () => {
    renderStubbed(false);

    expect(
      screen.getByText(/pair your stores without sharing a login/i),
    ).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByText("Approve pairing")).toBeInTheDocument();
  });

  it("only shows the login form when one is available", () => {
    renderStubbed(false);
    expect(document.querySelector("form")).not.toBeInTheDocument();

    renderStubbed(true);
    expect(document.querySelector("form")).toBeInTheDocument();
  });
});
