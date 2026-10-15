import { render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateAdmin, billing } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  billing: { check: vi.fn(), request: vi.fn(), cancel: vi.fn() },
}));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));
vi.mock("~/utils/billing/paidPlan.server", () => ({
  billingIsTest: () => true,
}));

const { loader, action, default: Plan } = await import("./route");

function post(fields: Record<string, string>) {
  return {
    request: new Request("https://example.com/app/plan", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdmin.mockResolvedValue({ billing });
});

describe("plan loader", () => {
  it("returns the active Pro subscription", async () => {
    billing.check.mockResolvedValue({
      appSubscriptions: [{ id: "gid://sub/1", test: true, name: "x" }],
    });
    expect(
      await loader({ request: new Request("https://x") } as never),
    ).toEqual({
      subscription: { id: "gid://sub/1", test: true },
    });
    expect(billing.check).toHaveBeenCalledWith({
      plans: ["StoreBridge Pro"],
      isTest: true,
    });
  });

  it("returns no subscription on the free plan", async () => {
    billing.check.mockResolvedValue({ appSubscriptions: [] });
    expect(
      await loader({ request: new Request("https://x") } as never),
    ).toEqual({
      subscription: null,
    });
  });
});

describe("plan action", () => {
  it("requests the Pro plan on upgrade", async () => {
    billing.request.mockResolvedValue("redirected");
    expect(await action(post({ intent: "upgrade" }))).toBe("redirected");
    expect(billing.request).toHaveBeenCalledWith({
      plan: "StoreBridge Pro",
      isTest: true,
    });
  });

  it("cancels the subscription, prorated", async () => {
    expect(
      await action(post({ intent: "cancel", subscriptionId: "gid://sub/1" })),
    ).toEqual({ ok: true });
    expect(billing.cancel).toHaveBeenCalledWith({
      subscriptionId: "gid://sub/1",
      isTest: true,
      prorate: true,
    });
  });

  it("rejects an unknown intent", async () => {
    await expect(action(post({ intent: "nope" }))).rejects.toMatchObject({
      init: { status: 400 },
    });
  });
});

function renderWith(subscription: { id: string; test: boolean } | null) {
  const Stub = createRoutesStub([
    { path: "/app/plan", Component: Plan, loader: () => ({ subscription }) },
  ]);
  return render(<Stub initialEntries={["/app/plan"]} />);
}

describe("Plan page", () => {
  it("offers the upgrade on the free plan", async () => {
    renderWith(null);
    await waitFor(() =>
      expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument(),
    );
    expect(
      document.querySelector(
        's-section[heading="Pro: $9.99 USD every 30 days"]',
      ),
    ).not.toBeNull();
    expect(screen.getByText("Current plan")).toHaveAttribute("tone", "info");
  });

  it("shows Pro as current, with a test badge and cancel", async () => {
    renderWith({ id: "gid://sub/1", test: true });
    await waitFor(() =>
      expect(screen.getByText("Test charge")).toBeInTheDocument(),
    );
    expect(screen.getByText("Current plan")).toHaveAttribute("tone", "success");
    expect(screen.getAllByText("Cancel Pro").length).toBeGreaterThan(0);
    expect(screen.queryByText("Upgrade to Pro")).not.toBeInTheDocument();
  });
});
