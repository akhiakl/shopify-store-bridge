import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { requireConnectionPage } = vi.hoisted(() => ({
  requireConnectionPage: vi.fn(),
}));
vi.mock("~/utils/sync/connectionRoute.server", () => ({
  requireConnectionPage,
}));

const { loader, default: ConnectionLayout } =
  await import("./app.connections.$connectionId");

describe("connection layout loader", () => {
  it("returns both stores, the status, and which side is viewing", async () => {
    requireConnectionPage.mockResolvedValue({
      connection: {
        id: "conn-1",
        status: "APPROVED",
        source: { shop: "src.myshopify.com" },
        target: { shop: "tgt.myshopify.com" },
      },
      role: "target",
    });

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      status: "APPROVED",
      role: "target",
      sourceShop: "src.myshopify.com",
      targetShop: "tgt.myshopify.com",
      apiKey: expect.any(String),
    });
  });
});

function renderAt(
  path: string,
  { role, status }: { role: "source" | "target"; status: string },
) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId",
      Component: ConnectionLayout,
      loader: () => ({
        connectionId: "conn-1",
        status,
        role,
        sourceShop: "src.myshopify.com",
        targetShop: "tgt.myshopify.com",
        apiKey: "key-1",
      }),
      children: [
        { index: true, Component: () => <p>history</p> },
        { path: "metafields", Component: () => <p>metafields</p> },
      ],
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("ConnectionLayout", () => {
  it("titles the source's view with the target store and highlights the page", async () => {
    renderAt("/app/connections/conn-1/metafields", {
      role: "source",
      status: "APPROVED",
    });

    expect(await screen.findByText("metafields")).toBeInTheDocument();
    expect(document.querySelector("s-page")).toHaveAttribute(
      "heading",
      "tgt.myshopify.com",
    );
    expect(
      screen.getByText("Sync from this store to tgt.myshopify.com."),
    ).toBeInTheDocument();
    expect(screen.getByText("Open connected store")).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/tgt/apps/key-1/app/connections/conn-1",
    );
    expect(
      screen.getByText("Sync from this store to tgt.myshopify.com."),
    ).toBeInTheDocument();
    expect(screen.getByText("Connected")).toHaveAttribute("tone", "success");
    expect(screen.getByText("Metafields")).toHaveAttribute(
      "variant",
      "primary",
    );
    expect(screen.getByText("Connected stores")).toHaveAttribute(
      "slot",
      "breadcrumb-actions",
    );
  });

  it("titles the target's view with the source store", async () => {
    renderAt("/app/connections/conn-1", { role: "target", status: "APPROVED" });

    expect(
      await screen.findByText("Pull from src.myshopify.com into this store."),
    ).toBeInTheDocument();
    expect(screen.getByText("Open connected store")).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/src/apps/key-1/app/connections/conn-1",
    );
    expect(
      screen.getByText("Pull from src.myshopify.com into this store."),
    ).toBeInTheDocument();
    expect(document.querySelector("s-page")).toHaveAttribute(
      "heading",
      "src.myshopify.com",
    );
    expect(screen.getByText("Job history")).toHaveAttribute(
      "variant",
      "primary",
    );
  });

  it("shows when the connection is still waiting on the target", async () => {
    renderAt("/app/connections/conn-1", { role: "source", status: "PENDING" });

    expect(await screen.findByText("Waiting for approval")).toHaveAttribute(
      "tone",
      "warning",
    );
  });
});
