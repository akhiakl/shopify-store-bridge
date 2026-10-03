import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataRequestCard } from "./DataRequestCard";

const base = {
  id: "r1",
  customerId: "7",
  receivedAt: new Date("2026-10-03T00:00:00Z"),
};

const row = {
  syncedAt: new Date("2026-10-01T00:00:00Z"),
  targetShop: "eu.myshopify.com",
  metafield: "custom.tier",
  status: "SKIPPED",
  errorMessage: "No matching customer on this store.",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DataRequestCard", () => {
  it("says when nothing is held, with no export to send", () => {
    const { container } = render(
      <DataRequestCard request={{ ...base, rows: [] }} />,
    );
    expect(container.textContent).toMatch(/holds no data on this customer/i);
    expect(container.querySelector("s-badge")?.textContent).toBe(
      "No data held",
    );
    expect(container.querySelector("s-button")).toBeNull();
  });

  it("lists each row and downloads them as CSV", () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const { container } = render(
      <DataRequestCard request={{ ...base, rows: [row, row] }} />,
    );

    expect(container.querySelector("s-badge")?.textContent).toBe("2 records");
    expect(container.textContent).toContain(
      "custom.tier to eu.myshopify.com, skipped (No matching customer on this store.)",
    );
    (container.querySelector("s-button") as HTMLElement).click();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv");
  });
});
