import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectStoreForm } from "./ConnectStoreForm";

const AUTHORIZE_URL =
  "https://app.example.com/app/stores/authorize?token=abc&shop=target.myshopify.com";

function renderSubmitted(actionData: unknown) {
  const action = vi.fn().mockResolvedValue(actionData);
  const Stub = createRoutesStub([
    { path: "/", Component: ConnectStoreForm, action },
  ]);
  render(<Stub initialEntries={["/"]} />);
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
  return action;
}

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
    const action = renderSubmitted({
      ok: false,
      error: "StoreBridge isn't installed on target.myshopify.com yet.",
      installUrl: "/auth/login?shop=target.myshopify.com",
    });

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

  describe("once the request succeeds", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows the link as an openable link and the configured expiry", async () => {
      renderSubmitted({
        ok: true,
        authorizeUrl: AUTHORIZE_URL,
        expiresInMinutes: 15,
      });

      await vi.waitFor(() =>
        expect(document.querySelector("s-banner")).toHaveAttribute(
          "heading",
          "Pairing request created",
        ),
      );
      expect(screen.getByText("Open authorization link")).toHaveAttribute(
        "href",
        AUTHORIZE_URL,
      );
      expect(screen.getByText(/expires in 15 minutes/i)).toBeInTheDocument();
    });

    it("copies the link to the clipboard and confirms it", async () => {
      renderSubmitted({
        ok: true,
        authorizeUrl: AUTHORIZE_URL,
        expiresInMinutes: 15,
      });
      await vi.waitFor(() =>
        expect(screen.getByText("Copy link")).toBeInTheDocument(),
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Copy link"));
        // Flush the pending clipboard.writeText() microtask so the
        // resulting setCopied(true) lands inside this act() batch.
        await Promise.resolve();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(AUTHORIZE_URL);
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    it("navigates to the authorize URL after the countdown finishes", async () => {
      renderSubmitted({
        ok: true,
        authorizeUrl: AUTHORIZE_URL,
        expiresInMinutes: 15,
      });
      await vi.waitFor(() =>
        expect(
          screen.getByText(/opening it automatically/i),
        ).toBeInTheDocument(),
      );

      const originalLocation = window.location;
      // jsdom's window.location.href assignment doesn't actually navigate —
      // stub it so the hook's effect can be observed instead of erroring.
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...originalLocation, href: "" },
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(window.location.href).toBe(AUTHORIZE_URL);
      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    });

    it("stays put once the countdown is cancelled", async () => {
      renderSubmitted({
        ok: true,
        authorizeUrl: AUTHORIZE_URL,
        expiresInMinutes: 15,
      });
      await vi.waitFor(() =>
        expect(screen.getByText("Cancel")).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByText("Cancel"));
      await vi.advanceTimersByTimeAsync(10_000);

      expect(
        screen.queryByText(/opening it automatically/i),
      ).not.toBeInTheDocument();
    });
  });
});
