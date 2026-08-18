import { test as base, expect } from "@playwright/test";
import { signSessionToken } from "./session-token";
import {
  seedOfflineSession,
  deleteSession,
  disconnectSessionStore,
} from "./shopify-session";

/**
 * A fake, e2e-only shop domain — never a real store. Seeded and torn down
 * per test so runs don't leak state into each other.
 */
export const TEST_SHOP = "storebridge-e2e-test.myshopify.com";

interface EmbeddedFixtures {
  /** A valid, freshly-signed session token for TEST_SHOP. */
  sessionToken: string;
  /**
   * Extra HTTP headers carrying the session token — pass to
   * `request.get(url, { headers })` (or `context.setExtraHTTPHeaders`) so
   * `authenticate.admin()` finds it via the Authorization header, matching
   * how App Bridge attaches it in the real embedded app.
   */
  authHeaders: Record<string, string>;
}

export const test = base.extend<EmbeddedFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright's fixture API requires this destructure shape
  sessionToken: async ({}, use) => {
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecretKey = process.env.SHOPIFY_API_SECRET;
    if (!apiKey || !apiSecretKey) {
      throw new Error(
        "SHOPIFY_API_KEY / SHOPIFY_API_SECRET must be set to run embedded-app e2e tests " +
          "(any test values work — nothing here calls the real Shopify API).",
      );
    }

    const sessionId = await seedOfflineSession(TEST_SHOP);
    const token = signSessionToken({ shop: TEST_SHOP, apiKey, apiSecretKey });
    await use(token);
    await deleteSession(sessionId);
  },

  authHeaders: async ({ sessionToken }, use) => {
    await use({ Authorization: `Bearer ${sessionToken}` });
  },
});

// One PrismaClient is shared across every test in this worker (module-level
// singleton in shopify-session.ts) — close it once after the last test runs
// instead of per-test, or a still-open handle can make `playwright test`
// hang/flap on exit.
test.afterAll(async () => {
  await disconnectSessionStore();
});

export { expect };
