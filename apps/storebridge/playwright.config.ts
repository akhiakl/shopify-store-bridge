import { defineConfig, devices } from "@playwright/test";

/**
 * Requires, in the environment before running `pnpm run test:e2e`:
 *   DATABASE_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SCOPES,
 *   SHOPIFY_APP_URL — same variables as `.env.example`. Any values work
 * for SHOPIFY_API_KEY/SECRET (nothing here calls the real Shopify API —
 * see e2e/support/embedded-fixture.ts); DATABASE_URL needs a real,
 * migrated Postgres database (`pnpm exec drizzle-kit migrate` first — a
 * disposable one is fine, tests only touch the Session table).
 */
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Assumes `pnpm run build` already ran — see the test:e2e turbo task
    // (dependsOn: ["build"]) rather than rebuilding on every test run here.
    command: "pnpm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: String(PORT), NODE_ENV: "production" },
  },
});
