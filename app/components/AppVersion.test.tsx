import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppVersion } from "./AppVersion";

describe("AppVersion", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows the package version muted at the end of the page", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.3");
    render(<AppVersion />);

    const text = screen.getByText("StoreBridge v1.2.3");
    expect(text).toHaveAttribute("color", "subdued");
    expect(text.parentElement).toHaveAttribute("alignItems", "end");
  });

  it("falls back to dev without a version", () => {
    vi.stubEnv("VITE_APP_VERSION", undefined);
    render(<AppVersion />);

    expect(screen.getByText("StoreBridge vdev")).toBeInTheDocument();
  });
});
