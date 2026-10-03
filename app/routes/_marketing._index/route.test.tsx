import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import MarketingHome, { loader } from "./route";

// shopify.server pulls in the Drizzle/pg-backed session storage: stub the
// one export this route actually reads so the test doesn't need a database.
vi.mock("~/shopify.server", () => ({ login: vi.fn() }));

const loaderArgs = (url: string) => {
  const request = new Request(url);
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/",
  };
};

describe("marketing home loader", () => {
  it("redirects to /app when a shop param is present", async () => {
    await expect(
      loader(
        loaderArgs("https://storebridge.example/?shop=my-shop.myshopify.com"),
      ),
    ).rejects.toMatchObject({ status: 302 });
  });

  it.each(["host=abc", "embedded=1"])(
    "redirects any embedded load (%s) to /app",
    async (query) => {
      await expect(
        loader(loaderArgs(`https://storebridge.example/?${query}`)),
      ).rejects.toMatchObject({ status: 302 });
    },
  );

  it("returns showForm without a shop param", async () => {
    const result = await loader(loaderArgs("https://storebridge.example/"));
    expect(result).toEqual({ showForm: true });
  });
});

describe("marketing home page", () => {
  it("renders the hero, login form, and feature copy", async () => {
    const Stub = createRoutesStub([
      { path: "/", Component: MarketingHome, loader },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(
      await screen.findByRole("heading", {
        name: /keep your shopify stores in sync/i,
      }),
    ).toBeInTheDocument();
    // Required so an empty submit never leaves this page for the plain
    // Polaris /auth/login error screen: see AGENTS.md UX conventions.
    expect(screen.getByLabelText(/shop domain/i)).toBeRequired();
    expect(screen.getByText("One connection per store")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What syncs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Checkout styling", { selector: "dt" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Why does checkout styling need Shopify Plus?"),
    ).toBeInTheDocument();
  });
});
