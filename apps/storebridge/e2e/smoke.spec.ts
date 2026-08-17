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
      page.getByRole("heading", { name: /a short heading/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/shop domain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
  });

  test("redirects to /app when a shop param is present", async ({ page }) => {
    const response = await page.goto(
      "/?shop=storebridge-e2e-test.myshopify.com",
    );

    // The redirect target (/app) itself requires a session and will bounce
    // further — the loader-level redirect from "/" is what this test
    // verifies, not the full embedded-auth flow (see embedded-app.spec.ts).
    expect(new URL(page.url()).pathname).toBe("/app");
    expect(response?.ok()).toBe(true);
  });
});
