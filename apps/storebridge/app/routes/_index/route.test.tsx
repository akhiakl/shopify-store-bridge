import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("~/shopify.server", () => ({ login }));

const { loader, default: PublicLanding } = await import("./route");

function loaderRequest(url: string) {
  return new Request(url);
}

describe("public landing loader", () => {
  it("redirects to /app when a shop param is present", async () => {
    await expect(
      loader({
        request: loaderRequest("https://example.com/?shop=test.myshopify.com"),
        params: {},
        context: {},
      } as never),
    ).rejects.toMatchObject({
      status: 302,
      headers: expect.objectContaining({
        get: expect.any(Function),
      }),
    });
  });

  it("returns showForm: true when no shop param is present", async () => {
    const result = await loader({
      request: loaderRequest("https://example.com/"),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ showForm: true });
  });
});

describe("public landing page", () => {
  it("renders every section in order", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: PublicLanding,
        loader: () => ({ showForm: true }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(await screen.findByText("StoreBridge")).toBeInTheDocument();
    expect(
      screen.getByText(/pair your stores without sharing a login/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Name a target store")).toBeInTheDocument();
    expect(screen.getByText("No shared logins")).toBeInTheDocument();
    expect(screen.getByText("Pair your first two stores")).toBeInTheDocument();
  });

  it("omits the login-dependent sections when showForm is false", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: PublicLanding,
        loader: () => ({ showForm: false }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(await screen.findByText("StoreBridge")).toBeInTheDocument();
    expect(
      screen.queryByText("Pair your first two stores"),
    ).not.toBeInTheDocument();
    expect(document.querySelector("form")).not.toBeInTheDocument();
  });
});
