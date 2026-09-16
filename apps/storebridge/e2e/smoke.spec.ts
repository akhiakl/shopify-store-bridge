import { test, expect } from "@playwright/test";

// Covers what's reachable without a real Shopify session: the public
// landing route and its two loader branches. (The embedded CSP header
// from app/entry.server.tsx is only set on Shopify-context routes, not
// this plain public one — confirmed empirically; see embedded-app.spec.ts
// for that assertion instead.)

test.describe("public landing route", () => {
  test("renders the install form when no shop param is present", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /store definitions, in sync/i }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /pair shopify stores and keep their metaobject and metafield definitions in sync\./i,
      ),
    ).toBeVisible();
    await expect(page.getByLabel(/shop domain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
  });

  test("redirects to /app when a shop param is present", async ({
    request,
  }) => {
    // Uses the API-only `request` fixture, not `page.goto`, and stops at
    // the first hop: a real browser continuing past /app's 200 "bounce
    // page" response actually *executes* its inline app-bridge.js script,
    // which performs its own further client-side redirect to Shopify's
    // real (external) admin login for the shop — behavior that depends on
    // whether cdn.shopify.com is reachable from the test runner, which
    // differs by environment. What this test claims to verify is our own
    // loader's server-side redirect, so stop there.
    const response = await request.get(
      "/?shop=storebridge-e2e-test.myshopify.com",
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(
      "/app?shop=storebridge-e2e-test.myshopify.com",
    );
  });
});
