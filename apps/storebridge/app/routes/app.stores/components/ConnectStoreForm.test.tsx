import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ConnectStoreForm } from "./ConnectStoreForm";

describe("ConnectStoreForm", () => {
  it("renders the domain and group name fields", () => {
    const Stub = createRoutesStub([{ path: "/", Component: ConnectStoreForm }]);
    render(<Stub initialEntries={["/"]} />);

    expect(
      document.querySelector('s-text-field[name="targetDomain"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('s-text-field[name="groupName"]'),
    ).toBeInTheDocument();
  });

  it("shows the returned error and install link when the target isn't installed", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: "StoreBridge isn't installed on target.myshopify.com yet.",
      installUrl: "/auth/login?shop=target.myshopify.com",
    });
    const Stub = createRoutesStub([
      { path: "/", Component: ConnectStoreForm, action },
    ]);
    render(<Stub initialEntries={["/"]} />);

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(action).toHaveBeenCalled());
    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "StoreBridge isn't installed on target.myshopify.com yet.",
      ),
    );
    expect(screen.getByText("Install StoreBridge there")).toHaveAttribute(
      "href",
      "/auth/login?shop=target.myshopify.com",
    );
  });

  it("shows the shareable authorization link once the request succeeds", async () => {
    const authorizeUrl =
      "https://app.example.com/app/stores/authorize?token=abc&shop=target.myshopify.com";
    const action = vi.fn().mockResolvedValue({ ok: true, authorizeUrl });
    const Stub = createRoutesStub([
      { path: "/", Component: ConnectStoreForm, action },
    ]);
    render(<Stub initialEntries={["/"]} />);

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "Pairing request created",
      ),
    );
    expect(
      document.querySelector('s-text-field[label="Authorization link"]'),
    ).toHaveAttribute("value", authorizeUrl);
  });
});
