import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getPairingLinkStatus, approvePairingRequest } = vi.hoisted(() => ({
  getPairingLinkStatus: vi.fn(),
  approvePairingRequest: vi.fn(),
}));
vi.mock("~/routes/app.stores/pairing.server", () => ({
  getPairingLinkStatus,
  approvePairingRequest,
}));

const { loader, action, renderAuthorizeState } =
  await import("./app.stores_.authorize");

const SHOP = "target-shop.myshopify.com";

function loaderRequest(token: string) {
  return new Request(
    `https://example.myshopify.com/app/stores/authorize?token=${token}`,
  );
}

describe("app.stores.authorize loader", () => {
  it("returns not_found when the token doesn't resolve to any request", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPairingLinkStatus.mockResolvedValue({ state: "not_found" });

    const result = await loader({
      request: loaderRequest("bad"),
      params: {},
      context: {},
    } as never);

    expect(getPairingLinkStatus).toHaveBeenCalledWith("bad", SHOP);
    expect(result).toEqual({ state: "not_found" });
  });

  it("returns expired as its own state", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPairingLinkStatus.mockResolvedValue({ state: "expired" });

    const result = await loader({
      request: loaderRequest("stale"),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ state: "expired" });
  });

  it("returns already_declined as its own state", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPairingLinkStatus.mockResolvedValue({ state: "already_declined" });

    const result = await loader({
      request: loaderRequest("declined"),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ state: "already_declined" });
  });

  it("returns the source shop and group name when already approved", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPairingLinkStatus.mockResolvedValue({
      state: "already_approved",
      sourceShop: "source.myshopify.com",
      groupName: "EU stores",
    });

    const result = await loader({
      request: loaderRequest("used"),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({
      state: "already_approved",
      sourceShop: "source.myshopify.com",
      groupName: "EU stores",
    });
  });

  it("returns the source shop and group name for a pending token", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPairingLinkStatus.mockResolvedValue({
      state: "pending",
      target: {
        group: { name: "EU stores", source: { shop: "source.myshopify.com" } },
      },
    });

    const result = await loader({
      request: loaderRequest("good"),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({
      state: "pending",
      token: "good",
      sourceShop: "source.myshopify.com",
      groupName: "EU stores",
    });
  });
});

describe("app.stores.authorize action", () => {
  it("calls approvePairingRequest with the token and authenticated shop", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    approvePairingRequest.mockResolvedValue({ ok: true });

    const body = new URLSearchParams({ token: "good" });
    const result = await action({
      request: new Request(
        "https://example.myshopify.com/app/stores/authorize",
        { method: "POST", body },
      ),
      params: {},
      context: {},
    } as never);

    expect(approvePairingRequest).toHaveBeenCalledWith({
      token: "good",
      shop: SHOP,
    });
    expect(result).toEqual({ ok: true });
  });
});

// Polaris Web Components (<s-page>, <s-banner>, …) render their `heading`
// prop through the CDN-loaded custom element definition, which isn't
// present in jsdom — so heading text lives on the attribute rather than as
// rendered DOM text (same approach as app._index.test.tsx). Each of these
// pins the actual banner shown for a given loader state, which is exactly
// what was wrong in practice: "already_approved" was rendering the same
// generic invalid/expired banner as "not_found".
describe("renderAuthorizeState", () => {
  it("shows an invalid-link banner for not_found", () => {
    render(renderAuthorizeState({ state: "not_found" }));

    const banner = document.querySelector("s-banner");
    expect(banner).toHaveAttribute("tone", "critical");
    expect(banner).toHaveAttribute(
      "heading",
      "This link is invalid or expired",
    );
  });

  it("shows an expired-link banner for expired", () => {
    render(renderAuthorizeState({ state: "expired" }));

    const banner = document.querySelector("s-banner");
    expect(banner).toHaveAttribute("tone", "critical");
    expect(banner).toHaveAttribute("heading", "This pairing link has expired");
  });

  it("shows a declined banner for already_declined", () => {
    render(renderAuthorizeState({ state: "already_declined" }));

    const banner = document.querySelector("s-banner");
    expect(banner).toHaveAttribute("tone", "info");
    expect(banner).toHaveAttribute(
      "heading",
      "This pairing request was declined",
    );
  });

  it("shows a success banner naming the source shop and group for already_approved", () => {
    render(
      renderAuthorizeState({
        state: "already_approved",
        sourceShop: "source.myshopify.com",
        groupName: "EU stores",
      }),
    );

    const banner = document.querySelector("s-banner");
    expect(banner).toHaveAttribute("tone", "success");
    expect(banner).toHaveAttribute(
      "heading",
      "Already paired with source.myshopify.com",
    );
    expect(screen.getByText(/EU stores/)).toBeInTheDocument();
  });

  it("shows the approve form for pending", () => {
    // <Form> needs router context (useHref/useSubmit) that a bare render()
    // doesn't provide — createRoutesStub is the same pattern
    // ConnectStoreForm.test.tsx uses for the same reason.
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () =>
          renderAuthorizeState({
            state: "pending",
            token: "tok",
            sourceShop: "source.myshopify.com",
            groupName: null,
          }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    const button = document.querySelector('s-button[type="submit"]');
    expect(button).toHaveTextContent("Approve pairing");
    const notNow = document.querySelector('s-button[href="/app/stores"]');
    expect(notNow).toHaveTextContent("Not now");
    expect(document.querySelector("s-banner")).not.toBeInTheDocument();
  });

  it("shows the action error alongside the form when approval fails", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () =>
          renderAuthorizeState(
            {
              state: "pending",
              token: "tok",
              sourceShop: "source.myshopify.com",
              groupName: null,
            },
            "This pairing link is invalid, expired, or already used.",
          ),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(document.querySelector("s-banner")).toHaveAttribute(
      "heading",
      "This pairing link is invalid, expired, or already used.",
    );
    expect(
      document.querySelector('s-button[type="submit"]'),
    ).toBeInTheDocument();
  });
});
