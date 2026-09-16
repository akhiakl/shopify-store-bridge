import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PairingLinkPanel } from "./PairingLinkPanel";

const URL = "https://app.example.com/app/stores/authorize?token=abc";

describe("PairingLinkPanel", () => {
  it("renders the link as a real clickable anchor", () => {
    render(<PairingLinkPanel authorizeUrl={URL} />);

    expect(screen.getByText(URL)).toHaveAttribute("href", URL);
  });

  it("copies the link and shows confirmation, then reverts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<PairingLinkPanel authorizeUrl={URL} />);
    fireEvent.click(screen.getByText("Copy link"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(await screen.findByText("Copied!")).toBeInTheDocument();

    vi.advanceTimersByTime(2000);
    expect(await screen.findByText("Copy link")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("doesn't throw when the clipboard API is unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<PairingLinkPanel authorizeUrl={URL} />);

    fireEvent.click(screen.getByText("Copy link"));

    // No confirmation state, no thrown error — the link itself is still
    // usable as a fallback.
    await waitFor(() =>
      expect(document.querySelector("s-button")).toHaveTextContent("Copy link"),
    );
  });
});
