import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { LoginForm } from "./LoginForm";

function renderStubbed(props: ComponentProps<typeof LoginForm>) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <LoginForm {...props} /> },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("LoginForm", () => {
  it("posts to /auth/login", () => {
    renderStubbed({ variant: "labeled" });

    expect(document.querySelector("form")).toHaveAttribute(
      "action",
      "/auth/login",
    );
    expect(document.querySelector("form")).toHaveAttribute("method", "post");
    expect(document.querySelector('input[name="shop"]')).toBeInTheDocument();
  });

  it("shows a field label and hint in the labeled variant", () => {
    renderStubbed({ variant: "labeled", id: "test-shop" });

    expect(screen.getByText("Shop domain")).toHaveAttribute("for", "test-shop");
    expect(document.querySelector("#test-shop")).toBeInTheDocument();
  });

  it("omits the label in the compact variant", () => {
    renderStubbed({ variant: "compact", id: "cta-shop" });

    expect(screen.queryByText("Shop domain")).not.toBeInTheDocument();
    expect(document.querySelector("#cta-shop")).toBeInTheDocument();
  });
});
