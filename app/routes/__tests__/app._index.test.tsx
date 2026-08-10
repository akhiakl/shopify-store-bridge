import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import Index, { loader } from "../app._index";

vi.mock("@shopify/app-bridge-react", () => ({
  TitleBar: () => null,
}));

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
  it("renders a welcome heading", () => {
    render(<Index />);
    expect(
      screen.getByRole("heading", { name: /welcome to storebridge/i }),
    ).toBeInTheDocument();
  });

  it("loader authenticates the admin request before returning", async () => {
    const request = new Request("https://example.myshopify.com/app");
    await loader({ request, params: {}, context: {} });
    expect(authenticateAdmin).toHaveBeenCalledWith(request);
  });
});
