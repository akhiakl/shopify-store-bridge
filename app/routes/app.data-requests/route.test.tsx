import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { authenticateAdmin, getDataRequests } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  getDataRequests: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));
vi.mock("./dataRequests.server", () => ({ getDataRequests }));

const { loader, default: DataRequests } = await import("./route");

function renderWith(requests: unknown[]) {
  const Stub = createRoutesStub([
    { path: "/", Component: DataRequests, loader: () => ({ requests }) },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("data requests route", () => {
  it("loads the signed-in shop's requests, never one from input", async () => {
    authenticateAdmin.mockResolvedValue({
      session: { shop: "source.myshopify.com" },
    });
    getDataRequests.mockResolvedValue([]);

    const result = await loader({
      request: new Request("https://example.com/app/data-requests?shop=x"),
      params: {},
      context: {},
    } as never);

    expect(getDataRequests).toHaveBeenCalledWith("source.myshopify.com");
    expect(result).toEqual({ requests: [] });
  });

  it("shows an empty state, and a card per request", async () => {
    const { unmount } = renderWith([]);
    expect(
      await screen.findByText("No customer data requests yet."),
    ).toBeInTheDocument();
    unmount();

    renderWith([
      {
        id: "r1",
        customerId: "7",
        receivedAt: new Date("2026-10-03T00:00:00Z"),
        rows: [],
      },
    ]);
    expect(await screen.findByText("Customer 7")).toBeInTheDocument();
  });
});
