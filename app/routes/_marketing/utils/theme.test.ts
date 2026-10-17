import { afterEach, describe, expect, it, vi } from "vitest";

import { THEME_SCRIPT, currentTheme, savedTheme } from "./theme";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const stubSystem = (dark: boolean) =>
  vi.stubGlobal("matchMedia", () => ({ matches: dark }));

describe("theme", () => {
  it("prefers a saved choice over the device setting", () => {
    stubSystem(true);
    localStorage.setItem("storebridge-theme", "light");
    expect(currentTheme()).toBe("light");
  });

  it("falls back to the device setting, or light without one", () => {
    stubSystem(true);
    expect(currentTheme()).toBe("dark");
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", undefined);
    expect(currentTheme()).toBe("light");
  });

  it("ignores an unknown saved value", () => {
    localStorage.setItem("storebridge-theme", "blue");
    expect(savedTheme()).toBeNull();
  });

  it("has an inline script that applies the same rule before paint", () => {
    stubSystem(true);
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");

    localStorage.setItem("storebridge-theme", "light");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
