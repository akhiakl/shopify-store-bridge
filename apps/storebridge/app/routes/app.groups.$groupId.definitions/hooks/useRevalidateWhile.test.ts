import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidate } = vi.hoisted(() => ({ revalidate: vi.fn() }));
vi.mock("react-router", () => ({ useRevalidator: () => ({ revalidate }) }));

const { useRevalidateWhile } = await import("./useRevalidateWhile");

beforeEach(() => {
  vi.useFakeTimers();
  revalidate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRevalidateWhile", () => {
  it("revalidates on an interval while active, and stops when it turns inactive", () => {
    const { rerender } = renderHook(
      ({ active }) => useRevalidateWhile(active, 1000),
      { initialProps: { active: true } },
    );

    vi.advanceTimersByTime(3000);
    expect(revalidate).toHaveBeenCalledTimes(3);

    rerender({ active: false });
    vi.advanceTimersByTime(3000);
    expect(revalidate).toHaveBeenCalledTimes(3);
  });

  it("never revalidates when inactive from the start", () => {
    renderHook(() => useRevalidateWhile(false));

    vi.advanceTimersByTime(10_000);
    expect(revalidate).not.toHaveBeenCalled();
  });
});
