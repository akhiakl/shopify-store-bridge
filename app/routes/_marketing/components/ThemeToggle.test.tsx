import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

let systemDark = false;
let listener: (() => void) | undefined;

beforeEach(() => {
  systemDark = false;
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: (_: string, fn: () => void) => {
      listener = fn;
    },
    removeEventListener: () => {
      listener = undefined;
    },
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("ThemeToggle", () => {
  it("shows the theme the page loaded with and switches, remembering the choice", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Switch to light mode" });
    fireEvent.click(button);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("storebridge-theme")).toBe("light");
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });

  it("follows the device setting live until a choice is made", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to dark mode" }));

    systemDark = true;
    act(() => listener?.());
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );
    systemDark = false;
    act(() => listener?.());
    // The saved choice wins over the device now.
    expect(document.documentElement.dataset.theme).toBe("light");
    systemDark = true;
    act(() => listener?.());
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("still switches when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ThemeToggle />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.restoreAllMocks();
  });
});
