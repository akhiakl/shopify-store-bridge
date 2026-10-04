import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSelection } from "./useSelection";

describe("useSelection", () => {
  it("starts empty, then adds and removes keys in batches", () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.selected.size).toBe(0);

    act(() => result.current.toggleKeys(["a", "b", "c"], true));
    expect([...result.current.selected]).toEqual(["a", "b", "c"]);

    act(() => result.current.toggleKeys(["a", "c"], false));
    expect([...result.current.selected]).toEqual(["b"]);
  });
});
