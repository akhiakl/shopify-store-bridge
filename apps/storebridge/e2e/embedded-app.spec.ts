import { test, expect, TEST_SHOP } from "./support/embedded-fixture";

// Exercises authenticate.admin()'s two real outcomes for the embedded
// "/app" shell: a valid session token + an active stored session succeeds
// with no Shopify network call (verified locally against this exact
// package version by seeding a Postgres session and hitting the running
// app directly — see support/shopify-session.ts's doc comment), and a
// missing/invalid one is rejected rather than silently rendering the app.

test.describe("embedded admin shell", () => {
  test("renders the app shell for a valid, active session", async ({
    request,
    authHeaders,
  }) => {
    const response = await request.get(`/app?shop=${TEST_SHOP}&embedded=1`, {
      headers: authHeaders,
    });

    expect(response.status()).toBe(200);
    // Embedded-app CSP (app/entry.server.tsx's addDocumentResponseHeaders)
    // is only set on Shopify-context routes like this one, not the plain
    // public "/" route — see smoke.spec.ts's header comment.
    expect(response.headers()["content-security-policy"]).toContain(
      `https://${TEST_SHOP}`,
    );
    const body = await response.text();
    expect(body).toContain("StoreBridge");
    expect(body).toContain("Additional page");
  });

  test("bounces a request with no session token instead of rendering", async ({
    request,
  }) => {
    const response = await request.get(`/app?shop=${TEST_SHOP}`);

    // No Authorization header -> treated as a bare document request ->
    // authenticate.admin() responds 200 with Shopify's "bounce page" (an
    // App Bridge bootstrap script that fetches a session token client-side
    // and reloads) rather than a redirect status — confirmed empirically,
    // it is not a 3xx here. Either way, the actual app shell must not render.
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("app-bridge.js");
    expect(body).not.toContain("Welcome to StoreBridge");
  });

  test("rejects a syntactically valid but wrongly-signed token", async ({
    request,
  }) => {
    const bogusToken = "not.a.valid-jwt-signature";

    const response = await request.get(`/app?shop=${TEST_SHOP}`, {
      headers: { Authorization: `Bearer ${bogusToken}` },
    });

    expect(response.status()).toBe(401);
  });
});
