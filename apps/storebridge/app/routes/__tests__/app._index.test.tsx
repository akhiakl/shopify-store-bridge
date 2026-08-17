import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import Index, { loader } from "../app._index";

// The loader in this file imports shopify.server -> db.server (Prisma). The
// component test only exercises the default export, so stub the server-only
// dependency rather than requiring a real Prisma client to render UI.
const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("../../shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

describe("App Home", () => {
  it("renders the welcome section and copy", () => {
    render(<Index />);

    // Polaris Web Components (<s-page>, <s-section>) render their `heading`
    // prop through the CDN-loaded custom element definition, which isn't
    // present in jsdom — so the heading text lives on the attribute rather
    // than as rendered DOM text. Assert on the attribute directly, and check
    // the paragraph copy that *is* real rendered text content.
    const section = document.querySelector("s-section");
    expect(section).toHaveAttribute("heading", "Welcome to StoreBridge");
    expect(
      screen.getByText(/sync group setup, pairing, and job history/i),
    ).toBeInTheDocument();
  });

  it("loader authenticates the admin request before returning", async () => {
    const request = new Request("https://example.myshopify.com/app");
    await loader({
      request,
      params: {},
      context: {},
      url: new URL(request.url),
      pattern: "/app",
    });
    expect(authenticateAdmin).toHaveBeenCalledWith(request);
  });
});
