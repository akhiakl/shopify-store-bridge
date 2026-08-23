import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRedirectCountdown } from "./useRedirectCountdown";

describe("useRedirectCountdown", () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.useFakeTimers();
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, href: "" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  it("counts down from the given delay", async () => {
    const { result } = renderHook(() =>
      useRedirectCountdown("https://example.com/target", 5),
    );
    expect(result.current.secondsLeft).toBe(5);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.secondsLeft).toBe(4);
  });

  it("navigates once the countdown reaches zero", async () => {
    renderHook(() => useRedirectCountdown("https://example.com/target", 2));

    // Advance one tick at a time — a single large jump can let React's
    // fake-timer/effect-rescheduling loop settle a render early and miss
    // the final tick, so step through it explicitly instead.
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(window.location.href).toBe("https://example.com/target");
  });

  it("does not navigate once cancelled", async () => {
    const { result } = renderHook(() =>
      useRedirectCountdown("https://example.com/target", 2),
    );

    act(() => result.current.cancel());
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(window.location.href).toBe("");
    expect(result.current.cancelled).toBe(true);
  });

  it("does nothing when no url is given", async () => {
    renderHook(() => useRedirectCountdown(undefined, 2));

    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(window.location.href).toBe("");
  });
});
