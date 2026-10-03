import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

const { getPendingRequestByToken, approvePairingRequest } = vi.hoisted(() => ({
  getPendingRequestByToken: vi.fn(),
  approvePairingRequest: vi.fn(),
}));
vi.mock("~/routes/app.stores/pairing.server", () => ({
  getPendingRequestByToken,
  approvePairingRequest,
}));

const {
  loader,
  action,
  default: AuthorizePairing,
} = await import("./app.stores_.authorize");

const SHOP = "target-shop.myshopify.com";

function loaderRequest(token: string) {
  return new Request(
    `https://example.myshopify.com/app/stores/authorize?token=${token}`,
  );
}

describe("app.stores.authorize loader", () => {
  it("returns ok:false when the token doesn't resolve to a pending request", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPendingRequestByToken.mockResolvedValue(null);

    const result = await loader({
      request: loaderRequest("bad"),
      params: {},
      context: {},
    } as never);

    expect(getPendingRequestByToken).toHaveBeenCalledWith("bad", SHOP);
    expect(result).toEqual({ ok: false });
  });

  it("returns the source shop and group name for a valid token", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: SHOP } });
    getPendingRequestByToken.mockResolvedValue({
      group: { name: "EU stores", source: { shop: "source.myshopify.com" } },
    });

    const result = await loader({
      request: loaderRequest("good"),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({
      ok: true,
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

describe("AuthorizePairing page", () => {
  it("shows the invalid/expired banner when the loader finds no pending request", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: AuthorizePairing,
        loader: () => ({ ok: false }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "This link is invalid or expired",
      ),
    );
  });

  it("renders the Approve/Not now button group for a valid pending request", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: AuthorizePairing,
        loader: () => ({
          ok: true,
          token: "good",
          sourceShop: "source.myshopify.com",
          groupName: "EU stores",
        }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    expect(await screen.findByText("Approve pairing")).toBeInTheDocument();
    expect(screen.getByText("Not now")).toHaveAttribute("href", "/app/stores");
  });

  it("shows a success banner once the approve action succeeds", async () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: AuthorizePairing,
        loader: () => ({
          ok: true,
          token: "good",
          sourceShop: "source.myshopify.com",
          groupName: null,
        }),
        action: () => ({ ok: true }),
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    const approveButton = await screen.findByText("Approve pairing");
    fireEvent.submit(approveButton.closest("form") as HTMLFormElement);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "Pairing approved",
      ),
    );
  });

  it("surfaces the action's specific error when approving fails", async () => {
    // Mirrors the real route: a failed approve means the underlying
    // request is no longer PENDING/unexpired, so the loader's own
    // revalidation after the action also flips to ok:false — the
    // component has to rely on actionData.error for the specific reason.
    let responded = false;
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: AuthorizePairing,
        loader: () =>
          responded
            ? { ok: false }
            : {
                ok: true,
                token: "good",
                sourceShop: "source.myshopify.com",
                groupName: null,
              },
        action: () => {
          responded = true;
          return {
            ok: false,
            error: "This pairing link is invalid, expired, or already used.",
          };
        },
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    const approveButton = await screen.findByText("Approve pairing");
    fireEvent.submit(approveButton.closest("form") as HTMLFormElement);

    await waitFor(() =>
      expect(document.querySelector("s-banner")).toHaveAttribute(
        "heading",
        "This pairing link is invalid, expired, or already used.",
      ),
    );
  });
});
